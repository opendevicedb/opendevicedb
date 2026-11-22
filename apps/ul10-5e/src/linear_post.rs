//! CPU K3 reduction/log/DTGC followed by K4 channel reformatting. Packed
//! components are mathematical lanes, not colors or calibrated anatomy.
use crate::{
    Result,
    linear_dsp::{Assets, C},
};
use serde_json::{Value, json};

const GROUPS: usize = 40;
const HEIGHT: usize = 1040;
pub(crate) const M: [usize; 6] = [2, 3, 4, 5, 6, 7];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Settings {
    pub gain: f32,
    pub dynamic_range: f32,
    pub tgc: [f32; 6],
}
impl Settings {
    pub fn from_json(value: &Value) -> Result<Self> {
        let object = value.as_object().ok_or("Post settings must be an object")?;
        let keys = ["schema_version", "gain", "dynamic_range", "tgc"];
        if object.len() != keys.len()
            || object.keys().any(|k| !keys.contains(&k.as_str()))
            || value["schema_version"] != "linear-postprocess-settings-v1"
        {
            return Err("Require exact linear-postprocess-settings-v1 fields".into());
        }
        let number = |v: &Value| {
            v.as_f64()
                .map(|v| v as f32)
                .ok_or("Numeric post setting required")
        };
        let values = value["tgc"]
            .as_array()
            .ok_or("Six explicit TGC values required")?;
        if values.len() != 6 {
            return Err("Exactly six TGC values required".into());
        }
        let mut tgc = [0.; 6];
        for (i, v) in values.iter().enumerate() {
            tgc[i] = number(v)?;
        }
        let settings = Self {
            gain: number(&value["gain"])?,
            dynamic_range: number(&value["dynamic_range"])?,
            tgc,
        };
        settings.validate()?;
        Ok(settings)
    }
    fn validate(self) -> Result<()> {
        if !self.gain.is_finite()
            || !(0.0..=100.0).contains(&self.gain)
            || !self.dynamic_range.is_finite()
            || !(0.0..=100.0).contains(&self.dynamic_range)
            || self.dynamic_range == 0.0
            || self
                .tgc
                .iter()
                .any(|v| !v.is_finite() || !(-15.0..=15.0).contains(v))
            || !(90.3 / self.dynamic_range * 0.0625).is_finite()
        {
            return Err(
                "Require finite gain0..100, DR>0..100 with finite scale, six TGC -15..15".into(),
            );
        }
        Ok(())
    }
    pub fn json(self) -> Value {
        json!({"schema_version":"linear-postprocess-settings-v1","gain":self.gain,"dynamic_range":self.dynamic_range,"tgc":self.tgc})
    }
}

