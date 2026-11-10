// SPDX-License-Identifier: AGPL-3.0-or-later
//! General convex DSC: native host geometry/LUT then original image math.
//! Private resource files only; explicit CPU normalized-border sampling policy.
use crate::{Result, archive, linear_post::unorm};
use serde_json::{Value, json};
use std::path::Path;
pub const SRI_BYTES: usize = 128 * 320 * 4;
pub const INTERP_BYTES: usize = 256 * 1024 * 4;
pub const POLICY: &str = "normalized-clamp-bilinear-f32-v1";
const GENERAL: [(&str, usize, &str); 4] = [
    (
        "A_Probe.bin",
        68,
        "9b8e95810fe33a085f2be2e58f082de9915cb3d7f66324d01145e4c211c2efcb",
    ),
    (
        "A_BF.bin",
        44,
        "28ed79893f9f224a7c1a29e2288491cb3bf224bbb3851d308c50e799b48dbdee",
    ),
    (
        "B_PRF.bin",
        388,
        "bf553725fc08bf50b6c4919ebc38d8cb8d648b8f03072a6d2da6fe32dcd84231",
    ),
    (
        "B_SRI.bin",
        352,
        "06822694c67a7c94168be168d86221301853e8ce8aba48c49fedd7b1cde2164b",
    ),
];
const MAPS: [(&str, usize, &str); 2] = [
    (
        "B_GrayMap.bin",
        8192,
        "157b02fd561b0a240bf81ddcd9005945cfeb7ae98e3b778f462cb0a145e7a5d4",
    ),
    (
        "B_TintMap.bin",
        9216,
        "f23838245b6f944fc9b3a42b76d5525f21821702fa19b52270369efc46adc037",
    ),
];
#[derive(Clone, Copy, Debug)]
pub struct Settings {
    pub depth: usize,
    pub width: usize,
    pub height: usize,
    pub gray: usize,
    pub tint: usize,
}
impl Settings {
    pub fn parse(v: &Value) -> Result<Self> {
        let keys = [
            "schema_version",
            "depth_index",
            "width",
            "height",
            "gray_map",
            "tint_map",
        ];
        let o = v.as_object().ok_or("Require explicit DSC settings")?;
        if o.len() != keys.len()
            || o.keys().any(|s| !keys.contains(&s.as_str()))
            || v["schema_version"] != "convex-dsc-settings-v1"
        {
            return Err("Require exact convex-dsc-settings-v1; no defaults".into());
        }
        let get = |s: &str| {
            v[s].as_u64()
                .and_then(|n| usize::try_from(n).ok())
                .ok_or_else(|| format!("Invalid DSC setting{s}"))
        };
        let s = Self {
            depth: get("depth_index")?,
            width: get("width")?,
            height: get("height")?,
            gray: get("gray_map")?,
            tint: get("tint_map")?,
        };
        s.validate()?;
        Ok(s)
    }
    fn validate(self) -> Result<()> {
        if self.depth > 7
            || self.width == 0
            || self.width > 2048
            || self.height == 0
            || self.height > 2048
            || self.gray > 8
            || self.tint > 8
        {
            return Err("Require depth0..7,width/height1..2048,gray/tint0..8".into());
        }
        Ok(())
    }
    pub fn json(self) -> Value {
        json!({"schema_version":"convex-dsc-settings-v1","depth_index":self.depth,"width":self.width,"height":self.height,"gray_map":self.gray,"tint_map":self.tint})
    }
}
fn load_group(
    dir: &dyn crate::resources::Source,
    group: &[(&str, usize, &str)],
) -> Result<(Vec<Vec<u8>>, Vec<Value>)> {
    let mut data = Vec::new();
    let mut rows = Vec::new();
    for (name, size, hash) in group {
        let b = dir.read(name, *size as u64)?;
        if b.len() != *size || archive::sha(&b) != *hash {
            return Err(format!(
                "Require complete known Plus General DSC input{name}"
            ));
        }
        rows.push(json!({"file":name,"bytes":size,"sha256":hash}));
        data.push(b)
    }
    Ok((data, rows))
}
fn word(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes(b[4 * i..4 * i + 4].try_into().unwrap())
}
fn fword(b: &[u8], i: usize) -> f32 {
    f32::from_bits(word(b, i))
}
fn hex(v: u32) -> String {
    v.to_le_bytes().iter().map(|b| format!("{b:02x}")).collect()
}
#[derive(Clone)]
pub struct Plan {
    sampling: std::sync::OnceLock<Sampling>,
    pub settings: Settings,
    pub parameters: Vec<u8>,
    pub map: Vec<u8>,
    pub dispatch: Vec<u8>,
    pub bindings: Value,
    pub recipe: Value,
    pub hostplan: Value,
    pub provenance: Value,
    pub sri_assets: Value,
}
impl Plan {
    pub(crate) fn from_selected(
        settings: Settings,
        parameters: [u8; 40],
        map: [u8; 1024],
    ) -> Result<Self> {
        settings.validate()?;
        if word(&parameters, 2) != settings.width as u32
            || word(&parameters, 3) != settings.height as u32
            || [6, 7, 8, 9]
                .iter()
                .any(|&i| !fword(&parameters, i).is_finite() || fword(&parameters, i) <= 0.)
            || map
                .as_chunks::<4>()
                .0
                .iter()
                .enumerate()
                .any(|(i, p)| p[3] != i as u8)
        {
            return Err("Invalid selected DSC profile".into());
        }
        Ok(Self {
            sampling: std::sync::OnceLock::new(),
            settings,
            parameters: parameters.to_vec(),
            map: map.to_vec(),
            dispatch: Vec::new(),
            bindings: json!([]),
            recipe: json!({"policy":POLICY}),
            hostplan: Value::Null,
            provenance: json!({"policy":"selected-memory-profile-v1"}),
            sri_assets: Value::Null,
        })
    }

