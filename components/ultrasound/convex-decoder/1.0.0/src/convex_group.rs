// SPDX-License-Identifier: AGPL-3.0-or-later
//! Native B/BM size-publication model, fed by the bounded 32C inspector.
//! A publication is a numerical input candidate, never a physical frame claim.
use crate::{
    HEADER_BYTES, MARKER, PREFIX_BYTES, Parameters, Result, Segment, archive, line_length,
};
use serde_json::{Value, json};
use std::sync::Arc;

pub const POLICY: &str = "new-organizer-per-observed-epoch-v1";
#[derive(Clone, Copy)]
pub struct Settings {
    pub b_capacity: usize,
    pub m_capacity: usize,
    pub m_lines: usize,
    pub bm_26: u16,
    pub bm_28: u32,
}
impl Settings {
    pub fn parse(v: &Value) -> Result<Self> {
        let keys = [
            "schema_version",
            "epoch_policy",
            "b_capacity_bytes",
            "m_capacity_bytes",
            "m_line_count",
            "bm_header_26",
            "bm_header_28",
        ];
        let o = v.as_object().ok_or("Require explicit grouping settings")?;
        if o.len() != keys.len()
            || o.keys().any(|k| !keys.contains(&k.as_str()))
            || v["schema_version"] != "convex-b-grouping-settings-v1"
            || v["epoch_policy"] != POLICY
        {
            return Err("Require exact convex-b-grouping-settings-v1 and explicit new-organizer epoch policy".into());
        }
        let get = |k: &str| {
            v[k].as_u64()
                .ok_or_else(|| format!("Invalid grouping setting {k}"))
        };
        let s = Self {
            b_capacity: usize::try_from(get("b_capacity_bytes")?).map_err(|e| e.to_string())?,
            m_capacity: usize::try_from(get("m_capacity_bytes")?).map_err(|e| e.to_string())?,
            m_lines: usize::try_from(get("m_line_count")?).map_err(|e| e.to_string())?,
            bm_26: u16::try_from(get("bm_header_26")?).map_err(|e| e.to_string())?,
            bm_28: u32::try_from(get("bm_header_28")?).map_err(|e| e.to_string())?,
        };
        s.validate()?;
        Ok(s)
    }
    fn validate(self) -> Result<()> {
        if !(1..=8 * 1024 * 1024).contains(&self.b_capacity)
            || !(1..=8 * 1024 * 1024).contains(&self.m_capacity)
            || !(1..=65535).contains(&self.m_lines)
        {
            return Err("Require capacities1..8MiB and M line count1..65535".into());
        }
        Ok(())
    }
}
fn counter(h: &[u8]) -> u32 {
    u32::from_le_bytes(h[12..16].try_into().unwrap())
}
fn short(h: &[u8], at: usize) -> u16 {
    u16::from_le_bytes(h[at..at + 2].try_into().unwrap())
}
fn expected(h: &[u8], p: Parameters) -> Result<usize> {
    let length = line_length(0, short(h, 24), 0, Some(p), i32::MAX as usize)?;
    let n = length
        .checked_mul(usize::from(short(h, 28)))
        .ok_or("Group length overflow")?;
    if n > i32::MAX as usize {
        return Err("Native signed group length domain exceeded".into());
    }
    Ok(n)
}
#[derive(Clone)]
pub struct Line {
    pub offset: u64,
    pub bytes: Vec<u8>,
    pub wire_header: Arc<[u8]>,
    pub wire_header_offset: u64,
}
pub struct Group {
    pub lines: Vec<Line>,
    pub algorithm_header: Vec<u8>,
    pub publication_wire_header: Arc<[u8]>,
    pub expected_bytes: usize,
}
impl Group {
    pub fn bytes(&self) -> Vec<u8> {
        self.lines
            .iter()
            .flat_map(|l| l.bytes.iter().copied())
            .collect()
    }
    pub fn audit(&self) -> Value {
        let first = &self.lines[0];
        let e = short(&first.bytes, 4) as usize;
        let uniform = self.lines.iter().all(|l| {
            l.bytes.len() == e * 4
                && short(&l.bytes, 4) as usize == e
                && l.wire_header == first.wire_header
        });
        let header_matches = self.algorithm_header.as_slice() == first.wire_header.as_ref();
        let geometry = self.lines.len() == 32
            && uniform
            && e >= 8
            && self.expected_bytes == 32 * e * 4
            && short(&self.algorithm_header, 28) == 32;
        json!({"line_words":e,"line_count":self.lines.len(),"uniform_lengths_and_wire_headers":uniform,
            "algorithm_header_equals_first_wire_header":header_matches,
            "general_bfsp_length_compatible":geometry,
            "assets_settings_and_bfsp_domain_audited":false,
            "source_header_counter":counter(&first.wire_header),"algorithm_header_counter":counter(&self.algorithm_header),
            "physical_frame_complete":null,"spatial_line_indices_validated":false,
            "line_sources":self.lines.iter().map(|l|json!({"offset":l.offset,"bytes":l.bytes.len(),"sha256":archive::sha(&l.bytes),"wire_header_offset":l.wire_header_offset,"wire_header_sha256":archive::sha(&l.wire_header)})).collect::<Vec<_>>()})
    }
}
pub struct Step {
    pub events: Vec<Value>,
    pub group: Option<Group>,
}
impl Step {
    fn new() -> Self {
        Self {
            events: Vec::new(),
            group: None,
        }
    }
}

