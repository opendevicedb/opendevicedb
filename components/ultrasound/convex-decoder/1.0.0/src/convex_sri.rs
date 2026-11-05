// SPDX-License-Identifier: AGPL-3.0-or-later
//! General convex SRI CPU image operations with caller-supplied complete state.
//! No native/GPU/physical equivalence; coefficients remain external and hash-bound.
use crate::{
    Result, archive,
    convex_sri_plan::{Plan, Settings},
    linear_dsp::read_regular,
    linear_post::unorm,
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, path::Path};
pub const POLICY: &str = "full-native-backing-v1";
pub const EXTERNAL_BYTES: usize = 64 * 1024 * 4;
type Images = BTreeMap<u16, Image>;
#[derive(Clone, Copy, PartialEq, Debug)]
enum Kind {
    Unorm,
    Snorm,
    Int,
}
#[derive(Clone)]
struct Image {
    w: usize,
    h: usize,
    kind: Kind,
    bytes: Vec<u8>,
}
impl Image {
    fn get(&self, x: i32, y: i32, c: usize) -> f32 {
        let x = x.clamp(0, self.w as i32 - 1) as usize;
        let y = y.clamp(0, self.h as i32 - 1) as usize;
        let b = self.bytes[(y * self.w + x) * 4 + c];
        match self.kind {
            Kind::Unorm => b as f32 / 255.,
            Kind::Snorm => (b as i8 as f32 / 127.).max(-1.),
            Kind::Int => b as i8 as f32,
        }
    }
    fn set(&mut self, x: usize, y: usize, c: usize, v: f32) -> Result<()> {
        if x >= self.w || y >= self.h || !v.is_finite() {
            return Err("Invalid/outside/nonfinite SRI image write; state unchanged".into());
        }
        self.bytes[(y * self.w + x) * 4 + c] = match self.kind {
            Kind::Unorm => unorm(v),
            Kind::Snorm => (v.clamp(-1., 1.) * 127.).round_ties_even() as i8 as u8,
            Kind::Int => {
                if v.trunc() != v || !(0. ..=8.).contains(&v) {
                    return Err(format!("SRI direction{v} outside0..8; no bank read"));
                }
                v as i8 as u8
            }
        };
        Ok(())
    }
}
fn slot(s: &str) -> u16 {
    u16::from_str_radix(s.strip_prefix("0x").unwrap_or(s), 16).unwrap()
}
fn template() -> Vec<(u16, usize, usize, Kind)> {
    let j: Value = serde_json::from_str(include_str!("known_convex_sri_layout.json")).unwrap();
    j["images"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| {
            (
                slot(a["slot"].as_str().unwrap()),
                a["General_width"].as_u64().unwrap() as usize,
                a["height"].as_u64().unwrap() as usize,
                match a["channel_type"].as_str().unwrap() {
                    "CL_SNORM_INT8" => Kind::Snorm,
                    "CL_SIGNED_INT8" => Kind::Int,
                    _ => Kind::Unorm,
                },
            )
        })
        .collect()
}
#[derive(Clone)]
pub struct State {
    pub frame_count: usize,
    pub bound_mask_correlation: f32,
    images: Images,
}
impl State {
    pub fn load(directory: &Path) -> Result<(Self, Vec<u8>)> {
        let raw = read_regular(&directory.join("state.json"), 16384)?;
        let j: Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
        let mut files = Vec::new();
        for (s, w, h, _) in template() {
            files.push(read_regular(
                &directory.join(format!("{s:04x}.u8")),
                (w * h * 4) as u64,
            )?)
        }
        Ok((Self::from_bytes(&j, files)?, raw))
    }
    pub fn from_bytes(meta: &Value, files: Vec<Vec<u8>>) -> Result<Self> {
        let keys = [
            "schema_version",
            "policy",
            "frame_count",
            "bound_mask_correlation_bits",
        ];
        let o = meta
            .as_object()
            .ok_or("Require explicit SRI state metadata")?;
        if o.len() != 4
            || o.keys().any(|s| !keys.contains(&s.as_str()))
            || meta["schema_version"] != "convex-sri-state-v1"
            || meta["policy"] != POLICY
        {
            return Err("Require exact convex-sri-state-v1 and full-native-backing-v1".into());
        }
        let frame_count = meta["frame_count"]
            .as_u64()
            .filter(|n| *n <= 2)
            .ok_or("Invalid explicit SRI frame count")? as usize;
        let bits = meta["bound_mask_correlation_bits"]
            .as_u64()
            .and_then(|v| u32::try_from(v).ok())
            .ok_or("Require explicit bound correlation bits")?;
        let bound_mask_correlation = f32::from_bits(bits);
        if !bound_mask_correlation.is_finite() || !(0. ..=1.).contains(&bound_mask_correlation) {
            return Err("Invalid bound mask correlation".into());
        }
        let layout = template();
        if layout.len() != files.len() {
            return Err("Require all42 SRI image backings".into());
        }
        let mut images = Images::new();
        for ((s, w, h, kind), bytes) in layout.into_iter().zip(files) {
            if bytes.len() != w * h * 4 {
                return Err(format!("Require complete SRI image{s:04x}"));
            }
            images.insert(s, Image { w, h, kind, bytes });
        }
        Ok(Self {
            frame_count,
            bound_mask_correlation,
            images,
        })
    }
    pub fn metadata(&self) -> Value {
        json!({"schema_version":"convex-sri-state-v1","policy":POLICY,"frame_count":self.frame_count,"bound_mask_correlation_bits":self.bound_mask_correlation.to_bits()})
    }
    pub fn files(&self) -> Vec<(String, &[u8])> {
        self.images
            .iter()
            .map(|(s, i)| (format!("{s:04x}.u8"), i.bytes.as_slice()))
            .collect()
    }
}
fn get(a: &Images, s: u16, x: i32, y: i32, c: usize) -> f32 {
    a[&s].get(x, y, c)
}
fn stage(
    a: &mut Images,
    s: u16,
    w: usize,
    h: usize,
    f: impl Fn(&Images, i32, i32, usize) -> f32,
) -> Result<()> {
    let mut dst = a[&s].clone();
    if w > dst.w || h > dst.h {
        return Err("SRI dispatch outside native image".into());
    }
    for y in 0..h {
        for x in 0..w {
            for c in 0..4 {
                dst.set(x, y, c, f(a, x as i32, y as i32, c))?
            }
        }
    }
    a.insert(s, dst);
    Ok(())
}
fn copy(a: &mut Images, src: u16, dst: u16, w: usize, h: usize) -> Result<()> {
    let s = &a[&src];
    let d = &a[&dst];
    if w > s.w || h > s.h || w > d.w || h > d.h || s.kind != d.kind {
        return Err("Invalid SRI copy region/format".into());
    }
    let mut d = d.clone();
    for y in 0..h {
        d.bytes[y * d.w * 4..y * d.w * 4 + w * 4]
            .copy_from_slice(&s.bytes[y * s.w * 4..y * s.w * 4 + w * 4])
    }
    a.insert(dst, d);
    Ok(())
}
fn convolution(i: &Image, x: i32, y: i32, c: usize, dx: &[i32], dy: &[i32], k: &[f32]) -> f32 {
    let mut v = 0.;
    for (j, &oy) in dy.iter().enumerate() {
        for (n, &ox) in dx.iter().enumerate() {
            v += i.get(x + ox, y + oy, c) * k[j * dx.len() + n]
        }
    }
    v
}
fn vector(i: &Image, x: i32, y: i32, c: usize, offset: i32, k: &[f32], vertical: bool) -> f32 {
    let mut v = 0.;
    for (j, &weight) in k.iter().enumerate() {
        let d = offset + j as i32;
        v += i.get(
            x + if vertical { 0 } else { d },
            y + if vertical { d } else { 0 },
            c,
        ) * weight
    }
    v
}
fn polyphase(i: &Image, x: i32, y: i32, c: usize, k: &[f32]) -> f32 {
    let (dx, dy, weights): (&[i32], &[i32], &[f32]) = match (x % 2, y % 2) {
        (0, 0) => (&[-2, -1, 0, 1, 2], &[-2, -1, 0, 1, 2], &k[..25]),
        (1, 0) => (&[-1, 0, 1, 2], &[-2, -1, 0, 1, 2], &k[25..45]),
        (0, 1) => (&[-2, -1, 0, 1, 2], &[-1, 0, 1, 2], &k[45..65]),
        _ => (&[-1, 0, 1, 2], &[-1, 0, 1, 2], &k[65..]),
    };
    convolution(i, x / 2, y / 2, c, dx, dy, weights)
}
fn neighbors(i: &Image, x: i32, y: i32, c: usize, center: bool) -> f32 {
    let mut v = 0.;
    for dy in -1..=1 {
        for dx in -1..=1 {
            if center || dx != 0 || dy != 0 {
                v += i.get(x + dx, y + dy, c)
            }
        }
    }
    v
}
fn direction(mask: &Image, angle: &Image, x: i32, y: i32, c: usize) -> f32 {
    let (mut max, mut chosen, mut total) = (0., 0., 0.);
    for dy in -2..=2 {
        for dx in -1..=1 {
            let r = mask.get(x + dx, y + dy, c);
            if max <= r {
                max = r;
                chosen = angle.get(x + dx, y + dy, c)
            }
            total += r
        }
    }
    let mut sum = 0.;
    for dy in -2..=2 {
        for dx in -1..=1 {
            let t = angle.get(x + dx, y + dy, c);
            let d = t - chosen;
            sum += mask.get(x + dx, y + dy, c)
                * (t - if d > 0.5 { 1. } else { 0. } + if d < -0.5 { 1. } else { 0. })
        }
    }
    let mut mean = sum / if total == 0. { 1. } else { total };
    mean = mean - if mean > 0.9375 { 1. } else { 0. } + if mean < -0.0625 { 1. } else { 0. };
    if mask.get(x, y, c) > 0. {
        -((mean + 0.1875) * -8.).trunc()
    } else {
        0.
    }
}
#[allow(clippy::assign_op_pattern)] // Preserve native (count - average) + previous association.
fn histogram(i: &Image, n: usize, ratio: f32) -> Result<(f32, Value)> {
    let mut bins = [0u32; 128];
    let last = [0, 144, 80, 59, 48][n];
    for x in 0..64 {
        for y in 16..last {
            for c in 0..4 {
                let v = i.get(x, y, c);
                if !(0. ..=1.).contains(&v) {
                    return Err("Invalid SRI histogram amplitude".into());
                }
                bins[(v * 127.).round_ties_even() as usize] += 1
            }
        }
    }
    let total = bins.iter().sum::<u32>();
    let avg = total as f32 / 128.;
    let target = (total as f32 * ratio).trunc() as u32;
    let (mut sum, mut percentile, mut found, mut maxidx, mut best) = (0, 0, false, 0, 0.);
    for (j, &count) in bins.iter().enumerate() {
        sum += count;
        if !found && sum >= target {
            percentile = j;
            found = true
        }
        let d = sum as f32 - j as f32 * avg;
        if d > best {
            maxidx = j;
            best = d
        }
    }
    maxidx = maxidx.min(64);
    let mut second = 0;
    if maxidx > 0 {
        let avg = bins[..2 * maxidx].iter().sum::<u32>() as f32 / (2 * maxidx) as f32;
        let mut sum = bins[0] as f32 - avg;
        let mut best = 0.;
        for (j, &count) in bins.iter().enumerate().take(2 * maxidx).skip(1) {
            sum = count as f32 - avg + sum;
            if sum > best {
                best = sum;
                second = j
            }
        }
    }
    let threshold = (percentile.max(second).max(30) as f32 + 0.5) / 127.;
    Ok((
        threshold,
        json!({"votes":total,"bins":bins.to_vec(),"threshold":threshold,"native_second_denominator_zero":maxidx==0,"zero_denominator_policy":"Unused native NaN intermediate skipped when loop empty; threshold selection unchanged"}),
    ))
}
fn final_phase(n: usize, p: usize, k: &[f32]) -> (i32, &[f32]) {
    match (n, p) {
        (2, 0) => (-1, &k[..3]),
        (2, 1) => (0, &k[3..5]),
        (3, 0) => (-1, &k[5..7]),
        (3, 1) => (-1, &k[7..10]),
        (3, 2) => (0, &k[10..12]),
        (4, 0) => (-1, &k[12..14]),
        (4, 1) => (-1, &k[14..17]),
        (4, 2) => (0, &k[17..19]),
        (4, 3) => (0, &k[19..21]),
        _ => unreachable!(),
    }
}
pub struct Processor {
    plan: Plan,
    kernels: BTreeMap<String, Vec<f32>>,
    pub provenance: Value,
}
pub struct Outcome {
    pub state: State,
    pub stages: Vec<Value>,
    pub histogram: Value,
    pub bindings: Value,
    pub recipe: Value,
}
impl Processor {
    pub(crate) fn no_enhancement(correlation: f32, frame_count: usize) -> Result<Self> {
        Ok(Self {
            plan: Plan::no_enhancement(correlation, frame_count)?,
            kernels: BTreeMap::new(),
            provenance: json!({"policy":"no-enhancement-temporal-v1"}),
        })
    }

