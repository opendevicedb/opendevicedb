// SPDX-License-Identifier: AGPL-3.0-or-later
//! Selected General m2 compound with explicit native64 backing and a separate
//! trace of RDH writes outside that allocation. No undefined GPU effect inferred.
use crate::{Result, archive, convex_bfsp, convex_dtgc, linear_post::unorm};
use serde_json::{Value, json};
use std::path::Path;

pub const BYTES: usize = convex_dtgc::IMAGE_BYTES;
pub const POLICY: &str = "record-outside-native64-v1";
pub const STATE_FILES: [&str; 5] = [
    "history.u8",
    "output.u8",
    "diff.u8",
    "coefficient.u8",
    "rdh.u8",
];

#[derive(Clone)]
pub struct State {
    pub initialized: bool,
    pub history: Vec<u8>,
    pub output: Vec<u8>,
    pub diff: Vec<u8>,
    pub coefficient: Vec<u8>,
    pub rdh: Vec<u8>,
}
impl State {
    pub fn metadata(&self) -> Value {
        json!({"schema_version":"convex-compound-state-v1","history_initialized":self.initialized,"rdh_write_policy":POLICY})
    }
    pub fn from_bytes(metadata: &Value, files: [Vec<u8>; 5]) -> Result<Self> {
        let o = metadata
            .as_object()
            .ok_or("Require compound state metadata")?;
        if o.len() != 3
            || o.keys().any(|s| {
                !["schema_version", "history_initialized", "rdh_write_policy"].contains(&s.as_str())
            })
            || metadata["schema_version"] != "convex-compound-state-v1"
            || metadata["rdh_write_policy"] != POLICY
        {
            return Err(
                "Require exact compound state and explicit record-outside-native64-v1 policy"
                    .into(),
            );
        }
        let initialized = metadata["history_initialized"]
            .as_bool()
            .ok_or("Explicit boolean history_initialized required")?;
        if files.iter().any(|v| v.len() != BYTES) {
            return Err("Require five complete64x1024UNORM8 backing images".into());
        }
        let [history, output, diff, coefficient, rdh] = files;
        Ok(Self {
            initialized,
            history,
            output,
            diff,
            coefficient,
            rdh,
        })
    }
    pub fn files(&self) -> [(&'static str, &[u8]); 5] {
        [
            (STATE_FILES[0], &self.history),
            (STATE_FILES[1], &self.output),
            (STATE_FILES[2], &self.diff),
            (STATE_FILES[3], &self.coefficient),
            (STATE_FILES[4], &self.rdh),
        ]
    }
    pub(crate) fn validate(&self) -> Result<()> {
        if self.files().iter().any(|(_, v)| v.len() != BYTES) {
            return Err("Invalid compound backing length".into());
        }
        Ok(())
    }
}

pub struct Processor {
    window: usize,
    coef0: f32,
    threshold_a: f32,
    threshold_b: f32,
    source_assets: Value,
    provenance: Value,
}
pub struct Outcome {
    pub state: State,
    pub correlation_kernel: Vec<u8>,
    pub rdh_outside_native: Vec<u8>,
}
impl Processor {
    pub(crate) fn selected(&self) -> (usize, f32, f32, f32) {
        (self.window, self.coef0, self.threshold_a, self.threshold_b)
    }
    pub(crate) fn from_selected(
        window: usize,
        coef0: f32,
        threshold_a: f32,
        threshold_b: f32,
    ) -> Result<Self> {
        if !(1..=63).contains(&window)
            || window.is_multiple_of(2)
            || !coef0.is_finite()
            || !threshold_a.is_finite()
            || !threshold_b.is_finite()
            || threshold_b <= 0.
        {
            return Err("Invalid selected compound profile".into());
        }
        Ok(Self {
            window,
            coef0,
            threshold_a,
            threshold_b,
            source_assets: Value::Null,
            provenance: json!({"policy":"selected-memory-profile-v1"}),
        })
    }

