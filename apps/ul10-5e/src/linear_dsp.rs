//! Offline CPU K0→K1→K2 port from the retained static UL10-5E specification.
//! No physical units, image processing, USB or claim of GPU numerical identity.
use crate::{Result, linear};
use serde_json::{Value, json};

pub const U_BYTES: usize = 12 * 1024 * 1024;
pub const FLOAT4_SLOTS: usize = 8 * 1024 * 1024 / 16;
pub const NATIVE_STRIDE: usize = 8192;
const A: [usize; 8] = [624, 888, 1144, 1392, 1648, 1904, 2160, 2704];
const B: [usize; 8] = [1184, 1696, 2208, 2720, 3232, 3744, 4256, 5344];
pub(crate) const C: [usize; 8] = [576, 832, 1088, 1344, 1600, 1856, 2112, 2656];
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Configuration {
    p: usize,
    n: usize,
    depth: usize,
    pitch: f32,
    start_s: i32,
    field4: u8,
}
impl Configuration {
    pub fn depth_index(self) -> usize {
        self.depth
    }
    pub fn envelope_shape(self) -> [usize; 3] {
        [self.n / 2, 2 * C[self.depth], 4]
    }
    pub fn framing(self) -> linear::Parameters {
        linear::Parameters {
            p: self.p,
            n: self.n,
            organization_field4: self.field4,
        }
    }
    pub fn frame_bytes(self) -> usize {
        2 * self.p * self.n
    }
    pub fn json(self) -> Value {
        json!({"profile":"linear-UL10-5E-m_nPA0-frequencyType1","P":self.p,"N":self.n,
            "depth_index":self.depth,"pitch_input":self.pitch,"pitch_units":"unknown",
            "startS":self.start_s,"organization_field4":self.field4,"A":A[self.depth],"B":B[self.depth],"C":C[self.depth],
            "groups":self.n/2,"u_bytes":U_BYTES,"native_float4_stride":NATIVE_STRIDE,"u_written_time_rows":8*A[self.depth],
            "envelope_packed_shape":[self.n/2,2*C[self.depth],4],"physical_calibration":null})
    }
    fn validate(self) -> Result<()> {
        if self.depth >= 6
            || self.n != 80
            || self.pitch.to_bits() != 0.5f32.to_bits()
            || !(1024..=8192).contains(&self.p)
            || !self.p.is_multiple_of(2)
            || !(-2048..=2047).contains(&self.start_s)
            || self.field4 > 15
        {
            return Err(
                "CPU port supports the verified six-depth N80/pitch0.5 linear profile only".into(),
            );
        }
        if 2 * A[self.depth] + 7 > self.p
            || B[self.depth] != 2 * C[self.depth] + 32
            || !C[self.depth].is_multiple_of(32)
            || 2 * C[self.depth] + 31 > NATIVE_STRIDE
            || (self.n / 2) * NATIVE_STRIDE > FLOAT4_SLOTS
            || 384 * (8 * A[self.depth] - 1) + 64 + 2 * self.n > U_BYTES
        {
            return Err("DSP work-table/resource bound violated".into());
        }
        Ok(())
    }
}

/// Selected coefficients for the fixed Vascular bench preset.
#[derive(Clone)]
pub struct Assets {
    configuration: Configuration,
    up: [i8; 16],
    apo: Vec<f32>,
    sin_cos: Vec<f32>,
    coef: Vec<f32>,
    post: [i16; 265],

