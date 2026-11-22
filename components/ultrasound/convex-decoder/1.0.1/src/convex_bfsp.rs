// SPDX-License-Identifier: AGPL-3.0-or-later
//! Selected UC5-2S_16 General B preprocessing. Explicit backing state is required:
//! native halo reads and unwritten destinations are not invented samples.
use crate::{Result, archive};
use serde_json::{Value, json};
use std::path::Path;

pub const GROUPS: usize = 32;
pub const SAMPLES: usize = 1024;
pub(crate) const INPUTS: [(&str, usize, &str); 4] = [
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
        "B_LPF.bin",
        256,
        "69f3e66397510c09a5b68fecfe3113120b1248db880f89c643b86728759e69cc",
    ),
];

#[derive(Clone, Copy, Debug)]
pub struct Settings {
    pub depth: usize,
    pub selector: usize,
    pub line_words: usize,
}
impl Settings {
    pub fn from_json(v: &Value) -> Result<Self> {
        let o = v.as_object().ok_or("BFSP settings must be an object")?;
        if o.len() != 4
            || o.keys().any(|k| {
                ![
                    "schema_version",
                    "depth_index",
                    "selector_index",
                    "line_words",
                ]
                .contains(&k.as_str())
            })
            || v["schema_version"] != "convex-bfsp-settings-v1"
        {
            return Err("Require exact convex-bfsp-settings-v1 settings; no defaults".into());
        }
        let get = |key: &str| {
            v[key]
                .as_u64()
                .and_then(|n| usize::try_from(n).ok())
                .ok_or_else(|| format!("Invalid {key}"))
        };
        let settings = Self {
            depth: get("depth_index")?,
            selector: get("selector_index")?,
            line_words: get("line_words")?,
        };
        if settings.depth >= 8 || settings.selector >= 2 {
            return Err("General supports depth0..7 and selector0..1 only".into());
        }
        Ok(settings)
    }
    pub fn json(self) -> Value {
        json!({"schema_version":"convex-bfsp-settings-v1","depth_index":self.depth,"selector_index":self.selector,"line_words":self.line_words})
    }
}

pub struct Assets {
    coefficients: [f32; 8],
    downsample: usize,
    provenance: Value,
    selection: (usize, usize),
}
impl Assets {
    pub(crate) fn selected(&self) -> ([f32; 8], usize) {
        (self.coefficients, self.downsample)
    }
    pub(crate) fn from_selected(
        settings: Settings,
        coefficients: [f32; 8],
        downsample: usize,
    ) -> Result<Self> {
        if settings.depth >= 8
            || settings.selector >= 2
            || coefficients.iter().any(|x| !x.is_finite())
        {
            return Err("Invalid selected BFSP profile".into());
        }
        Plan::new(settings.line_words, downsample)?;
        Ok(Self {
            coefficients,
            downsample,
            selection: (settings.depth, settings.selector),
            provenance: json!({"policy":"selected-memory-profile-v1"}),
        })
    }