    pub fn plan(&self) -> &Plan {
        &self.plan
    }
    pub fn load(assets: &Path, resources: &Path, settings: Settings) -> Result<Self> {
        Self::from_source(
            &crate::resources::Files(assets),
            &crate::resources::Files(resources),
            settings,
        )
    }
    pub fn from_source(
        assets: &dyn crate::resources::Source,
        resources: &dyn crate::resources::Source,
        settings: Settings,
    ) -> Result<Self> {
        let plan = Plan::from_source(assets, resources, settings)?;
        let name = "convex-sri-convolution-coefficients.json";
        let raw = resources.read(name, 65536)?;
        const HASH: &str = "f3a88ac8f628c9b84287dbfe39b32ded023cfccc7f166001350f2f568693cd8e";
        if archive::sha(&raw) != HASH {
            return Err("Require complete known convex SRI coefficients JSON".into());
        }
        let v: Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
        let mut kernels = BTreeMap::new();
        for (name, count) in [
            ("SRI_DownSampling", 9),
            ("SRI_UpSampling", 81),
            ("SRI_UpSamplingN", 15),
            ("SRI_UpSamplingN_final", 21),
            ("FrameCorrelation_Coef", 25),
        ] {
            let values = v["kernels"][name]["f32_values"]
                .as_array()
                .filter(|v| v.len() == count)
                .ok_or("Invalid SRI coefficient vector")?
                .iter()
                .map(|v| {
                    v.as_f64()
                        .map(|n| n as f32)
                        .filter(|v| v.is_finite())
                        .ok_or_else(|| "Invalid SRI coefficient".to_owned())
                })
                .collect::<Result<Vec<_>>>()?;
            kernels.insert(name.to_string(), values);
        }
        let provenance = json!({"plan":plan.provenance,"coefficient_file":name,"coefficient_sha256":HASH,"payload_embedded":false});
        Ok(Self {
            plan,
            kernels,
            provenance,
        })
    }
    /// Selected temporal-only path. Same byte quantization/history; no per-pixel map lookups.
    pub(crate) fn process_live(
        &self,
        compound: &[u8],
        rdh: &[u8],
        before: &State,
    ) -> Result<Outcome> {
        if self.plan.provenance["policy"] != "no-enhancement-temporal-v1" {
            return self.process(compound, rdh, before);
        }
        if compound.len() != EXTERNAL_BYTES
            || rdh.len() != EXTERNAL_BYTES
            || self.plan.recipe["frame_count_before"] != before.frame_count
        {
            return Err("Require exact temporal inputs and matching frame count".into());
        }
        let mut images = before.images.clone();
        let mut reformatted = images[&0x308].clone();
        for y in 0..320 {
            for x in 0..128 {
                for c in 0..4 {
                    let source_y = (y as i32 - 32 + 256 * c as i32).clamp(0, 1023) as usize;
                    reformatted.bytes[(y * 128 + x) * 4 + c] =
                        compound[(source_y * 64 + (x >> 2)) * 4 + (x & 3)];
                }
            }
        }
        images.insert(0x308, reformatted);
        copy(&mut images, 0x308, 0x350, 128, 320)?;
        let color = f32::from_bits(
            self.plan.recipe["operations"][2]["color_f32_bits"]
                .as_u64()
                .unwrap() as u32,
        );
        let mask = images.get_mut(&0x530).unwrap();
        for y in 0..160 {
            mask.bytes[y * mask.w * 4..y * mask.w * 4 + 64 * 4].fill(unorm(color));
        }
        let current = &images[&0x350];
        let history = &images[&0x538];
        let mask = &images[&0x530];
        let mut output = images[&0x548].clone();
        for y in 0..320 {
            for x in 0..128 {
                for c in 0..4 {
                    let k = mask.bytes[((y / 2) * mask.w + (x >> 1)) * 4 + c] as f32 / 255.;
                    let previous = history.bytes[(y * history.w + x) * 4 + c] as f32 / 255.;
                    let now = current.bytes[(y * current.w + x) * 4 + c] as f32 / 255.;
                    output.bytes[(y * output.w + x) * 4 + c] = unorm(previous * k + now * (1. - k));
                }
            }
        }
        images.insert(0x548, output);
        copy(&mut images, 0x548, 0x538, 128, 320)?;
        copy(&mut images, 0x3b8, 0x540, 64, 160)?;
        let corr = if before.frame_count < 2 {
            f32::from_bits(
                self.plan.recipe["effective_mask_correlation_bits"]
                    .as_u64()
                    .unwrap() as u32,
            )
        } else {
            before.bound_mask_correlation
        };
        Ok(Outcome {
            state: State {
                frame_count: (before.frame_count + 1).min(2),
                bound_mask_correlation: corr,
                images,
            },
            stages: Vec::new(),
            histogram: Value::Null,
            bindings: self.plan.bindings.clone(),
            recipe: self.plan.recipe.clone(),
        })
    }

