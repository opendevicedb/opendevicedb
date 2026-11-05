// SPDX-License-Identifier: AGPL-3.0-or-later
//! General B DTGC boundary only. Packed components and retained image columns
//! are explicit; this is not a scan-converted or calibrated ultrasound image.
use crate::{Result, archive, convex_bfsp, linear_post::unorm};
use serde_json::{Value, json};
use std::path::Path;

pub const WIDTH: usize = 64;
pub const IMAGE_BYTES: usize = WIDTH * convex_bfsp::SAMPLES * 4;
pub const RESHAPE_BYTES: usize = convex_bfsp::GROUPS * convex_bfsp::SAMPLES * 16;
const DTGC_SHA: &str = "234969cac6d53acb6bc3b13b62a6d559e9f19396c3c3518df165bdb9878f9044";

#[derive(Clone, Copy, Debug)]
pub struct Settings {
    pub bank_selector_0x48: usize,
    pub gain: f32,
    pub dynamic_range: f32,
    pub controls: [f32; 6],
}
impl Settings {
    pub fn from_json(v: &Value) -> Result<Self> {
        let keys = [
            "schema_version",
            "bank_selector_0x48",
            "gain",
            "dynamic_range",
            "tgc_controls",
        ];
        let o = v.as_object().ok_or("DTGC settings must be an object")?;
        if o.len() != keys.len()
            || o.keys().any(|k| !keys.contains(&k.as_str()))
            || v["schema_version"] != "convex-dtgc-settings-v1"
        {
            return Err("Require exact convex-dtgc-settings-v1 settings; no defaults".into());
        }
        let number = |n: &Value| -> Result<f32> {
            let x = n.as_f64().ok_or("Require finite numeric DTGC setting")? as f32;
            if !x.is_finite() {
                return Err("DTGC setting overflows binary32".into());
            }
            Ok(x)
        };
        let c = v["tgc_controls"]
            .as_array()
            .filter(|c| c.len() == 6)
            .ok_or("Require six explicit TGC controls")?;
        let mut controls = [0.; 6];
        for (out, value) in controls.iter_mut().zip(c) {
            *out = number(value)?;
        }
        let s = Self {
            bank_selector_0x48: v["bank_selector_0x48"]
                .as_u64()
                .and_then(|v| usize::try_from(v).ok())
                .ok_or("Invalid bank selector0x48")?,
            gain: number(&v["gain"])?,
            dynamic_range: number(&v["dynamic_range"])?,
            controls,
        };
        s.validate()?;
        Ok(s)
    }
    fn validate(self) -> Result<()> {
        if self.bank_selector_0x48 >= 3
            || !self.gain.is_finite()
            || !self.dynamic_range.is_finite()
            || self.dynamic_range <= 0.
            || self.controls.iter().any(|v| !v.is_finite())
        {
            return Err(
                "Require bank selector0..2, finite gain/controls and positive finite dynamic range"
                    .into(),
            );
        }
        Ok(())
    }
    pub fn json(self) -> Value {
        json!({"schema_version":"convex-dtgc-settings-v1","bank_selector_0x48":self.bank_selector_0x48,
            "gain":self.gain,"dynamic_range":self.dynamic_range,"tgc_controls":self.controls})
    }
}

pub struct Processor {
    tgc: [f32; 1024],
    depth: f32,
    gain: f32,
    dr: f32,
    provenance: Value,
}
impl Processor {
    pub(crate) fn selected(&self) -> ([f32; 1024], f32, f32, f32) {
        (self.tgc, self.depth, self.gain, self.dr)
    }
    pub(crate) fn from_selected(tgc: [f32; 1024], depth: f32, gain: f32, dr: f32) -> Result<Self> {
        if !(2.0..13.0).contains(&depth)
            || !gain.is_finite()
            || !dr.is_finite()
            || dr <= 0.
            || tgc.iter().any(|x| !x.is_finite())
        {
            return Err("Invalid selected DTGC profile".into());
        }
        Ok(Self {
            tgc,
            depth,
            gain,
            dr,
            provenance: json!({"policy":"selected-memory-profile-v1"}),
        })
    }