    pub fn load(directory: &Path, settings: Settings) -> Result<Self> {
        Self::from_source(&crate::resources::Files(directory), settings)
    }
    pub fn from_source(
        directory: &dyn crate::resources::Source,
        settings: Settings,
    ) -> Result<Self> {
        if settings.depth >= 8 || settings.selector >= 2 {
            return Err("Invalid General selection".into());
        }
        let mut inputs = Vec::new();
        let mut files = Vec::new();
        for (name, size, expected) in INPUTS {
            let bytes = directory.read(name, size as u64)?;
            if bytes.len() != size || archive::sha(&bytes) != expected {
                return Err(format!(
                    "{name}: require the complete known General input group"
                ));
            }
            files.push(json!({"name":name,"bytes":size,"sha256":expected}));
            inputs.push(bytes);
        }
        let word = |file: usize, offset: usize| {
            u32::from_le_bytes(inputs[file][offset..offset + 4].try_into().unwrap())
        };
        if word(0, 0x1c) != 8
            || word(1, 4) != 4
            || word(1, 8) != 2
            || word(1, 12) != 128
            || word(2, 0x104 + 32 * settings.selector + 4 * settings.depth) != 2
        {
            return Err("General B configuration disagrees with the traced profile".into());
        }
        let downsample = (word(2, 0xe4 + 4 * settings.depth) as usize).div_ceil(2);
        let offset = 16 * settings.depth + 128 * settings.selector;
        let coefficients = std::array::from_fn(|i| {
            i16::from_le_bytes(
                inputs[3][offset + 2 * i..offset + 2 * i + 2]
                    .try_into()
                    .unwrap(),
            ) as f32
                / 256.0
        });
        Ok(Self {
            coefficients,
            downsample,
            selection: (settings.depth, settings.selector),
            provenance: json!({"profile":"Plus-UC5-2S_16-General-B4-T128-m2-type8","files":files,"depth_index":settings.depth,"selector_index":settings.selector,"coefficient_payload_copied":false}),
        })
    }
    pub fn plan(&self, settings: Settings) -> Result<Plan> {
        if (settings.depth, settings.selector) != self.selection {
            return Err("Settings selection differs from loaded assets".into());
        }
        Plan::new(settings.line_words, self.downsample)
    }
    pub fn provenance(&self) -> Value {
        self.provenance.clone()
    }
    pub fn process(&self, plan: Plan, state: &mut State, phase: u8) -> Result<()> {
        if plan.downsample != self.downsample {
            return Err("Plan downsample differs from loaded assets; state unchanged".into());
        }
        process(plan, &self.coefficients, state, phase)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Plan {
    line_words: usize,
    line_vectors: usize,
    positions: usize,
    up_stride: usize,
    downsample: usize,
    raw_bytes: usize,
    up_bytes: usize,
}
impl Plan {
    pub fn new(line_words: usize, downsample: usize) -> Result<Self> {
        // Bounds precede products. Fixed General B4/T128/m2: e4, R32,
        // E words32 per line, L=E/2 ushort4, K8 words32 => H4 vectors.
        if !(512..=32768).contains(&line_words)
            || !line_words.is_multiple_of(2)
            || !(1..=64).contains(&downsample)
        {
            return Err("Invalid bounded even line_words or downsample".into());
        }
        let line_vectors = line_words / 2;
        let positions = line_vectors / 256 * 256;
        if positions > line_vectors - 4 {
            return Err("Native LPF destinations overlap adjacent groups; concurrent write order is undefined".into());
        }
        let up_stride = 4 * (line_vectors - 4);
        let raw_read_end = ((GROUPS - 1) * line_vectors + 4 + positions + 16) * 8;
        let raw_bytes = raw_read_end
            .max(GROUPS * line_words * 4)
            .max(GROUPS * SAMPLES * 8);
        let up_bytes = ((GROUPS - 1) * up_stride + (4 * positions).max(SAMPLES * downsample)) * 8;
        if raw_bytes > 4 * 1024 * 1024 || up_bytes > 16 * 1024 * 1024 {
            return Err("Native raw/Up4 allocation bound exceeded".into());
        }
        Ok(Self {
            line_words,
            line_vectors,
            positions,
            up_stride,
            downsample,
            raw_bytes,
            up_bytes,
        })
    }
    pub fn line_words(self) -> usize {
        self.line_words
    }
    pub fn input_bytes(self) -> usize {
        GROUPS * self.line_words * 4
    }
    pub fn raw_bytes(self) -> usize {
        self.raw_bytes
    }
    pub fn up_bytes(self) -> usize {
        self.up_bytes
    }
    pub fn reshape_bytes(self) -> usize {
        GROUPS * SAMPLES * 16
    }
    pub fn json(self) -> Value {
        json!({"groups":GROUPS,"output_samples_per_group":SAMPLES,"line_words":self.line_words,"prefix_words":8,
            "line_ushort4_vectors":self.line_vectors,"prefix_ushort4_vectors":4,"downsample":self.downsample,
            "lpf_dispatch":[GROUPS,self.positions/16],"lpf_local":[4,16],"lpf_positions_written_per_group":self.positions,
            "lpf_halo_vectors_after_last_output_position":16,"up4_stride_vectors":self.up_stride,
            "up4_unwritten_vectors_between_groups":self.up_stride-4*self.positions,
            "mdown_reads_past_group_stride":SAMPLES*self.downsample>self.up_stride,
            "mdown_dispatch":[GROUPS,SAMPLES],"reshape_dispatch":[GROUPS,SAMPLES],
            "input_line_buffer_bytes":self.input_bytes(),"raw_backing_bytes":self.raw_bytes,
            "up4_backing_bytes":self.up_bytes,"reshape_backing_bytes":self.reshape_bytes(),
            "state_policy":"explicit-active-backing-prefixes-v1","native_full_allocations_exported":false})
    }
}

pub struct State {
    pub raw: Vec<u8>,
    pub up4: Vec<u8>,
    pub reshaped: Vec<[f32; 4]>,
}
impl State {
    pub fn from_bytes(plan: Plan, raw: Vec<u8>, up4: Vec<u8>, reshaped: Vec<u8>) -> Result<Self> {
        if raw.len() != plan.raw_bytes
            || up4.len() != plan.up_bytes
            || reshaped.len() != plan.reshape_bytes()
        {
            return Err(
                "All three backing prefixes must have the exact planned byte lengths".into(),
            );
        }
        let reshaped = reshaped
            .as_chunks::<16>()
            .0
            .iter()
            .map(|b| {
                std::array::from_fn(|i| f32::from_le_bytes(b[i * 4..i * 4 + 4].try_into().unwrap()))
            })
            .collect();
        let state = Self { raw, up4, reshaped };
        state.validate(plan)?;
        Ok(state)
    }
    pub(crate) fn validate(&self, plan: Plan) -> Result<()> {
        if self.raw.len() != plan.raw_bytes
            || self.up4.len() != plan.up_bytes
            || self.reshaped.len() != GROUPS * SAMPLES
            || self.reshaped.iter().flatten().any(|f| !f.is_finite())
        {
            return Err(
                "Backing lengths or finite reshape state disagree with plan; state unchanged"
                    .into(),
            );
        }
        Ok(())
    }
    pub fn reshaped_bytes(&self) -> Vec<u8> {
        self.reshaped
            .iter()
            .flatten()
            .flat_map(|f| f.to_le_bytes())
            .collect()
    }
}

fn sample(bytes: &[u8], vector: usize, lane: usize) -> f32 {
    let offset = vector * 8 + lane * 2;
    u16::from_le_bytes(bytes[offset..offset + 2].try_into().unwrap()) as f32
}
fn put(bytes: &mut [u8], vector: usize, lane: usize, value: f32) {
    let offset = vector * 8 + lane * 2;
    bytes[offset..offset + 2].copy_from_slice(&(value as u16).to_le_bytes());
}

/// Exact bounded schedule, binary32 left-to-right filter, x+(y-x)*fraction mix,
/// host log10f and saturating round-towards-zero integer conversion. OpenCL's
/// actual mix/log implementations and device rounding remain unvalidated.
pub fn process(plan: Plan, coefficients: &[f32; 8], state: &mut State, phase: u8) -> Result<()> {
    state.validate(plan)?;
    if coefficients
        .iter()
        .any(|c| !c.is_finite() || c.abs() > 128.0)
    {
        return Err("Finite signed-i16/256 coefficient range required; state unchanged".into());
    }
    for group in 0..GROUPS {
        for position in 0..plan.positions {
            let base = group * plan.line_vectors + 4 + position;
            for lane in 0..4 {
                let filter = |start| {
                    let mut sum = (sample(&state.raw, start, lane)
                        + sample(&state.raw, start + 15, lane))
                        * coefficients[0];
                    for (tap, coefficient) in coefficients.iter().enumerate().skip(1) {
                        sum += (sample(&state.raw, start + tap, lane)
                            + sample(&state.raw, start + 15 - tap, lane))
                            * coefficient;
                    }
                    sum
                };
                let left = filter(base);
                let right = filter(base + 1);
                let target = group * plan.up_stride + 4 * position;
                put(&mut state.up4, target, lane, left);
                for (i, fraction) in [0.25f32, 0.5, 0.75].iter().enumerate() {
                    put(
                        &mut state.up4,
                        target + i + 1,
                        lane,
                        left + (right - left) * fraction,
                    );
                }
            }
        }
    }
    for group in 0..GROUPS {
        for position in 0..SAMPLES {
            let base = group * plan.up_stride + position * plan.downsample;
            for lane in 0..4 {
                let mut sum = 0.0f32;
                for i in 0..plan.downsample {
                    sum += sample(&state.up4, base + i, lane);
                }
                let value = (sum / plan.downsample as f32).max(1.0).log10() * 12094.771f32;
                put(&mut state.raw, group * SAMPLES + position, lane, value);
            }
        }
    }
    for group in 0..GROUPS {
        for position in 0..SAMPLES {
            let index = group * SAMPLES + position;
            if phase == 1 {
                if group + 1 < GROUPS {
                    state.reshaped[index][2] = sample(&state.raw, index, 0);
                    state.reshaped[index][3] = sample(&state.raw, index, 1);
                    state.reshaped[index + SAMPLES][0] = sample(&state.raw, index, 2);
                    state.reshaped[index + SAMPLES][1] = sample(&state.raw, index, 3);
                }
            } else {
                state.reshaped[index] = std::array::from_fn(|lane| sample(&state.raw, index, lane));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn asset_bound_api_rejects_foreign_plan_before_state_mutation() {
        let assets = Assets {
            coefficients: [0.0; 8],
            downsample: 3,
            selection: (0, 0),
            provenance: json!({"synthetic":true}),
        };
        let plan = Plan::new(520, 4).unwrap();
        let mut state = State::from_bytes(
            plan,
            vec![99; plan.raw_bytes()],
            vec![42; plan.up_bytes()],
            vec![0; plan.reshape_bytes()],
        )
        .unwrap();
        assert!(assets.process(plan, &mut state, 1).is_err());
        assert!(state.raw.iter().all(|b| *b == 99));
        assert!(state.up4.iter().all(|b| *b == 42));
        assert!(
            assets
                .plan(Settings {
                    depth: 1,
                    selector: 0,
                    line_words: 520
                })
                .is_err()
        );
    }
}