pub struct Processor {
    depth: usize,
    curve: [f32; HEIGHT],
    gain: f32,
    dr: f32,
    settings: Settings,
    assets: Value,
}
impl Processor {
    pub fn new(assets: &Assets, settings: Settings) -> Result<Self> {
        Self::build(
            assets.configuration().depth_index(),
            *assets.post_dtgc(),
            settings,
            assets.provenance(),
        )
    }
    fn build(depth: usize, post: [i16; 265], settings: Settings, assets: Value) -> Result<Self> {
        settings.validate()?;
        if depth >= 6 {
            return Err("Post stage supports only the six verified linear depths".into());
        }
        let m = M[depth];
        if m * 519 + m + 4 >= 2 * C[depth] {
            return Err("Reduction reads outside computed envelope".into());
        }
        let curve = std::array::from_fn(|j| {
            let x = (m * j) as f32 / 52.0;
            let k = x.trunc() as usize;
            let base = post[1 + k] as f32
                + x.fract() * (post[2 + k] as f32 - post[1 + k] as f32)
                + post[257 + depth] as f32;
            let tgc = if j < 86 {
                settings.tgc[0]
            } else if j >= 951 {
                settings.tgc[5]
            } else {
                let u = (j - 86) as f32 / 173.0;
                let i = u.trunc() as usize;
                settings.tgc[i] + u.fract() * (settings.tgc[i + 1] - settings.tgc[i])
            };
            base + 45.3554 * tgc
        });
        Ok(Self {
            depth,
            curve,
            gain: settings.gain / 100.0 * post[0] as f32,
            dr: 90.3 / settings.dynamic_range * 0.0625,
            settings,
            assets,
        })
    }
    pub fn shape(&self) -> [usize; 3] {
        [GROUPS, 2 * C[self.depth], 4]
    }
    pub fn report(&self) -> Value {
        json!({"steps":["K3-reduction-log-DTGC","K4-lane-reformat"],"depth_index":self.depth,"reduction_M":M[self.depth],
            "settings":self.settings.json(),"assets":self.assets,"source_shape":self.shape(),
            "A_shape_y_x_components":[HEIGHT,GROUPS,4],"native_A_width":64,"A_export":"only computed40columns, row-major; unwritten24columns omitted",
            "B_shape_y_x_components":[320,160,4],"quantization":"saturate normalized0..1, binary32 multiply255 then round ties to even to u8; K4 preserves quantized bytes",
            "numeric_policy":"host sequential binary32, log2; no GPU bit-equivalence claim",
            "input_policy":"reject negative/nonfinite envelope and numeric overflow; zero amplitude maps to zero",
            "image_decoded":false,"gpu_equivalence_validated":false,"physical_calibration":null,
            "temporal_processing_performed":false,"SRI_performed":false,"geometry_performed":false})
    }
    pub fn process(&self, input: &[[f32; 4]]) -> Result<Output> {
        let rows = self.shape()[1];
        if input.len() != GROUPS * rows
            || input.iter().flatten().any(|v| !v.is_finite() || *v < 0.0)
        {
            return Err(
                "Exact packed envelope shape with finite nonnegative values required".into(),
            );
        }
        let mut a = vec![0; HEIGHT * GROUPS * 4];
        let mut zeros = 0u64;
        let mut low = 0u64;
        let mut high = 0u64;
        for g in 0..GROUPS {
            for x in 0..520 {
                for lane in 0..4 {
                    let start = g * rows + M[self.depth] * x + 2;
                    let values = reduce(M[self.depth], |j| input[start + j][lane]);
                    for (parity, amplitude) in values.into_iter().enumerate() {
                        let byte = if amplitude == 0.0 {
                            zeros += 1;
                            low += 1;
                            0
                        } else {
                            if !amplitude.is_finite() || amplitude < 0.0 {
                                return Err("K3 reduction overflow or negative amplitude".into());
                            }
                            let v = ((273.0667 * amplitude.log2()
                                + self.curve[2 * x + parity]
                                + self.gain
                                - 1600.0)
                                * self.dr
                                + 100.5)
                                / 255.0;
                            if !v.is_finite() {
                                return Err("K3 logarithmic scaling overflow".into());
                            }
                            if v <= 0.0 {
                                low += 1;
                            }
                            if v >= 1.0 {
                                high += 1;
                            }
                            unorm(v)
                        };
                        a[((2 * x + parity) * GROUPS + g) * 4 + lane] = byte;
                    }
                }
            }
        }
        let b = reformat(&a);
        Ok(Output {
            a,
            b,
            report: json!({"zero_reduced_amplitudes":zeros,"clipped_low":low,"clipped_high":high,
            "computed_components":HEIGHT*GROUPS*4,"input_shape":self.shape(),"processing":self.report()}),
        })
    }
}
pub(crate) fn unorm(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round_ties_even() as u8
}
fn reduce(m: usize, e: impl Fn(usize) -> f32) -> [f32; 2] {
    let h = m / 2;
    let q = m.div_ceil(2);
    let mut out = [0.0; 2];
    for (p, range) in [(0, 0..h), (1, q..m)] {
        for j in range {
            out[p] += (3.0 * e(j) + 7.0 * e(j + 1) + 5.0 * e(j + 2) + e(j + 3)) / 8.0;
        }
    }
    if m % 2 == 1 {
        out[0] += (e(h) + 2.0 * e(h + 1) + e(h + 2)) / 4.0;
        out[1] += (e(h) + 3.0 * e(h + 1) + 3.0 * e(h + 2) + e(h + 3)) / 8.0;
    }
    [out[0] / m as f32, out[1] / m as f32]
}
fn reformat(a: &[u8]) -> Vec<u8> {
    let mut b = vec![0; 320 * 160 * 4];
    for y in 0..320 {
        for x in 0..160 {
            for component in 0..4 {
                let row = (260 * component as i32 + y as i32 - 30).clamp(0, 1039) as usize;
                b[(y * 160 + x) * 4 + component] = a[(row * GROUPS + x / 4) * 4 + x % 4];
            }
        }
    }
    b
}
pub struct Output {
    pub a: Vec<u8>,
    pub b: Vec<u8>,
    pub report: Value,
}