    pub fn process(&self, compound: &[u8], rdh: &[u8], before: &State) -> Result<Outcome> {
        if compound.len() != EXTERNAL_BYTES
            || rdh.len() != EXTERNAL_BYTES
            || self.plan.recipe["frame_count_before"] != before.frame_count
        {
            return Err(
                "Require exact native64x1024 inputs and matching explicit SRI frame count".into(),
            );
        }
        let mut a = before.images.clone();
        for (s, b) in [(0x22f0, compound), (0x2310, rdh)] {
            a.insert(
                s,
                Image {
                    w: 64,
                    h: 1024,
                    kind: Kind::Unorm,
                    bytes: b.to_vec(),
                },
            );
        }
        let mut bindings = self.plan.bindings.clone();
        let mut recipe = self.plan.recipe.clone();
        let corr = if before.frame_count < 2 {
            f32::from_bits(recipe["effective_mask_correlation_bits"].as_u64().unwrap() as u32)
        } else {
            before.bound_mask_correlation
        };
        let hex = corr
            .to_bits()
            .to_le_bytes()
            .iter()
            .map(|v| format!("{v:02x}"))
            .collect::<String>();
        for b in bindings.as_array_mut().unwrap() {
            if b["kernel_slot"] == "0x518" && b["argument"] == 3 {
                b["value"]["value_hex"] = json!(hex)
            }
        }
        recipe["effective_mask_correlation_bits"] = json!(corr.to_bits());
        recipe["images_computed"] = json!(true);
        recipe["historical_bound_mask_preserved"] = json!(before.frame_count >= 2);
        let n = recipe["N"].as_u64().unwrap() as usize;
        let offset = [0, 0, 16, 22, 24][n];
        let bank = f32s(&self.plan.coarse);
        let kernels = &self.kernels;
        #[allow(unused_mut)] // Diagnostic hashes are omitted in the browser build.
        let mut stages = Vec::new();
        let mut hist = Value::Null;
        for op in recipe["operations"].as_array().unwrap() {
            match op["operation"].as_str().unwrap() {
                "copy_image" => copy(
                    &mut a,
                    slot(op["source"].as_str().unwrap()),
                    slot(op["destination"].as_str().unwrap()),
                    op["region"][0].as_u64().unwrap() as usize,
                    op["region"][1].as_u64().unwrap() as usize,
                )?,
                "fill_image" => {
                    let s = slot(op["destination"].as_str().unwrap());
                    let v = f32::from_bits(op["color_f32_bits"].as_u64().unwrap() as u32);
                    stage(&mut a, s, 64, 160, |_, _, _, _| v)?
                }
                "kernel" => {
                    let kernel = slot(op["slot"].as_str().unwrap());
                    let w = op["global"][0].as_u64().unwrap() as usize;
                    let h = op["global"][1].as_u64().unwrap() as usize;
                    let mut im = [0u16; 9];
                    let mut scalar = [0u32; 9];
                    for b in bindings
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter(|b| slot(b["kernel_slot"].as_str().unwrap()) == kernel)
                    {
                        let j = b["argument"].as_u64().unwrap() as usize;
                        if b["value"]["kind"] == "scalar32" {
                            let s = b["value"]["value_hex"].as_str().unwrap();
                            let bytes: Vec<_> = s
                                .as_bytes()
                                .as_chunks::<2>()
                                .0
                                .iter()
                                .map(|v| {
                                    u8::from_str_radix(std::str::from_utf8(v).unwrap(), 16).unwrap()
                                })
                                .collect();
                            scalar[j] = u32::from_le_bytes(bytes.try_into().unwrap());
                        } else {
                            im[j] = match b["value"]["source"].as_str().unwrap() {
                                "compound_output" => 0x22f0,
                                "native_RDH64" => 0x2310,
                                s => slot(s),
                            }
                        }
                    }
                    match kernel {
                        0x220 => stage(&mut a, im[1], w, h, |a, x, y, c| {
                            get(a, im[0], x >> 2, y - 32 + 256 * c as i32, (x & 3) as usize)
                        })?,
                        0x228 | 0x230 => stage(&mut a, im[1], w, h, |a, x, y, c| {
                            let (dx, dy) = if kernel == 0x228 { (0, 1) } else { (1, 0) };
                            let u = get(a, im[0], x - dx, y - dy, c);
                            let v = get(a, im[0], x, y, c);
                            let z = get(a, im[0], x + dx, y + dy, c);
                            let k = if kernel == 0x228 {
                                0.
                            } else {
                                get(a, im[2], x, y - 32 + 256 * c as i32, 0)
                            };
                            let flag = if u - v >= 8.5 / 255. && z - v >= 8.5 / 255. {
                                k + (0.25 - k)
                            } else {
                                k
                            };
                            (u + z) * flag + v * (1. - flag * 2.)
                        })?,
                        0x238 => stage(&mut a, im[1], w, h, |a, x, y, c| {
                            vector(&a[&im[0]], x, y, c, -1, &[0.25, 0.5, 0.25], true)
                        })?,
                        0x240 => {
                            let mut dst = [a[&im[1]].clone(), a[&im[2]].clone(), a[&im[3]].clone()];
                            for y in 0..h {
                                for x in 0..w {
                                    for c in 0..4 {
                                        let mut sum = get(&a, im[0], x as i32, (y * n) as i32, c);
                                        for d in 1..n {
                                            sum += get(&a, im[0], x as i32, (y * n + d) as i32, c)
                                        }
                                        sum *= match n {
                                            2 => 0.5,
                                            3 => 0.3333333,
                                            _ => 0.25,
                                        };
                                        dst[0].set(x, y + offset, c, sum)?;
                                        dst[1].set(x, y + offset, c, sum)?;
                                        for d in 0..n {
                                            dst[2].set(x, y * n + d, c, sum)?
                                        }
                                    }
                                }
                            }
                            for (s, i) in [im[1], im[2], im[3]].into_iter().zip(dst) {
                                a.insert(s, i);
                            }
                        }
                        0x248 => {
                            let len = [0, 0, 128, 86, 64][n];
                            let mut dst = a[&im[1]].clone();
                            for y in 0..h {
                                for x in 0..w {
                                    for c in 0..4 {
                                        let first = if c == 0 {
                                            get(&a, im[0], x as i32, 32, 0)
                                        } else {
                                            get(&a, im[0], x as i32, (len + y) as i32, c - 1)
                                        };
                                        let last = if c == 3 {
                                            get(&a, im[0], x as i32, (len + 31) as i32, 3)
                                        } else {
                                            get(&a, im[0], x as i32, (32 + y) as i32, c + 1)
                                        };
                                        dst.set(x, y, c, first)?;
                                        dst.set(x, 32 + len + y, c, last)?
                                    }
                                }
                            }
                            a.insert(im[1], dst);
                        }
                        0x250 => {
                            let (kstart, k) = match n {
                                2 => (-1, &kernels["SRI_UpSamplingN"][..4]),
                                3 => (-2, &kernels["SRI_UpSamplingN"][4..9]),
                                _ => (-2, &kernels["SRI_UpSamplingN"][9..]),
                            };
                            stage(&mut a, im[2], w, h, |a, x, y, c| {
                                get(a, im[0], x, y, c)
                                    - vector(&a[&im[1]], x, y, c, kstart, k, true)
                            })?
                        }
                        0x268 => {
                            stage(&mut a, im[1], w, h, |a, x, y, c| {
                                convolution(
                                    &a[&im[0]],
                                    2 * x,
                                    2 * y,
                                    c,
                                    &[-1, 0, 1],
                                    &[-1, 0, 1],
                                    &kernels["SRI_DownSampling"],
                                )
                            })?;
                            copy(&mut a, im[1], im[2], w, h)?
                        }
                        0x270 => stage(&mut a, im[2], 2 * w, 2 * h, |a, x, y, c| {
                            get(a, im[0], x, y, c)
                                - polyphase(&a[&im[1]], x, y, c, &kernels["SRI_UpSampling"])
                        })?,
                        0x280 => {
                            for (dst, vertical) in [(im[1], false), (im[2], true)] {
                                stage(&mut a, dst, w, h, |a, x, y, c| {
                                    let mut v = 0.;
                                    for (d, k) in [
                                        (-3, 0.125),
                                        (-2, 0.5),
                                        (-1, 0.625),
                                        (1, -0.625),
                                        (2, -0.5),
                                        (3, -0.125),
                                    ] {
                                        v += get(
                                            a,
                                            im[0],
                                            x + if vertical { 0 } else { d },
                                            y + if vertical { d } else { 0 },
                                            c,
                                        ) * k
                                    }
                                    v * 2.
                                })?
                            }
                        }
                        0x288 => {
                            for (dst, angle) in [(im[2], false), (im[3], true)] {
                                stage(&mut a, dst, w, h, |a, x, y, c| {
                                    let gx = vector(
                                        &a[&im[0]],
                                        x,
                                        y,
                                        c,
                                        -2,
                                        &[0.0625, 0.25, 0.375, 0.25, 0.0625],
                                        true,
                                    );
                                    let gy = vector(
                                        &a[&im[1]],
                                        x,
                                        y,
                                        c,
                                        -2,
                                        &[0.0625, 0.25, 0.375, 0.25, 0.0625],
                                        false,
                                    );
                                    if angle {
                                        let v = gy.atan2(gx) / std::f32::consts::PI;
                                        v + if v <= 0. { 1. } else { 0. }
                                    } else {
                                        gx.hypot(gy)
                                    }
                                })?
                            }
                        }
                        0x290 => {
                            let (t, report) = histogram(&a[&im[0]], n, f32::from_bits(scalar[2]))?;
                            hist = report;
                            stage(&mut a, im[1], w, 160, |a, x, y, c| {
                                if get(a, im[0], x, y, c) >= t { 1. } else { 0. }
                            })?
                        }
                        0x298 => stage(&mut a, im[1], w, h, |a, x, y, c| {
                            if neighbors(&a[&im[0]], x, y, c, true) >= 2.5 {
                                1.
                            } else {
                                0.
                            }
                        })?,
                        0x2a0 => {
                            stage(&mut a, im[2], w, h, |a, x, y, c| {
                                get(a, im[1], x, y, c)
                                    * if neighbors(&a[&im[0]], x, y, c, true) >= 4.5 {
                                        1.
                                    } else {
                                        0.
                                    }
                            })?;
                            stage(&mut a, im[3], w, h, |a, x, y, c| {
                                ((neighbors(&a[&im[0]], x, y, c, true) - 5.) * 0.25).clamp(0., 1.)
                            })?
                        }
                        0x2a8 => stage(&mut a, im[2], w, h, |a, x, y, c| {
                            direction(&a[&im[0]], &a[&im[1]], x, y, c)
                        })?,
                        0x2b0 => {
                            for y in 0..h {
                                for x in 0..w {
                                    for c in 0..4 {
                                        if !(0. ..=8.)
                                            .contains(&get(&a, im[1], x as i32, y as i32, c))
                                        {
                                            return Err("Direction outside convex SRI bank".into());
                                        }
                                    }
                                }
                            }
                            stage(&mut a, im[3], w, h, |a, x, y, c| {
                                let dir = get(a, im[1], x, y, c) as usize;
                                convolution(
                                    &a[&im[0]],
                                    x,
                                    y,
                                    c,
                                    &[-2, -1, 0, 1, 2],
                                    &[-2, -1, 0, 1, 2],
                                    &bank[25 * dir..25 * (dir + 1)],
                                )
                            })?
                        }
                        0x2b8 => {
                            let contrast = f32::from_bits(scalar[6]);
                            let enhance = f32::from_bits(scalar[7]);
                            let mix = f32::from_bits(scalar[8]);
                            stage(&mut a, im[4], w, h, |a, x, y, c| {
                                let v = get(a, im[0], x, y, c);
                                let t = (v * 8. - neighbors(&a[&im[0]], x, y, c, false)) * enhance;
                                let sharp = t.clamp(-0.046875, 0.125)
                                    * get(a, im[2], x, y, c).min(1.)
                                    * get(a, im[3], x, y, c)
                                    + v;
                                let target = (0.125 + (sharp - 0.125) * contrast).clamp(0., 1.);
                                let base = get(a, im[1], x, y, c);
                                base + (target - base) * mix
                            })?
                        }
                        0x2c0 => {
                            stage(&mut a, im[2], 2 * w, 2 * h, |a, x, y, c| {
                                (polyphase(&a[&im[0]], x, y, c, &kernels["SRI_UpSampling"])
                                    + get(a, im[1], x, y, c))
                                .clamp(0., 1.)
                            })?;
                            copy(&mut a, im[2], im[3], 2 * w, 2 * h)?
                        }
                        0x260 => stage(&mut a, im[2], w, n * h, |a, x, y, c| {
                            if n == 1 {
                                return get(a, im[0], x, y, c);
                            }
                            let (o, k) =
                                final_phase(n, y as usize % n, &kernels["SRI_UpSamplingN_final"]);
                            (vector(&a[&im[0]], x, y / n as i32 + offset as i32, c, o, k, true)
                                + get(a, im[1], x, y, c))
                            .clamp(0., 1.)
                        })?,
                        0x518 => {
                            let corr = f32::from_bits(scalar[3]);
                            stage(&mut a, im[2], w, h, |a, x, y, c| {
                                let d = (get(a, im[0], x, y, c) - get(a, im[1], x, y, c))
                                    .abs()
                                    .clamp(0., 0.196078);
                                if corr == 0. {
                                    0.
                                } else if d > 0.117647 {
                                    (0.196078 - d) / (0.196078 - 0.117647) * corr
                                } else {
                                    (0.117647 - d) / 0.117647 * (0.5 - corr * 0.5) + corr
                                }
                            })?
                        }
                        0x520 => stage(&mut a, im[1], w, h, |a, x, y, c| {
                            convolution(
                                &a[&im[0]],
                                x,
                                y,
                                c,
                                &[-2, -1, 0, 1, 2],
                                &[-2, -1, 0, 1, 2],
                                &kernels["FrameCorrelation_Coef"],
                            )
                        })?,
                        0x510 => stage(&mut a, im[3], w, h, |a, x, y, c| {
                            let k = get(a, im[2], x >> 1, y / (2 * n as i32), c);
                            get(a, im[1], x, y, c) * k + get(a, im[0], x, y, c) * (1. - k)
                        })?,
                        _ => return Err(format!("Unsupported General SRI dispatch{kernel:04x}")),
                    }
                }
                _ => return Err("Unknown SRI recipe operation".into()),
            }
            #[cfg(not(target_arch = "wasm32"))]
            {
                let hashes: Vec<_> = a
                    .iter()
                    .filter(|(s, _)| **s < 0x1000)
                    .map(
                        |(s, i)| json!({"slot":format!("{s:04x}"),"sha256":archive::sha(&i.bytes)}),
                    )
                    .collect();
                stages.push(json!({"operation":op,"images":hashes}));
            }
        }
        a.remove(&0x22f0);
        a.remove(&0x2310);
        let state = State {
            frame_count: (before.frame_count + 1).min(2),
            bound_mask_correlation: corr,
            images: a,
        };
        Ok(Outcome {
            state,
            stages,
            histogram: hist,
            bindings,
            recipe,
        })
    }
}
fn f32s(b: &[u8]) -> Vec<f32> {
    b.as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn full_state_and_domain_are_mandatory() {
        let meta = json!({"schema_version":"convex-sri-state-v1","policy":POLICY,"frame_count":2,"bound_mask_correlation_bits":0.4_f32.to_bits()});
        let files: Vec<_> = template()
            .iter()
            .map(|(_, w, h, _)| vec![173; w * h * 4])
            .collect();
        let s = State::from_bytes(&meta, files.clone()).unwrap();
        assert_eq!(
            s.files().iter().map(|(_, b)| b.len()).sum::<usize>(),
            5038080
        );
        assert_eq!(s.metadata(), meta);
        let mut bad = meta.clone();
        bad["bound_mask_correlation_bits"] = json!(f32::NAN.to_bits());
        assert!(State::from_bytes(&bad, files.clone()).is_err());
        let mut short = files;
        short.pop();
        assert!(State::from_bytes(&meta, short).is_err());
    }
    #[test]
    fn copy_retains_native_tails_and_signed_roundtrip() {
        let mut a = Images::new();
        for s in [1, 2] {
            a.insert(
                s,
                Image {
                    w: 4,
                    h: 4,
                    kind: Kind::Unorm,
                    bytes: vec![s as u8; 64],
                },
            );
        }
        copy(&mut a, 1, 2, 2, 3).unwrap();
        assert_eq!(a[&2].bytes[8], 2);
        assert_eq!(a[&2].bytes[32], 1);
        assert_eq!(a[&2].bytes[48], 2);
        let mut i = Image {
            w: 1,
            h: 1,
            kind: Kind::Snorm,
            bytes: vec![0; 4],
        };
        i.set(0, 0, 0, -1.).unwrap();
        assert_eq!(i.bytes[0], 129);
        assert_eq!(i.get(0, 0, 0), -1.);
        assert!(i.set(0, 1, 0, 0.).is_err());
        i.kind = Kind::Int;
        assert!(i.set(0, 0, 0, 9.).is_err());
    }
    #[test]
    fn temporal_live_matches_generic_all_backings_and_retained_tails() {
        let files: Vec<Vec<u8>> = template()
            .iter()
            .enumerate()
            .map(|(j, (_, w, h, _))| (0..w * h * 4).map(|i| (i * 19 + j * 71) as u8).collect())
            .collect();
        for corr in [0f32, 0.37, 1.] {
            let meta = json!({"schema_version":"convex-sri-state-v1","policy":POLICY,"frame_count":0,"bound_mask_correlation_bits":0f32.to_bits()});
            let mut generic = State::from_bytes(&meta, files.clone()).unwrap();
            let mut live = generic.clone();
            for step in 0..4 {
                let p = Processor::no_enhancement(corr, generic.frame_count).unwrap();
                let compound: Vec<u8> = (0..EXTERNAL_BYTES)
                    .map(|i| (i * 43 + i / 11 + step * 17) as u8)
                    .collect();
                let rdh = vec![0; EXTERNAL_BYTES];
                generic = p.process(&compound, &rdh, &generic).unwrap().state;
                live = p.process_live(&compound, &rdh, &live).unwrap().state;
                assert_eq!(live.metadata(), generic.metadata());
                assert_eq!(live.files(), generic.files());
            }
        }
    }
}