    pub fn load(
        directory: &Path,
        source: convex_bfsp::Settings,
        dtgc: convex_dtgc::Settings,
    ) -> Result<Self> {
        Self::from_source(&crate::resources::Files(directory), source, dtgc)
    }
    pub fn from_source(
        directory: &dyn crate::resources::Source,
        source: convex_bfsp::Settings,
        dtgc: convex_dtgc::Settings,
    ) -> Result<Self> {
        let preceding = convex_dtgc::Processor::from_source(directory, source, dtgc)?;
        // Never activate another model's smoothing bank or silently ignore it.
        if directory.exists("B_Smooth.bin")? {
            return Err("General requires B_Smooth absent; ThreeLine unsupported".into());
        }
        let bytes = directory.read("B_BF.bin", 20)?;
        const SHA: &str = "e0dd053a850c10f0c9f25bbbcc5cafbb77d9e177c18c16f62b6b745245efb3a6";
        if bytes.len() != 20 || archive::sha(&bytes) != SHA {
            return Err("Require complete known General B_BF.bin".into());
        }
        let values: Vec<f32> = bytes
            .as_chunks::<4>()
            .0
            .iter()
            .map(|b| f32::from_le_bytes(*b))
            .collect();
        let depth = preceding.report()["native_depth_parameter"]
            .as_f64()
            .unwrap() as f32;
        let mut p = Self::new(depth, values[0], values[1], values[2], values[3])?;
        p.source_assets = preceding.provenance();
        let mut files = p.source_assets["files"].as_array().unwrap().clone();
        files.push(json!({"name":"B_BF.bin","bytes":20,"sha256":SHA}));
        p.provenance = json!({"profile":"Plus-UC5-2S_16-General-B4-T128-m2-type8","files":files,
            "three_line_enabled":false,"smoothing_policy":"known-General-B_Smooth-absent-v1","coefficient_payload_copied":false});
        Ok(p)
    }
    fn new(depth: f32, coef0: f32, threshold_a: f32, threshold_b: f32, width: f32) -> Result<Self> {
        let n = (((width * 0.1) / depth) * 1024. + 0.5).trunc();
        if !depth.is_finite()
            || depth <= 0.
            || !n.is_finite()
            || !(1.0..=i32::MAX as f32).contains(&n)
            || !coef0.is_finite()
            || !threshold_a.is_finite()
            || !threshold_b.is_finite()
            || threshold_b <= 0.
        {
            return Err("Invalid compound scalar/window parameters".into());
        }
        let window = if n < 32. { 2 * n as usize - 1 } else { 63 };
        Ok(Self {
            window,
            coef0,
            threshold_a,
            threshold_b,
            source_assets: Value::Null,
            provenance: Value::Null,
        })
    }
    pub fn source_assets(&self) -> Value {
        self.source_assets.clone()
    }
    pub fn provenance(&self) -> Value {
        self.provenance.clone()
    }
    pub fn report(&self) -> Value {
        json!({"window":self.window,"diff_correlation_dispatch":[32,1024],"diff_correlation_local":[8,16],
            "smoothing_dispatch":[32,1],"smoothing_local":[32,1],"native_image_shape_y_x_components":[1024,64,4],
            "rdh_attempted_write_x_range":[0,128],"rdh_native_width":64,"rdh_outside_write_calls":65536,
            "rdh_outside_shape_y_x_components":[1024,64,4],"rdh_outside_origin_x":64,"rdh_write_policy":POLICY,
            "native_fill_region":[256,1024,1],"native_fill_exceeds_image":true,"native_gpu_result_defined":false,
            "history_copy":"full current DTGC -> history after all three kernels; initialized=false also overwrites full output with current",
            "numeric_policy":"ordered binary32 without contraction; UNORM8 reads byte/255 and writes clamp then binary32*255 round-even",
            "full_native_lifecycle_reproduced":false,"gpu_equivalence_validated":false})
    }
    pub fn process(&self, current: &[u8], before: &State) -> Result<Outcome> {
        before.validate()?;
        if current.len() != BYTES {
            return Err("Require exact64x1024 DTGC image".into());
        }
        let mut state = before.clone();
        // DiffAbs writes only columns0..31; prior columns32..63 remain.
        for y in 0..1024 {
            for x in 0..32 {
                for c in 0..4 {
                    let k = (y * 64 + x) * 4 + c;
                    state.diff[k] =
                        unorm((normalized(current[k]) - normalized(before.history[k])).abs());
                }
            }
        }
        let mut outside = vec![0; BYTES]; // every component is written, no invented retained state
        for x in 0..32 {
            let idx = (self.window / 2) as isize;
            let mut sum = [0.; 4];
            for i in 0..self.window {
                for (c, s) in sum.iter_mut().enumerate() {
                    *s += sample(&state.diff, x, i as isize - idx, c);
                }
            }
            for y in 0..1024 {
                if y > 0 {
                    for (c, s) in sum.iter_mut().enumerate() {
                        // Native rolling recurrence is preserved verbatim: this is
                        // not replaced with a symmetric mathematical window.
                        *s += sample(&state.diff, x, y as isize + idx, c);
                        *s -= sample(&state.diff, x, y as isize - idx, c);
                    }
                }
                for (c, s) in sum.iter().enumerate() {
                    let mean = (*s / self.window as f32) * 255.;
                    let adaptive = ((mean - self.threshold_a) / self.threshold_b).clamp(0., 1.);
                    let rdh = (0.3_f32 - 0.125) * adaptive + 0.125;
                    let coefficient = (1. - adaptive) * self.coef0;
                    if !coefficient.is_finite() || !rdh.is_finite() {
                        return Err("Nonfinite compound arithmetic; input state unchanged".into());
                    }
                    state.coefficient[(y * 64 + x) * 4 + c] = unorm(coefficient);
                    let dest_x = x * 4 + c;
                    // Record every attempted write, with native bounds intact.
                    let (dest, xx) = if dest_x < 64 {
                        (&mut state.rdh, dest_x)
                    } else {
                        (&mut outside, dest_x - 64)
                    };
                    dest[(y * 64 + xx) * 4..(y * 64 + xx) * 4 + 4].fill(unorm(rdh));
                }
            }
        }
        for y in 0..1024 {
            for x in 0..32 {
                for c in 0..4 {
                    let k = (y * 64 + x) * 4 + c;
                    let corr = normalized(state.coefficient[k]);
                    let v =
                        normalized(current[k]) * (1. - corr) + normalized(before.history[k]) * corr;
                    state.output[k] = unorm(v);
                }
            }
        }
        let correlation_kernel = state.output.clone();
        if !before.initialized {
            state.output.copy_from_slice(current);
        }
        state.history.copy_from_slice(current);
        state.initialized = true;
        Ok(Outcome {
            state,
            correlation_kernel,
            rdh_outside_native: outside,
        })
    }
}
fn normalized(value: u8) -> f32 {
    value as f32 / 255.
}
fn sample(image: &[u8], x: usize, y: isize, c: usize) -> f32 {
    normalized(image[(y.clamp(0, 1023) as usize * 64 + x) * 4 + c])
}

#[cfg(test)]
mod tests {
    use super::*;
    fn state(initialized: bool) -> State {
        State {
            initialized,
            history: vec![0; BYTES],
            output: vec![151; BYTES],
            diff: vec![37; BYTES],
            coefficient: vec![83; BYTES],
            rdh: vec![213; BYTES],
        }
    }
    #[test]
    fn first_copy_happens_after_kernels_and_history_is_current_not_correlation() {
        let p = Processor::new(3., 0.5, 50., 20., 1.).unwrap();
        let current = vec![20; BYTES];
        let a = p.process(&current, &state(false)).unwrap();
        assert_eq!(a.state.output, current);
        assert_eq!(a.state.history, current);
        assert!(a.state.initialized);
        assert_eq!(a.correlation_kernel[0], 10);
        assert_eq!(a.state.coefficient[0], 128);
        assert_eq!(a.state.rdh[0], 32);
        assert_eq!(a.rdh_outside_native[0], 32);
        let b = p.process(&vec![40; BYTES], &a.state).unwrap();
        assert_eq!(b.state.output[0], 30);
        assert_eq!(b.state.history[0], 40);
        assert_eq!(b.state.output[128], 20); // output's unwritten half retains first full copy
    }
    #[test]
    fn native_shapes_and_unwritten_regions_are_preserved() {
        let p = Processor::new(12., 0.5, 50., 20., 1.).unwrap();
        assert_eq!(p.window, 17);
        let a = p.process(&vec![255; BYTES], &state(true)).unwrap();
        for y in 0..1024 {
            let k = (y * 64 + 32) * 4;
            assert_eq!(&a.state.diff[k..k + 128], &[37; 128]);
            assert_eq!(&a.state.coefficient[k..k + 128], &[83; 128]);
            assert_eq!(&a.state.output[k..k + 128], &[151; 128]);
        }
        assert!(a.state.rdh.iter().all(|v| *v == 76));
        assert!(a.rdh_outside_native.iter().all(|v| *v == 76));
    }
    #[test]
    fn native_rolling_recurrence_is_not_a_recentered_mean() {
        let p = Processor::new(12., 1., 0., 255., 1.).unwrap();
        let mut current = vec![0; BYTES];
        // N17: native y1 removes edge row0, while adding row9. A high
        // row0 therefore leaves eight copies rather than nine.
        current[..128].fill(255);
        let a = p.process(&current, &state(true)).unwrap();
        assert_eq!(a.state.coefficient[0], 120);
        assert_eq!(a.state.coefficient[64 * 4], 135);
    }
    #[test]
    fn state_policy_and_lengths_cannot_be_implied() {
        let s = state(false);
        let mut v = s.metadata();
        v["rdh_write_policy"] = json!("ignore");
        assert!(State::from_bytes(&v, std::array::from_fn(|_| vec![0; BYTES])).is_err());
        let mut s = s;
        s.rdh.pop();
        assert!(
            Processor::new(3., 0.5, 50., 20., 1.)
                .unwrap()
                .process(&vec![0; BYTES], &s)
                .is_err()
        );
        assert!(Processor::new(1000., 0.5, 50., 20., 0.).is_err());
    }
}