    pub fn load(
        directory: &Path,
        source: convex_bfsp::Settings,
        settings: Settings,
    ) -> Result<Self> {
        Self::from_source(&crate::resources::Files(directory), source, settings)
    }
    pub fn from_source(
        directory: &dyn crate::resources::Source,
        source: convex_bfsp::Settings,
        settings: Settings,
    ) -> Result<Self> {
        settings.validate()?;
        // Also validate the complete upstream group and selected native profile.
        let upstream = convex_bfsp::Assets::from_source(directory, source)?;
        let mut files = upstream.provenance()["files"].as_array().unwrap().clone();
        let bytes = directory.read("B_DTGC.bin", 6148)?;
        if bytes.len() != 6148 || archive::sha(&bytes) != DTGC_SHA {
            return Err("Require complete known General B_DTGC.bin".into());
        }
        files.push(json!({"name":"B_DTGC.bin","bytes":6148,"sha256":DTGC_SHA}));
        let table: Vec<f32> = bytes
            .as_chunks::<4>()
            .0
            .iter()
            .map(|v| f32::from_le_bytes(*v))
            .collect();
        // Exact hashes above establish p=2 and these B_PRF values for General.
        let depth = native_depth([60, 80, 100, 120, 140, 160, 200, 240][source.depth], 2);
        let mut p = Self::derive(&table, depth, source.selector, settings)?;
        p.provenance = json!({"profile":"Plus-UC5-2S_16-General-B4-T128-m2-type8","files":files,
            "depth_index":source.depth,"selector_index":source.selector,"bank_selector_0x48":settings.bank_selector_0x48,
            "coefficient_payload_copied":false});
        Ok(p)
    }
    fn derive(table: &[f32], depth: f32, selector: usize, settings: Settings) -> Result<Self> {
        settings.validate()?;
        if table.len() != 1537
            || table.iter().any(|v| !v.is_finite())
            || selector >= 2
            || !(2.0..13.0).contains(&depth)
        {
            return Err(
                "Only bounded General DTGC depth<13 and finite six-bank table supported".into(),
            );
        }
        let bank = 256 * (selector + 2 * settings.bank_selector_0x48);
        let gain = (settings.gain / 100.) * table[0];
        let dr = 255. / settings.dynamic_range;
        let tgc = std::array::from_fn(|j| {
            let u = (depth * j as f32) / 51.2;
            let k = u as usize;
            let base =
                table[bank + k + 1] + (u - k as f32) * (table[bank + k + 2] - table[bank + k + 1]);
            let correction = if j < 85 {
                settings.controls[0]
            } else if j >= 935 {
                settings.controls[5]
            } else {
                let t = (j - 85) as f32 / 170.;
                let i = t as usize;
                settings.controls[i]
                    + (t - i as f32) * (settings.controls[i + 1] - settings.controls[i])
            };
            // Native assembly adds base AFTER the interpolated correction.
            base + correction
        });
        if !gain.is_finite() || !dr.is_finite() || tgc.iter().any(|x| !x.is_finite()) {
            return Err("Nonfinite DTGC derived parameter".into());
        }
        Ok(Self {
            tgc,
            depth,
            gain,
            dr,
            provenance: Value::Null,
        })
    }
    pub fn provenance(&self) -> Value {
        self.provenance.clone()
    }
    pub fn report(&self) -> Value {
        json!({"native_depth_parameter":self.depth,"kernel_depth_argument_used":false,
            "gain_parameter":self.gain,"dr_parameter":self.dr,"dispatch":[1024,32],"local":[32,8],
            "image_shape_y_x_components":[1024,64,4],"written_columns":[0,32],"retained_columns":[32,64],
            "numeric_policy":"binary32 ordered operations without contraction; CL_UNORM_INT8 clamp and round ties to even",
            "host_lifecycle_reproduced":false,"upstream_banks_semantics_validated":false})
    }
    pub fn tgc_bytes(&self) -> Vec<u8> {
        self.tgc.iter().flat_map(|x| x.to_le_bytes()).collect()
    }
    pub fn process(&self, reshape: &[u8], prior_image: &[u8]) -> Result<Vec<u8>> {
        if reshape.len() != RESHAPE_BYTES || prior_image.len() != IMAGE_BYTES {
            return Err(
                "Require exact group-major32x1024float4 and full64x1024UNORM8 backing".into(),
            );
        }
        let mut out = prior_image.to_vec();
        for (i, b) in reshape.as_chunks::<4>().0.iter().enumerate() {
            let input = f32::from_le_bytes(*b);
            let group = i / (1024 * 4);
            let sample = (i / 4) % 1024;
            let value = (((input / 604. + self.tgc[sample]) + self.gain) - 33.88) * self.dr + 80.5;
            if !input.is_finite() || !value.is_finite() {
                return Err("Nonfinite DTGC sample/intermediate; no output returned".into());
            }
            out[(sample * WIDTH + group) * 4 + i % 4] = unorm((value / 255.).clamp(0., 1.));
        }
        Ok(out)
    }
}
fn native_depth(prf: i32, p: i32) -> f32 {
    let scaled = (prf as f32 / 10.) / p as f32;
    (((f64::from(scaled + scaled) + 0.99).trunc() as i32) as f32 * 0.5).max(2.)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn settings() -> Settings {
        Settings {
            bank_selector_0x48: 0,
            gain: 0.,
            dynamic_range: 255.,
            controls: [0.; 6],
        }
    }
    #[test]
    fn transpose_retains_full_unwritten_half() {
        let mut p = Processor::derive(&vec![0.; 1537], 3., 0, settings()).unwrap();
        p.tgc.fill(33.88);
        let input: Vec<u8> = (0..32 * 1024 * 4)
            .flat_map(|i| ((i % 4) as f32 * 604.).to_le_bytes())
            .collect();
        let old: Vec<u8> = (0..IMAGE_BYTES).map(|i| (i * 71 + 31) as u8).collect();
        let out = p.process(&input, &old).unwrap();
        for j in 0..1024 {
            for x in 0..64 {
                let k = (j * 64 + x) * 4;
                if x < 32 {
                    assert_eq!(&out[k..k + 4], &[80, 82, 82, 84]);
                } else {
                    assert_eq!(&out[k..k + 4], &old[k..k + 4]);
                }
            }
        }
    }
    #[test]
    fn tgc_control_knots_and_boundaries() {
        let mut s = settings();
        s.controls = [0., 1., 2., 3., 4., 5.];
        let p = Processor::derive(&vec![0.; 1537], 12., 1, s).unwrap();
        for (i, v) in [
            (0, 0.),
            (84, 0.),
            (85, 0.),
            (255, 1.),
            (425, 2.),
            (595, 3.),
            (765, 4.),
            (935, 5.),
            (1023, 5.),
        ] {
            assert_eq!(p.tgc[i], v);
        }
        assert!(p.tgc[934] < 5.);
        assert_eq!(native_depth(0, 2), 2.);
        assert_eq!(native_depth(240, 2), 12.);
    }
    #[test]
    fn explicit_settings_and_nonfinite_rejections() {
        let mut v = settings().json();
        assert!(Settings::from_json(&v).is_ok());
        v["extra"] = json!(1);
        assert!(Settings::from_json(&v).is_err());
        v.as_object_mut().unwrap().remove("extra");
        v["dynamic_range"] = json!(0);
        assert!(Settings::from_json(&v).is_err());
        let p = Processor::derive(&vec![0.; 1537], 3., 0, settings()).unwrap();
        let mut input = vec![0; RESHAPE_BYTES];
        input[..4].copy_from_slice(&f32::NAN.to_le_bytes());
        assert!(p.process(&input, &vec![0; IMAGE_BYTES]).is_err());
        assert!(p.process(&[], &vec![0; IMAGE_BYTES]).is_err());
        assert!(Processor::derive(&vec![0.; 1537], 13., 0, settings()).is_err());
    }
}
