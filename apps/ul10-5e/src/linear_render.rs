//! Linear enhancement0 temporal/spatial raster candidate. Uniform-mask access
//! is an explicit portability policy: no native SRI_N initialization is assumed.
use crate::{
    Result,
    linear_dsp::Assets,
    linear_post::{M, unorm},
};
use serde_json::{Value, json};

pub const PACKED_BYTES: usize = 320 * 160 * 4;
pub const POLICY: &str = "uniform-mask-portability-v1";
#[derive(Clone)]
pub struct CorrelationTable {
    pub(crate) values: [f32; 9],
    pub(crate) provenance: Value,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Settings {
    pub width: usize,
    pub height: usize,
    pub correlation_index: usize,
}
impl Settings {
    pub fn from_json(value: &Value) -> Result<Self> {
        let object = value
            .as_object()
            .ok_or("Render settings must be an object")?;
        let keys = [
            "schema_version",
            "width",
            "height",
            "correlation_index",
            "enhancement",
            "temporal_policy",
            "preview_palette",
        ];
        if object.len() != keys.len()
            || object.keys().any(|k| !keys.contains(&k.as_str()))
            || value["schema_version"] != "linear-render-settings-v1"
            || value["enhancement"] != 0
            || value["temporal_policy"] != POLICY
            || value["preview_palette"] != "linear-gray"
        {
            return Err("Require exact linear-render-settings-v1, enhancement0, explicit uniform-mask-portability-v1 and linear-gray".into());
        }
        let get = |key: &str| {
            value[key]
                .as_u64()
                .and_then(|v| usize::try_from(v).ok())
                .ok_or_else(|| format!("{key} must be an unsigned integer"))
        };
        let s = Self {
            width: get("width")?,
            height: get("height")?,
            correlation_index: get("correlation_index")?,
        };
        s.validate()?;
        Ok(s)
    }
    pub(crate) fn validate(self) -> Result<()> {
        if !(64..=2048).contains(&self.width)
            || !(64..=2048).contains(&self.height)
            || !self.height.is_multiple_of(4)
            || self.correlation_index > 8
        {
            return Err(
                "Require width/height64..2048, height multiple4, correlation index0..8".into(),
            );
        }
        Ok(())
    }
    pub fn json(self) -> Value {
        json!({"schema_version":"linear-render-settings-v1","width":self.width,"height":self.height,
        "correlation_index":self.correlation_index,"enhancement":0,"temporal_policy":POLICY,"preview_palette":"linear-gray"})
    }
}
#[derive(Clone, Copy)]
struct Axis {
    lo: i32,
    fraction: f32,
}
fn axis(normalized: f32, size: usize) -> Axis {
    let value = normalized * size as f32 - 0.5;
    let floor = value.floor();
    Axis {
        lo: floor as i32,
        fraction: value - floor,
    }
}
fn texel(bytes: &[u8], width: usize, height: usize, x: i32, y: i32, c: usize) -> f32 {
    if x < 0 || y < 0 || x >= width as i32 || y >= height as i32 {
        0.0
    } else {
        bytes[(y as usize * width + x as usize) * 4 + c] as f32 / 255.0
    }
}
fn bilinear(bytes: &[u8], width: usize, height: usize, x: Axis, y: Axis, c: usize) -> f32 {
    let a = x.fraction;
    let b = y.fraction;
    (1.0 - a) * (1.0 - b) * texel(bytes, width, height, x.lo, y.lo, c)
        + a * (1.0 - b) * texel(bytes, width, height, x.lo + 1, y.lo, c)
        + (1.0 - a) * b * texel(bytes, width, height, x.lo, y.lo + 1, c)
        + a * b * texel(bytes, width, height, x.lo + 1, y.lo + 1, c)
}
fn geometry(d: &[u8]) -> Vec<u8> {
    let mut image = vec![0; 280 * 320 * 4];
    for y in 0..280 {
        for x in 0..160 {
            for c in 0..4 {
                let a = texel(d, 160, 320, (x as i32 - 1).max(0), y as i32 + 25, c);
                let b = texel(d, 160, 320, x as i32, y as i32 + 25, c);
                let next = texel(d, 160, 320, (x as i32 + 1).min(159), y as i32 + 25, c);
                image[(y * 320 + 2 * x) * 4 + c] = unorm((a + next) * 0.1328125 + b * 0.734375);
                image[(y * 320 + 2 * x + 1) * 4 + c] = unorm((b + next) * 0.5);
            }
        }
    }
    image
}

/// Immutable configuration; construct a new instance on parameter changes.
/// State/history advance only after an exact whole B input has been accepted.
pub struct UniformMaskProcessor {
    settings: Settings,
    depth: usize,
    coefficient: f32,
    table: Value,
    state: u8,
    history: Vec<u8>,
    horizontal: Vec<Axis>,
    vertical: Vec<Axis>,
    scale_x: f32,
}
impl UniformMaskProcessor {
    pub fn new(assets: &Assets, table: CorrelationTable, settings: Settings) -> Result<Self> {
        Self::build(assets.configuration().depth_index(), table, settings)
    }
    fn build(depth: usize, table: CorrelationTable, settings: Settings) -> Result<Self> {
        settings.validate()?;
        if depth >= 6 {
            return Err("Render supports only the six verified linear depths".into());
        }
        let scale_x = (M[depth] as f32 * settings.width as f32 * 10.0)
            / (0.5 * 80.0 * settings.height as f32);
        let horizontal = (0..settings.width)
            .map(|x| {
                axis(
                    (x as f32 + 0.5) / settings.width as f32 * scale_x + (1.0 - scale_x) / 2.0,
                    320,
                )
            })
            .collect();
        let band = settings.height / 4;
        let vertical = (0..band)
            .map(|j| {
                axis(
                    (j as f32 + 0.5) * 26.0 / (28.0 * band as f32) + 1.0 / 56.0,
                    280,
                )
            })
            .collect();
        Ok(Self {
            settings,
            depth,
            coefficient: table.values[settings.correlation_index],
            table: table.provenance,
            state: 0,
            history: vec![0; PACKED_BYTES],
            horizontal,
            vertical,
            scale_x,
        })
    }
    pub fn restore(&mut self, state: u8, history: &[u8]) -> Result<()> {
        if self.state != 0 || !matches!(state, 1 | 2) || history.len() != PACKED_BYTES {
            return Err(
                "Restore requires fresh processor, saved state1/2 and exact packed history".into(),
            );
        }
        self.state = state;
        self.history.copy_from_slice(history);
        Ok(())
    }
    /// Software state reset only. Native Freeze likewise resets the warmup
    /// state; no acoustic/USB action or invented SRI_N value is implied.
    pub fn reset_software_state(&mut self) {
        self.state = 0;
    }
    pub fn report(&self) -> Value {
        json!({"settings":self.settings.json(),"depth_index":self.depth,"correlation_table":self.table,
        "temporal_policy":POLICY,"native_SRI_N_assumed":null,"active_SRI_supported":false,"coefficient_quantization":"UNORM8 round-even then byte/255",
        "history_shape_y_x_components":[320,160,4],"geometry_shape_y_x_components":[280,320,4],"scaleX":self.scale_x,
        "geometry_units":"software sampling only; not pixel-to-mm calibration","final_sampler":"normalized bilinear, black border; not clamp-to-edge",
        "numerical_policy":"sequential host binary32 and round-even UNORM8; no GPU bit-equivalence claim",
        "preview_palette":"own linear grayscale of output indices; manufacturer palette not applied","image_decoded":false,
        "h4_validated":false,"physical_calibration":null})
    }
    pub fn process(&mut self, b: &[u8]) -> Result<Output> {
        if b.len() != PACKED_BYTES {
            return Err("Expected exact320x160x4 quantized B input; state unchanged".into());
        }
        let before = self.state;
        let after = if before == 0 { 1 } else { 2 };
        let mask = if after < 2 {
            0
        } else {
            unorm(self.coefficient)
        };
        let coefficient = mask as f32 / 255.0;
        let d: Vec<_> = self
            .history
            .iter()
            .zip(b)
            .map(|(&old, &new)| {
                unorm(old as f32 / 255.0 * coefficient + new as f32 / 255.0 * (1.0 - coefficient))
            })
            .collect();
        let (c, raster) = spatial_with_axes(&d, self.settings, &self.horizontal, &self.vertical);
        self.history.copy_from_slice(&d);
        self.state = after;
        Ok(Output {
            d,
            c,
            raster,
            temporal: json!({"state_before":before,"state_after":after,"warmup":after==1,
            "native_status_candidate":if after==1{-201}else{0},"software_frame_accepted":after==2,
            "effective_mask_byte":mask,"scope":"software portability policy, not a hardware status/ACK"}),
        })
    }
}
fn spatial_with_axes(
    d: &[u8],
    settings: Settings,
    horizontal: &[Axis],
    vertical: &[Axis],
) -> (Vec<u8>, Vec<u8>) {
    let c = geometry(d);
    let band = settings.height / 4;
    let mut raster = vec![0; settings.width * settings.height];
    for j in 0..band {
        for x in 0..settings.width {
            for component in 0..4 {
                raster[(j + component * band) * settings.width + x] = unorm(bilinear(
                    &c,
                    320,
                    280,
                    horizontal[x],
                    vertical[j],
                    component,
                ));
            }
        }
    }
    (c, raster)
}
pub(crate) fn spatial(depth: usize, settings: Settings, d: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    if d.len() != PACKED_BYTES {
        return Err("Spatial raster requires exact packed D".into());
    }
    let setup = UniformMaskProcessor::build(
        depth,
        CorrelationTable {
            values: [0.0; 9],
            provenance: Value::Null,
        },
        settings,
    )?;
    Ok(spatial_with_axes(
        d,
        settings,
        &setup.horizontal,
        &setup.vertical,
    ))
}
pub struct Output {
    pub d: Vec<u8>,
    pub c: Vec<u8>,
    pub raster: Vec<u8>,
    pub temporal: Value,
}
pub fn pgm(raster: &[u8], settings: Settings) -> Result<Vec<u8>> {
    settings.validate()?;
    if raster.len() != settings.width * settings.height {
        return Err("PGM requires exact raster shape".into());
    }
    let mut bytes = format!("P5\n{} {}\n255\n", settings.width, settings.height).into_bytes();
    bytes.extend_from_slice(raster);
    Ok(bytes)
}