    provenance: Value,
}
impl Assets {
    pub fn fixed() -> Self {
        fn rows(index: &[u8], bank: &[u8], width: usize) -> Vec<f32> {
            index
                .iter()
                .flat_map(|&i| {
                    let start = usize::from(i) * width * 4;
                    bank[start..start + width * 4]
                        .chunks_exact(4)
                        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
                })
                .collect()
        }
        let gain = include_bytes!("../profile/gain.bin");
        let mut post = [0; 265];
        for (i, b) in gain.chunks_exact(2).enumerate() {
            post[if i == 64 { 258 } else { i }] = i16::from_le_bytes(b.try_into().unwrap());
        }
        Self {
            configuration: Configuration {
                p: 1920,
                n: 80,
                depth: 1,
                pitch: 0.5,
                start_s: 64,
                field4: 3,
            },
            up: [
                -3, -14, -32, -54, -72, -74, -57, -21, 21, 57, 74, 72, 54, 32, 14, 3,
            ],
            apo: rows(
                include_bytes!("../profile/aperture-index.bin"),
                include_bytes!("../profile/aperture-rows.bin"),
                64,
            ),
            coef: rows(
                include_bytes!("../profile/filter-index.bin"),
                include_bytes!("../profile/filter-rows.bin"),
                16,
            ),
            sin_cos: include_bytes!("../profile/oscillator.bin")
                .chunks_exact(4)
                .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
                .collect(),
            post,
            provenance: json!({"profile":"UL10-5E Vascular depth index 1"}),
        }
    }
    pub fn configuration(&self) -> Configuration {
        self.configuration
    }
    pub fn provenance(&self) -> Value {
        self.provenance.clone()
    }
    pub(crate) fn post_dtgc(&self) -> &[i16; 265] {
        &self.post
    }
    fn validate(&self) -> Result<()> {
        self.configuration.validate()?;
        if self.apo.len() != 424 * 64
            || self.sin_cos.len() != 2 * 1695
            || self.coef.len() != 26 * 16
            || self
                .apo
                .iter()
                .chain(&self.sin_cos)
                .chain(&self.coef)
                .any(|v| !v.is_finite())
        {
            return Err("Invalid coefficient dimensions or nonfinite inputs".into());
        }
        // With this bound every signed-i8 FIR sum fits signed16, as it does
        // for the known files. Wider arithmetic must not hide native overflow.
        for phase in 0..4 {
            let norm: i32 = (0..4)
                .map(|j| i32::from(self.up[3 - phase + 4 * j]).abs())
                .sum();
            if norm > 255 {
                return Err("Upsampling coefficients exceed verified signed16 sum bound".into());
            }
        }
        for q in 0..B[self.configuration.depth] / 4 {
            let start = self.apo[64 * q + 63];
            if !(0.0..=61.0).contains(&start) || start.fract() != 0.0 {
                return Err("Invalid aperture start index".into());
            }
        }
        Ok(())
    }
}
#[derive(Clone, Copy)]
struct Tap {
    base: usize,
    weight: f32,
}