    pub fn load(
        assets: &Path,
        maps: &Path,
        settings: Settings,
        custom: Option<&[u8]>,
    ) -> Result<Self> {
        Self::from_source(
            &crate::resources::Files(assets),
            &crate::resources::Files(maps),
            settings,
            custom,
            crate::Palette::Reference,
        )
    }
    pub fn from_source(
        assets: &dyn crate::resources::Source,
        maps: &dyn crate::resources::Source,
        settings: Settings,
        custom: Option<&[u8]>,
        palette: crate::Palette,
    ) -> Result<Self> {
        settings.validate()?;
        if (settings.gray == 8) != custom.is_some() || custom.is_some_and(|b| b.len() != 256) {
            return Err("Gray8 requires exactly256custom bytes; other gray selections require no custom curve".into());
        }
        let (a, asset_rows) = load_group(assets, &GENERAL)?;
        let (m, map_rows) = match palette {
            crate::Palette::Reference => load_group(maps, &MAPS)?,
            crate::Palette::LinearGray => {
                if settings.gray != 0 || settings.tint != 0 || custom.is_some() {
                    return Err("linear-gray-v1 requires gray0/tint0 and no custom curve".into());
                }
                (
                    Vec::new(),
                    vec![
                        json!({"generator":"linear-gray-v1","origin":"original arithmetic","license":"AGPL-3.0-or-later"}),
                    ],
                )
            }
        };
        if word(&a[0], 3) != 64
            || word(&a[0], 4) != 1
            || word(&a[0], 7) != 8
            || word(&a[1], 1) != 4
            || word(&a[1], 2) != 2
            || word(&a[1], 3) != 128
        {
            return Err("Unsupported known General DSC geometry/organization".into());
        }
        let depth = (word(&a[2], 1 + settings.depth) as i32 as f32) / 10.;
        // AArch64 FRINTP rounds toward positive infinity.
        let mut rounded = ((depth + depth).ceil() * 0.5).max(2.);
        if matches!(word(&a[0], 7), 8 | 16) {
            rounded = rounded.ceil()
        }
        let zoom = depth / rounded;
        let theta = (fword(&a[0], 0) / fword(&a[0], 1)) * word(&a[0], 3) as i32 as f32;
        let radius = fword(&a[0], 1) / (depth * 10.);
        let h = radius * (theta * 0.5).cos();
        if [depth, zoom, theta, radius, h]
            .iter()
            .any(|v| !v.is_finite() || *v <= 0.)
        {
            return Err("Invalid General DSC nominal geometry".into());
        }
        let words = [
            depth.to_bits(),
            0,
            settings.width as u32,
            settings.height as u32,
            0,
            0,
            zoom.to_bits(),
            theta.to_bits(),
            radius.to_bits(),
            h.to_bits(),
        ];
        let parameters = words.iter().flat_map(|v| v.to_le_bytes()).collect();
        let map = match palette {
            crate::Palette::LinearGray => crate::linear_gray_map(),
            crate::Palette::Reference => {
                let mut map = Vec::with_capacity(1024);
                for i in 0..256 {
                    let level = if let Some(curve) = custom {
                        curve[i]
                    } else {
                        m[0][settings.gray * 1024 + i * 4]
                    };
                    let offset = settings.tint * 1024 + level as usize * 4;
                    map.extend_from_slice(&m[1][offset..offset + 3]);
                    map.push(i as u8);
                }
                map
            }
        };
        let pre = [128u64, 256];
        let pre_local = [32u64, 1];
        let post = [
            settings.width.div_ceil(32) as u64 * 32,
            settings.height.div_ceil(8) as u64 * 8,
        ];
        let post_local = [32u64, 8];
        let dispatch = [pre, pre_local, post, post_local]
            .into_iter()
            .flatten()
            .flat_map(|v| v.to_le_bytes())
            .collect();
        let mut binding = Vec::new();
        for (kernel, name, args) in [
            ("0x4888", "DSC_pre", vec!["SRI_output", "0x48b0", "0x48a0"]),
            ("0x4898", "DSC_CP", vec!["0x48a0", "0x48a8"]),
        ] {
            for (i, source) in args.into_iter().enumerate() {
                binding.push(json!({"kernel_slot":kernel,"kernel":name,"argument":i,"bytes":8,"value":{"kind":"image_or_buffer","source":source}}))
            }
        }
        for (i, bits) in [
            h.to_bits(),
            radius.to_bits(),
            theta.to_bits(),
            zoom.to_bits(),
            settings.width as u32,
            settings.height as u32,
        ]
        .into_iter()
        .enumerate()
        {
            binding.push(json!({"kernel_slot":"0x4898","kernel":"DSC_CP","argument":i+2,"bytes":4,"value":{"kind":"scalar32","value_hex":hex(bits)}}))
        }
        let image = |w, h| json!({"width":w,"height":h,"channel_order":"CL_RGBA","channel_type":"CL_UNORM_INT8"});
        let hostplan = json!({"schema_version":"convex-dsc-oracle-config-v1","images":{"sri":image(128,320),"map":image(256,1),"interp":image(256,1024),"output":image(settings.width,settings.height)},"pre":{"global":pre,"local":pre_local},"post":{"kernel":"DSC_CP","global":post,"local":post_local,"arguments":{"W":settings.width,"H":settings.height,"h_bits":h.to_bits(),"R_bits":radius.to_bits(),"theta_bits":theta.to_bits(),"zoom_bits":zoom.to_bits()}}});
        let recipe = json!({"schema_version":"convex-dsc-recipe-v1","operations":[{"operation":"kernel","slot":"0x4888","name":"DSC_pre","global":pre,"local":pre_local,"dimensions":2},{"operation":"kernel","slot":"0x4898","name":"DSC_CP","global":post,"local":post_local,"dimensions":2},{"operation":"finish"}],"fully_written_images":["0x48a0","0x48a8","0x48b0"],"map_fourth_channel":"original intensity index0..255, not opacity","numeric_policy":POLICY,"physical_calibration":null,"native_geometry_only":true,"gpu_equivalence_validated":false});
        let sri_assets = json!([asset_rows[1], asset_rows[2], asset_rows[3]]);
        let provenance = json!({"profile":"Plus-UC5-2S_16-General-B4-T128-m2-type8","assets":asset_rows,"maps":map_rows,"custom_gray":custom.map(|b|json!({"bytes":b.len(),"sha256":archive::sha(b)})),"payload_embedded":false,"host_numeric_policy":"binary32 ordered/noFMA; FRINTPceil; cosfCPU substitution; prepared fresh host scalar block only","nominal_geometry_not_measured":true});
        Ok(Self {
            sampling: std::sync::OnceLock::new(),
            settings,
            parameters,
            map,
            dispatch,
            bindings: json!(binding),
            recipe,
            hostplan,
            provenance,
            sri_assets,
        })
    }
    pub fn files(&self) -> Vec<(String, Vec<u8>)> {
        vec![
            ("parameters.bin".into(), self.parameters.clone()),
            ("map.rgba".into(), self.map.clone()),
            ("dispatch.u64le".into(), self.dispatch.clone()),
            (
                "bindings.json".into(),
                serde_json::to_vec_pretty(&self.bindings).unwrap(),
            ),
            (
                "recipe.json".into(),
                serde_json::to_vec_pretty(&self.recipe).unwrap(),
            ),
            (
                "hostplan.json".into(),
                serde_json::to_vec_pretty(&self.hostplan).unwrap(),
            ),
        ]
    }
    pub fn process(&self, sri: &[u8]) -> Result<Outcome> {
        if sri.len() != SRI_BYTES {
            return Err("Require exact128x320RGBAUNORM8 SRI output".into());
        }
        let mut interp = vec![0; INTERP_BYTES];
        for y in 0..256 {
            for x in 0..128 {
                for c in 0..4 {
                    let a = nearest(sri, 128, 320, x as i32 - 2, y + 32, c);
                    let b = nearest(sri, 128, 320, x as i32 - 1, y + 32, c);
                    let d = nearest(sri, 128, 320, x as i32, y + 32, c);
                    let v0 = (a + d) * 0.1328125 + b * 0.734375;
                    let v1 = (b + d) * 0.5;
                    for (phase, v) in [v0, v1].into_iter().enumerate() {
                        let index = ((255. * v) as i32).clamp(0, 255) as usize;
                        let dst = ((y as usize + c * 256) * 256 + 2 * x + phase) * 4;
                        interp[dst..dst + 4].copy_from_slice(&self.map[4 * index..4 * index + 4]);
                    }
                }
            }
        }
        let width = self.settings.width;
        let height = self.settings.height;
        let key = [
            width as u32,
            height as u32,
            word(&self.parameters, 6),
            word(&self.parameters, 7),
            word(&self.parameters, 8),
            word(&self.parameters, 9),
        ];
        if self.sampling.get().is_none() {
            let _ = self.sampling.set(Sampling::new(key)?);
        }
        let cached = self.sampling.get().unwrap();
        // Plans are inspectable; never reuse geometry after a caller changes it.
        let changed;
        let sampling = if cached.key == key {
            cached
        } else {
            changed = Sampling::new(key)?;
            &changed
        };
        let gray = self
            .map
            .as_chunks::<4>()
            .0
            .iter()
            .all(|v| v[0] == v[1] && v[1] == v[2]);
        let mut output = vec![0; width * height * 4];
        for (pixel, sample) in sampling.pixels.iter().enumerate() {
            if sample.offsets[0] == u32::MAX && sample.offsets.iter().all(|&v| v == u32::MAX) {
                continue;
            }
            for c in 0..4 {
                if gray && (c == 1 || c == 2) {
                    output[pixel * 4 + c] = output[pixel * 4];
                    continue;
                }
                let value = |index: usize| {
                    if sample.offsets[index] == u32::MAX {
                        0.
                    } else {
                        interp[sample.offsets[index] as usize + c] as f32 / 255.
                    }
                };
                let a = sample.a;
                let d = sample.d;
                let top = value(0) * (1. - a) + value(1) * a;
                let bottom = value(2) * (1. - a) + value(3) * a;
                output[pixel * 4 + c] = unorm(top * (1. - d) + bottom * d);
            }
        }
        Ok(Outcome { interp, output })
    }
}
#[derive(Clone)]
struct Sample {
    offsets: [u32; 4],
    a: f32,
    d: f32,
}
#[derive(Clone)]
struct Sampling {
    key: [u32; 6],
    pixels: Vec<Sample>,
}
impl Sampling {
    fn new(key: [u32; 6]) -> Result<Self> {
        let width = key[0] as usize;
        let height = key[1] as usize;
        let [zoom, theta, radius, h] = [key[2], key[3], key[4], key[5]].map(f32::from_bits);
        let mut pixels = Vec::with_capacity(width * height);
        for y in 0..height {
            for x in 0..width {
                let xx = (((x as f32 + 0.5) - 0.5 * width as f32) / height as f32)
                    * (1. + radius - h)
                    * zoom;
                let yy = ((y as f32 + 0.5) / height as f32) * (1. + radius - h) * zoom + h;
                let u = (xx / yy).atan() / theta + 0.5;
                let v = xx.hypot(yy) - radius;
                let x = u * 256. - 0.5;
                let y = v * 1024. - 0.5;
                if !u.is_finite() || !v.is_finite() || !x.is_finite() || !y.is_finite() {
                    return Err("Nonfinite DSC coordinate; no image committed".into());
                }
                let mut sample = Sample {
                    offsets: [u32::MAX; 4],
                    a: 0.,
                    d: 0.,
                };
                if x > -1. && y > -1. && x < 256. && y < 1024. {
                    let ix = x.floor() as i32;
                    let iy = y.floor() as i32;
                    sample.a = x - ix as f32;
                    sample.d = y - iy as f32;
                    for (i, (x, y)) in [(ix, iy), (ix + 1, iy), (ix, iy + 1), (ix + 1, iy + 1)]
                        .into_iter()
                        .enumerate()
                    {
                        if (0..256).contains(&x) && (0..1024).contains(&y) {
                            sample.offsets[i] = ((y * 256 + x) * 4) as u32;
                        }
                    }
                }
                pixels.push(sample);
            }
        }
        Ok(Self { key, pixels })
    }
}
pub struct Outcome {
    pub interp: Vec<u8>,
    pub output: Vec<u8>,
}
fn nearest(b: &[u8], w: usize, h: usize, x: i32, y: i32, c: usize) -> f32 {
    let x = x.clamp(0, w as i32 - 1) as usize;
    let y = y.clamp(0, h as i32 - 1) as usize;
    b[(y * w + x) * 4 + c] as f32 / 255.
}
fn border(b: &[u8], w: usize, h: usize, x: i32, y: i32, c: usize) -> f32 {
    if x < 0 || y < 0 || x >= w as i32 || y >= h as i32 {
        0.
    } else {
        b[(y as usize * w + x as usize) * 4 + c] as f32 / 255.
    }
}
fn bilinear(b: &[u8], w: usize, h: usize, u: f32, v: f32, c: usize) -> Result<f32> {
    let x = u * w as f32 - 0.5;
    let y = v * h as f32 - 0.5;
    if !x.is_finite() || !y.is_finite() {
        return Err("DSC coordinate outside explicit CPU sampler domain".into());
    }
    // A footprint entirely outside the image is the zero border, even when
    // its finite coordinates cannot be represented as integer texel indices.
    if x <= -1. || y <= -1. || x >= w as f32 || y >= h as f32 {
        return Ok(0.);
    }
    let ix = x.floor() as i32;
    let iy = y.floor() as i32;
    let a = x - ix as f32;
    let d = y - iy as f32;
    let top = border(b, w, h, ix, iy, c) * (1. - a) + border(b, w, h, ix + 1, iy, c) * a;
    let bottom = border(b, w, h, ix, iy + 1, c) * (1. - a) + border(b, w, h, ix + 1, iy + 1, c) * a;
    Ok(top * (1. - d) + bottom * d)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalized_clamp_is_zero_border_not_edge() {
        let p = vec![200; 4];
        assert_eq!(bilinear(&p, 1, 1, 0., 0., 0).unwrap(), (200. / 255.) * 0.25);
        assert_eq!(bilinear(&p, 1, 1, 0.5, 0.5, 0).unwrap(), 200. / 255.);
        assert_eq!(bilinear(&p, 1, 1, -2., -2., 0).unwrap(), 0.);
        assert_eq!(bilinear(&p, 1, 1, 0.5, 1_186_408.8, 0).unwrap(), 0.);
        assert_eq!(bilinear(&p, 1, 1, -f32::MAX / 2., 0.5, 0).unwrap(), 0.);
        assert!(bilinear(&p, 1, 1, f32::NAN, 0., 0).is_err());
    }
    #[test]
    fn dimensions_and_palette_domains_are_explicit() {
        let mut j = json!({"schema_version":"convex-dsc-settings-v1","depth_index":0,"width":17,"height":19,"gray_map":8,"tint_map":8});
        assert!(Settings::parse(&j).is_ok());
        j["width"] = json!(0);
        assert!(Settings::parse(&j).is_err());
        j["width"] = json!(17);
        j["gray_map"] = json!(9);
        assert!(Settings::parse(&j).is_err());
        j["gray_map"] = json!(8);
        j["extra"] = json!(true);
        assert!(Settings::parse(&j).is_err());
    }
    #[test]
    fn cached_coordinates_match_scalar_sampler_and_invalidate_after_geometry_change() {
        let settings = Settings {
            depth: 0,
            width: 17,
            height: 19,
            gray: 0,
            tint: 0,
        };
        let mut parameters = [0u8; 40];
        for (i, value) in [
            (2, 17),
            (3, 19),
            (6, 1f32.to_bits()),
            (7, 0.8f32.to_bits()),
            (8, 0.5f32.to_bits()),
            (9, 0.2f32.to_bits()),
        ] {
            parameters[4 * i..4 * i + 4].copy_from_slice(&value.to_le_bytes());
        }
        let sri: Vec<u8> = (0..SRI_BYTES).map(|i| (i * 71 + i / 17) as u8).collect();
        for gray in [false, true] {
            let map = std::array::from_fn(|i| {
                let n = (i / 4) as u8;
                match i % 4 {
                    0 => n,
                    1 => {
                        if gray {
                            n
                        } else {
                            255 - n
                        }
                    }
                    2 => {
                        if gray {
                            n
                        } else {
                            n.wrapping_mul(13)
                        }
                    }
                    _ => n,
                }
            });
            let mut plan = Plan::from_selected(settings, parameters, map).unwrap();
            for zoom in [1f32, 0.75, 1.] {
                plan.parameters[24..28].copy_from_slice(&zoom.to_le_bytes());
                let actual = plan.process(&sri).unwrap();
                let [z, t, r, h] = [6, 7, 8, 9].map(|i| fword(&plan.parameters, i));
                let mut expected = Vec::new();
                for y in 0..settings.height {
                    for x in 0..settings.width {
                        let xx = (((x as f32 + 0.5) - 0.5 * settings.width as f32)
                            / settings.height as f32)
                            * (1. + r - h)
                            * z;
                        let yy = ((y as f32 + 0.5) / settings.height as f32) * (1. + r - h) * z + h;
                        let u = (xx / yy).atan() / t + 0.5;
                        let v = xx.hypot(yy) - r;
                        for c in 0..4 {
                            expected
                                .push(unorm(bilinear(&actual.interp, 256, 1024, u, v, c).unwrap()));
                        }
                    }
                }
                assert_eq!(actual.output, expected);
            }
        }
    }
}