pub struct Organizer {
    p: Parameters,
    s: Settings,
    wire: Option<Arc<[u8]>>,
    wire_offset: u64,
    current: Vec<u8>,
    remembered_b: Vec<u8>,
    remembered_bm: Vec<u8>,
    expected_b: usize,
    expected_bm: usize,
    expected_m: usize,
    b: Vec<Line>,
    b_bytes: usize,
    m_bytes: usize,
}
impl Organizer {
    pub fn snapshot(&self) -> Value {
        json!({"B_bytes":self.b_bytes,"M_bytes":self.m_bytes,"expected_B":self.expected_b,
            "expected_BM":self.expected_bm,"expected_M":self.expected_m,
            "current_header_sha256":archive::sha(&self.current),
            "remembered_B_sha256":archive::sha(&self.remembered_b),
            "remembered_BM_sha256":archive::sha(&self.remembered_bm)})
    }
    pub fn new(p: Parameters, s: Settings) -> Result<Self> {
        s.validate()?;
        // Negative/overflowing native configurations are not reproduced.
        if p.a < 0 || p.c <= 0 || (p.a == 1 && p.c < 2) {
            return Err("Require nonnegative A and positive effective C for B grouping".into());
        }
        Ok(Self {
            p,
            s,
            wire: None,
            wire_offset: 0,
            current: vec![0; HEADER_BYTES],
            remembered_b: vec![0; HEADER_BYTES],
            remembered_bm: vec![0; HEADER_BYTES],
            expected_b: 0,
            expected_bm: 0,
            expected_m: 0,
            b: Vec::new(),
            b_bytes: 0,
            m_bytes: 0,
        })
    }
    fn drop_b(&mut self, why: &str, step: &mut Step) {
        if self.b_bytes != 0 {
            step.events.push(json!({"event":"discard_B","reason":why,"bytes":self.b_bytes,
                "line_sources":self.b.iter().map(|l|json!({"offset":l.offset,"bytes":l.bytes.len(),"sha256":archive::sha(&l.bytes)})).collect::<Vec<_>>() }));
        }
        self.b.clear();
        self.b_bytes = 0;
    }
    fn drop_m(&mut self, why: &str, step: &mut Step) {
        if self.m_bytes != 0 {
            step.events
                .push(json!({"event":"discard_M","reason":why,"bytes":self.m_bytes}));
        }
        self.m_bytes = 0;
    }
    /// This is an explicit new organizer, NOT native Clear or a DSP reset.
    pub fn boundary(&mut self, reason: &str) -> Result<Step> {
        let mut step = Step::new();
        self.drop_b(reason, &mut step);
        self.drop_m(reason, &mut step);
        step.events.push(json!({"event":"new_organizer_boundary","reason":reason,"native_Clear_emulated":false,"dsp_reset_inferred":false}));
        *self = Self::new(self.p, self.s)?;
        Ok(step)
    }
    pub fn push(&mut self, segment: &Segment) -> Result<Step> {
        let mut step = Step::new();
        if segment.kind == "frame_header" {
            if segment.bytes.len() != HEADER_BYTES
                || segment.bytes[..4] != MARKER
                || segment.bytes[4..8] != MARKER
            {
                return Err("Require complete 32C header segment".into());
            }
            self.wire = Some(Arc::from(segment.bytes.as_slice()));
            self.wire_offset = segment.offset;
            self.current = segment.bytes.clone();
            step.events.push(json!({"event":"wire_header","offset":segment.offset,"bytes":HEADER_BYTES,"sha256":archive::sha(&segment.bytes),"counter":counter(&self.current),"mode":self.current[16]}));
            return Ok(step);
        }
        if segment.kind != "line" {
            return self.boundary(segment.kind);
        }
        let Some(wire) = &self.wire else {
            return Err("Line segment without header context".into());
        };
        let wire = wire.clone();
        let line = &segment.bytes;
        if line.len() < PREFIX_BYTES || line[..4] != MARKER {
            return Err("Invalid complete line segment".into());
        }
        let mode = self.current[16];
        let bm = matches!(mode, 5 | 6);
        if !matches!(mode, 0 | 1 | 5 | 6) {
            step.events.push(json!({"event":"non_B_line","mode":mode,"offset":segment.offset,"bytes":line.len(),"B_preserved":true}));
            return Ok(step);
        }
        if !line.len().is_multiple_of(4) {
            // Native reader copies (formula_length >> 2) words, unlike the
            // lossless Inspector's exact-byte segment. Do not invent a native
            // publication from those additional bytes or silently drop them.
            let mut rejected = self.boundary("non_word_native_line")?;
            rejected.events.push(json!({"event":"line_domain_rejected","reason":"native reader truncates copied bytes to words",
                "offset":segment.offset,"observed_segment_bytes":line.len(),"native_floor_copy_bytes":line.len()/4*4}));
            return Ok(rejected);
        }
        let word = u32::from_le_bytes(line[4..8].try_into().unwrap());
        if line_length(
            mode,
            short(&self.current, 24),
            word,
            Some(self.p),
            1024 * 1024,
        )? != line.len()
        {
            return Err("Line length disagrees with declared parser geometry".into());
        }
        let changed = counter(&self.current)
            != counter(if bm {
                &self.remembered_bm
            } else {
                &self.remembered_b
            });
        if changed {
            self.drop_b("counter_changed", &mut step);
            if bm {
                self.drop_m("BM_counter_changed", &mut step);
            }
            match expected(&self.current, self.p) {
                Ok(n) => {
                    if bm {
                        self.expected_bm = n;
                        self.expected_m =
                            (32 + 2 * usize::from(short(&self.current, 24))) * self.s.m_lines;
                        if self.expected_m > i32::MAX as usize {
                            self.expected_bm = 0;
                            self.expected_m = 0;
                            step.events.push(json!({"event":"native_numeric_domain_rejected","reason":"M signed length domain exceeded","offset":segment.offset}));
                        }
                    } else {
                        self.expected_b = n;
                    }
                }
                Err(e) => {
                    if bm {
                        self.expected_bm = 0;
                        self.expected_m = 0;
                    } else {
                        self.expected_b = 0;
                    }
                    step.events.push(json!({"event":"native_numeric_domain_rejected","reason":e,"offset":segment.offset}));
                }
            }
        }
        let target = if bm {
            self.expected_bm
        } else {
            self.expected_b
        };
        let subtype = (word >> 20) & 15;
        step.events.push(json!({"event":"line","offset":segment.offset,"bytes":line.len(),"counter":counter(&self.current),
            "mode":mode,"subtype":if bm{Some(subtype)}else{None},"expected_B_bytes":target,"expected_M_bytes":if bm{Some(self.expected_m)}else{None}}));
        if target == 0 || (bm && self.expected_m == 0) {
            step.events.push(json!({"event":"line_not_accumulated","reason":"zero_expected_length","offset":segment.offset}));
            // Native jumps past the remembered-header update on this path.
            return Ok(step);
        } else if !bm || subtype < 4 {
            if line.len() > self.s.b_capacity.saturating_sub(self.b_bytes) {
                self.drop_b("B_capacity", &mut step);
                if bm {
                    self.drop_m("B_capacity", &mut step);
                }
                step.events.push(json!({"event":"line_not_accumulated","reason":"B_capacity","offset":segment.offset}));
            } else {
                self.b.push(Line {
                    offset: segment.offset,
                    bytes: line.clone(),
                    wire_header: wire.clone(),
                    wire_header_offset: self.wire_offset,
                });
                self.b_bytes += line.len();
                if self.b_bytes == target {
                    let header = if bm {
                        self.current[0x26..0x28].copy_from_slice(&self.s.bm_26.to_le_bytes());
                        self.current[0x28..0x2c].copy_from_slice(&self.s.bm_28.to_le_bytes());
                        self.current.clone()
                    } else {
                        self.remembered_b.clone()
                    };
                    step.group = Some(Group {
                        lines: std::mem::take(&mut self.b),
                        algorithm_header: header,
                        publication_wire_header: wire,
                        expected_bytes: target,
                    });
                    self.b_bytes = 0;
                    step.events.push(json!({"event":"native_B_size_publication","bytes":target,"FIFO_schedule_observed":false,"physical_frame_complete":null}));
                } else if self.b_bytes > target {
                    self.drop_b("over_expected_B_length", &mut step);
                }
            }
        } else if subtype == 4 {
            if line.len() > self.s.m_capacity.saturating_sub(self.m_bytes) {
                self.drop_b("M_capacity", &mut step);
                self.drop_m("M_capacity", &mut step);
                step.events.push(json!({"event":"line_not_accumulated","reason":"M_capacity","offset":segment.offset}));
            } else {
                self.m_bytes += line.len();
                if self.m_bytes == self.expected_m {
                    step.events.push(json!({"event":"native_M_size_publication","bytes":self.m_bytes,"M_processing_performed":false}));
                    self.m_bytes = 0;
                } else if self.m_bytes > self.expected_m {
                    self.drop_m("over_expected_M_length", &mut step);
                }
            }
        } else {
            step.events
                .push(json!({"event":"foreign_subtype","subtype":subtype,"offset":segment.offset}));
        }
        // Native thread updates the remembered header AFTER possible publication.
        if changed {
            if bm {
                self.remembered_bm = self.current.clone();
            } else {
                self.remembered_b = self.current.clone();
            }
        }
        Ok(step)
    }
}