/// Buffers retain known zero padding for a fixed configuration. Construct a
/// new processor for any depth/P/preset change; no stale processing state leaks.
pub struct Processor {
    assets: Assets,
    u: Vec<i8>,
    v: Vec<[f32; 4]>,
    taps: Vec<Vec<Tap>>,
    schedule: Value,
}
impl Processor {
    pub fn new(assets: Assets) -> Result<Self> {
        assets.validate()?;
        let c = assets.configuration;
        let mut taps = Vec::new();
        let mut highest = 0;
        let mut zero_padding_reads = 0u64;
        for y in 0..B[c.depth] {
            let q = y / 4;
            let s = y % 4;
            let start = assets.apo[64 * q + 63] as usize;
            let z = (q as f32 * 3.08 / 40.0) + (c.start_s as f32 * 0.01925);
            let mut row = Vec::new();
            for i in start..125 - start {
                let a = if i < 62 { i } else { 124 - i };
                let dx = (a as f32 - 62.0) * c.pitch / 2.0;
                let value = dx.hypot(z) * 5.194_805 * 40.0 + 0.5 - c.start_s as f32 * 40.0 * 0.1;
                if !value.is_finite() || !(-32768.0..32768.0).contains(&value.trunc()) {
                    return Err("Delay conversion outside signed16".into());
                }
                let delay = i64::from(value.trunc() as i16);
                let base = 384 * delay + 1536 * s as i64 + i as i64 + 2;
                let max = base + 4 * (c.n / 2 - 1) as i64 + 3;
                if base < 0 || max >= U_BYTES as i64 {
                    return Err("Delay/aperture address outside native U allocation".into());
                }
                highest = highest.max(max as usize);
                // Some addresses beyond the written rectangle are known zero;
                // retain allocation padding, never clamp to a signal sample.
                for g in 0..c.n / 2 {
                    for lane in 0..4 {
                        let addr = base as usize + 4 * g + lane;
                        let t = addr / 384;
                        let col = addr % 384;
                        if t >= 8 * A[c.depth] || !(64..64 + 2 * c.n).contains(&col) {
                            zero_padding_reads += 1;
                        }
                    }
                }
                row.push(Tap {
                    base: base as usize,
                    weight: assets.apo[64 * q + a],
                });
            }
            taps.push(row);
        }
        Ok(Self {
            assets,
            u: vec![0; U_BYTES],
            v: vec![[0.0; 4]; FLOAT4_SLOTS],
            taps,
            schedule: json!({"highest_U_read_offset":highest,"U_allocation_bytes":U_BYTES,"known_zero_padding_scalar_reads_per_frame":zero_padding_reads,
                "delay_policy":"host binary32 hypot, sequential operations, checked truncation toward zero to i16",
                "padding_policy":"initial zero allocation retained across fixed-configuration frames; no signal-edge clamp"}),
        })
    }
    pub fn configuration(&self) -> Configuration {
        self.assets.configuration
    }
    pub fn provenance(&self) -> Value {
        self.assets.provenance()
    }
    pub fn schedule(&self) -> Value {
        self.schedule.clone()
    }
    pub fn process(&mut self, frame: &[u8]) -> Result<Envelope> {
        let c = self.configuration();
        if frame.len() != c.frame_bytes() {
            return Err("Expected exact whole raw frame length".into());
        }
        for (i, line) in frame.chunks_exact(2 * c.p).enumerate() {
            if line[..4] != crate::MARKER || usize::from(line[5]) != i + 1 {
                return Err("Raw frame line marker/counter mismatch".into());
            }
        }
        let mut saturated = 0u64;
        // K0: mathematically equivalent flattened addresses, no interpolation
        // substitute. Inputs after the header still include the native crop.
        for d in 0..2 * A[c.depth] {
            for r in 0..c.n {
                for lane in 0..2 {
                    for phase in 0..4 {
                        let mut sum = 0i32;
                        for j in 0..4 {
                            sum += i32::from(self.assets.up[3 - phase + 4 * j])
                                * i32::from(frame[2 * (r * c.p + d + 4 + j) + lane] as i8);
                        }
                        let shifted = sum >> 7;
                        if !(-128..=127).contains(&shifted) {
                            saturated += 1;
                        }
                        self.u[384 * (4 * d + phase) + 64 + 2 * r + lane] =
                            shifted.clamp(-128, 127) as i8;
                    }
                }
            }
        }
        // K1: preserve ordered sums, including zero-weight reads, then scale2.
        for g in 0..c.n / 2 {
            for (y, row) in self.taps.iter().enumerate() {
                let mut value = [0.0f32; 4];
                for tap in row {
                    for (lane, sum) in value.iter_mut().enumerate() {
                        *sum += f32::from(self.u[tap.base + 4 * g + lane]) * tap.weight;
                    }
                }
                for value in &mut value {
                    *value *= 2.0;
                }
                self.v[g * NATIVE_STRIDE + y] = value;
            }
        }
        // K2: native coefficient group is t/64, not a universal repeated FIR.
        let width = 2 * C[c.depth];
        let mut packed = Vec::with_capacity((c.n / 2) * width);
        for g in 0..c.n / 2 {
            for t in 0..width {
                let mut sin = [0.0f32; 4];
                let mut cos = [0.0f32; 4];
                for j in 0..16 {
                    let a = t + j;
                    let b = t + 31 - j;
                    let h = self.assets.coef[16 * (t / 64) + j];
                    for lane in 0..4 {
                        sin[lane] += (self.v[g * NATIVE_STRIDE + a][lane] * self.assets.sin_cos[a]
                            + self.v[g * NATIVE_STRIDE + b][lane] * self.assets.sin_cos[b])
                            * h;
                        cos[lane] += (self.v[g * NATIVE_STRIDE + a][lane]
                            * self.assets.sin_cos[1695 + a]
                            + self.v[g * NATIVE_STRIDE + b][lane] * self.assets.sin_cos[1695 + b])
                            * h;
                    }
                }
                packed.push(std::array::from_fn(|lane| sin[lane].hypot(cos[lane])));
            }
        }
        Ok(Envelope {
            packed,
            shape: [c.n / 2, width, 4],
            report: json!({
            "K0_saturated_scalars":saturated,"raw_line_headers_checked":true,"lookahead_confirmation_checked_here":false,
            "numerical_policy":"sequential host binary32 arithmetic; no explicit fused multiply-add; host f32::hypot; no GPU bit-identity claim",
            "repacking":"only computed E[g,t][lane], group-major then t then component; native stride8192 replaced explicitly by2*C",
            "image_decoded":false,"physical_calibration":null,"gpu_equivalence_validated":false}),
        })
    }
}
pub struct Envelope {
    pub packed: Vec<[f32; 4]>,
    pub shape: [usize; 3],
    pub report: Value,
}
