// SPDX-License-Identifier: AGPL-3.0-or-later
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub type Result<T> = std::result::Result<T, String>;
pub const MARKER: [u8; 4] = [0, 0, 255, 127];
pub const HEADER_BYTES: usize = 1024;
pub const PREFIX_BYTES: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Parameters {
    pub a: i32,
    pub b: i32,
    pub c: i32,
    pub d: i32,
    pub e: i32,
}
impl Parameters {
    pub fn from_json(value: &Value) -> Result<Self> {
        let object = value
            .as_object()
            .ok_or("Parameters must be an object with exactly A,B,C,D,E")?;
        if object.len() != 5
            || object
                .keys()
                .any(|key| !["A", "B", "C", "D", "E"].contains(&key.as_str()))
        {
            return Err("Parameters require exactly A,B,C,D,E; no defaults".into());
        }
        let get = |name: &str| -> Result<i32> {
            value[name]
                .as_i64()
                .and_then(|n| i32::try_from(n).ok())
                .ok_or_else(|| {
                    format!("Parameter {name} must be an explicit signed 32-bit integer")
                })
        };
        Ok(Self {
            a: get("A")?,
            b: get("B")?,
            c: get("C")?,
            d: get("D")?,
            e: get("E")?,
        })
    }
    pub fn json(self) -> Value {
        json!({"A":self.a,"B":self.b,"C":self.c,"D":self.d,"E":self.e})
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub max_input_bytes: u64,
    pub max_push_bytes: usize,
    pub max_line_bytes: usize,
    pub max_buffer_bytes: usize,
    pub opaque_chunk_bytes: usize,
    pub max_segment_files: u64,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            max_input_bytes: 256 * 1024 * 1024,
            max_push_bytes: 64 * 1024,
            max_line_bytes: 1024 * 1024,
            max_buffer_bytes: 1024 * 1024 + 64 * 1024,
            opaque_chunk_bytes: 64 * 1024,
            max_segment_files: 100_000,
        }
    }
}
impl Limits {
    fn validate(self) -> Result<()> {
        if self.max_push_bytes == 0
            || self.max_line_bytes < PREFIX_BYTES
            || self.opaque_chunk_bytes < 8
            || self.max_input_bytes == 0
            || self.max_segment_files == 0
            || self.max_buffer_bytes
                < self
                    .max_line_bytes
                    .checked_add(self.max_push_bytes)
                    .ok_or("Buffer bound overflow")?
            || self.max_buffer_bytes
                < self
                    .opaque_chunk_bytes
                    .checked_add(8)
                    .ok_or("Opaque bound overflow")?
        {
            return Err("Inconsistent/zero resource limits".into());
        }
        Ok(())
    }
    pub fn json(self) -> Value {
        json!({"max_input_bytes":self.max_input_bytes,"max_push_bytes":self.max_push_bytes,"max_line_bytes":self.max_line_bytes,"max_buffer_bytes":self.max_buffer_bytes,"opaque_chunk_bytes":self.opaque_chunk_bytes,"max_segment_files":self.max_segment_files})
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Segment {
    pub offset: u64,
    pub kind: &'static str,
    pub bytes: Vec<u8>,
    pub metadata: Value,
    /// Counts are observations of parser conditions, never proven lost samples.
    pub diagnostics: BTreeMap<String, u64>,
}

#[derive(Clone, Copy, Debug)]
struct Frame {
    index: u64,
    offset: u64,
    id: u32,
    mode: u8,
    p: u16,
    n: u16,
}
impl Frame {
    fn json(self) -> Value {
        json!({"candidate_frame_index":self.index,"header_offset":self.offset,"frame_id":self.id,"mode":self.mode,"P":self.p,"N":self.n,"frame_complete":null})
    }
}
fn u16le(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes(bytes[offset..offset + 2].try_into().unwrap())
}
fn u32le(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
}

/// Computes the evidenced helper's signed-32-bit formula with checked arithmetic.
/// Rejecting overflow and lengths below the prefix are added defensive policies.
pub fn line_length(
    mode: u8,
    p: u16,
    word: u32,
    parameters: Option<Parameters>,
    maximum: usize,
) -> Result<usize> {
    let p = i32::from(p);
    let length = match mode {
        5 | 6 => i32::try_from((word & 0xffff) * 4).unwrap(),
        0..=3 => {
            let v = parameters.ok_or("missing_external_parameters")?;
            let effective = |x: i32, f: i32| if f == 1 { x / 2 } else { x };
            let (coefficient, scale) = match mode {
                0 | 1 => (effective(v.c, v.a), 2),
                2 => (v.d, 4),
                3 => (effective(v.e, v.b), 2),
                _ => unreachable!(),
            };
            p.checked_mul(coefficient)
                .and_then(|n| n.checked_mul(scale))
                .and_then(|n| n.checked_add(PREFIX_BYTES as i32))
                .ok_or("length_arithmetic_overflow")?
        }
        _ => return Err("unsupported_mode".into()),
    };
    if length < PREFIX_BYTES as i32 {
        return Err("length_below_prefix".into());
    }
    let length = usize::try_from(length).map_err(|_| "length_out_of_range")?;
    if length > maximum {
        return Err("line_resource_bound".into());
    }
    Ok(length)
}

/// Incremental bounded parser. push() rejects oversized chunks/input before
/// consuming them. Invalid candidate lengths remain opaque bytes with diagnostics.
/// Segment concatenation exactly reproduces input after finish(). Transport
/// boundaries have no semantic meaning; opaque chunking may span several pushes.
pub struct Inspector {
    parameters: Option<Parameters>,
    limits: Limits,
    buffer: Vec<u8>,
    received: u64,
    offset: u64,
    frame: Option<Frame>,
    frame_count: u64,
    search_cursor: usize,
    opaque_reason: &'static str,
    line_parsing: bool,
    finished: bool,
}
impl Inspector {
    pub fn new(parameters: Option<Parameters>, limits: Limits) -> Result<Self> {
        limits.validate()?;
        Ok(Self {
            parameters,
            limits,
            buffer: Vec::new(),
            received: 0,
            offset: 0,
            frame: None,
            frame_count: 0,
            search_cursor: 0,
            opaque_reason: "no_frame_context",
            line_parsing: false,
            finished: false,
        })
    }
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Segment>> {
        if self.finished {
            return Err("Inspector already finished".into());
        }
        if bytes.len() > self.limits.max_push_bytes {
            return Err("Push exceeds max_push_bytes; chunk was not consumed".into());
        }
        let total = self
            .received
            .checked_add(bytes.len() as u64)
            .ok_or("Input count overflow")?;
        if total > self.limits.max_input_bytes {
            return Err("Input exceeds max_input_bytes; chunk was not consumed".into());
        }
        if self
            .buffer
            .len()
            .checked_add(bytes.len())
            .is_none_or(|n| n > self.limits.max_buffer_bytes)
        {
            return Err("Buffer resource bound; chunk was not consumed".into());
        }
        self.received = total;
        self.buffer.extend_from_slice(bytes);
        self.process(false)
    }
    pub fn finish(&mut self) -> Result<Vec<Segment>> {
        if self.finished {
            return Err("Inspector already finished".into());
        }
        self.finished = true;
        self.process(true)
    }
    /// End this observed epoch at unknown transport continuity. The remaining
    /// candidate is retained without an EOF interpretation; no later push is allowed.
    pub fn end_at_gap(&mut self, reason: &str) -> Result<Vec<Segment>> {
        if self.finished {
            return Err("Inspector already finished".into());
        }
        let mut segments = self.process(false)?;
        self.finished = true;
        if !self.buffer.is_empty() {
            segments.push(self.take(
                self.buffer.len(),
                "discontinuous_candidate",
                json!({"reason":reason,"candidate_frame":self.frame.map(Frame::json),
                    "frame_complete":null,"sample_format":"unknown"}),
                BTreeMap::from([("transport_discontinuity".into(), 1)]),
            ));
        }
        segments.push(self.take(
            0,
            "gap",
            json!({"reason":reason,
            "missing_bytes":null,"original_wire_phase_known":false,"frame_complete":null}),
            BTreeMap::from([("transport_discontinuity".into(), 1)]),
        ));
        self.frame = None;
        self.line_parsing = false;
        Ok(segments)
    }
    pub(crate) fn allow_continuous(&mut self) {
        // Lifetime counters may grow; individual push, line and buffer bounds remain.
        self.limits.max_input_bytes = u64::MAX;
        self.limits.max_segment_files = u64::MAX;
    }
    pub fn accepted_bytes(&self) -> u64 {
        self.received
    }
    fn take(
        &mut self,
        length: usize,
        kind: &'static str,
        metadata: Value,
        diagnostics: BTreeMap<String, u64>,
    ) -> Segment {
        let bytes = self.buffer.drain(..length).collect();
        let offset = self.offset;
        self.offset += length as u64;
        self.search_cursor = self.search_cursor.saturating_sub(length);
        Segment {
            offset,
            kind,
            bytes,
            metadata,
            diagnostics,
        }
    }
    fn opaque(&mut self, length: usize, reason: &str) -> Segment {
        let mut diagnostics = BTreeMap::new();
        diagnostics.insert(reason.to_owned(), 1);
        let mut halfword = 0;
        let mut other_unaligned = 0;
        for i in 0..length {
            if self.buffer.get(i..i + 4) == Some(&MARKER) {
                match (self.offset + i as u64) % 4 {
                    2 => halfword += 1,
                    1 | 3 => other_unaligned += 1,
                    _ => (),
                }
            }
        }
        if halfword > 0 {
            diagnostics.insert("halfword_shifted_marker_observed".into(), halfword);
        }
        if other_unaligned > 0 {
            diagnostics.insert("byte_shifted_marker_observed".into(), other_unaligned);
        }
        self.take(length,"opaque",json!({"reason":reason,"candidate_frame":self.frame.map(Frame::json),"realigned":false}),diagnostics)
    }
    fn process(&mut self, eof: bool) -> Result<Vec<Segment>> {
        let mut segments = Vec::new();
        while !self.buffer.is_empty() {
            // Frames are candidates only; the next header never proves the
            // preceding frame was complete, even when N lines were observed.
            let at_header = self.buffer.len() >= 8
                && self.offset.is_multiple_of(4)
                && self.buffer[..4] == MARKER
                && self.buffer[4..8] == MARKER;
            if at_header {
                if self.buffer.len() < HEADER_BYTES {
                    if eof {
                        let mut d = BTreeMap::new();
                        d.insert("truncated_header".into(), 1);
                        segments.push(self.take(
                            self.buffer.len(),
                            "truncated_header",
                            json!({"expected_bytes":HEADER_BYTES,"frame_complete":null}),
                            d,
                        ));
                    }
                    break;
                }
                self.frame_count += 1;
                let frame = Frame {
                    index: self.frame_count,
                    offset: self.offset,
                    id: u32le(&self.buffer, 0x0c),
                    mode: self.buffer[0x10],
                    p: u16le(&self.buffer, 0x18),
                    n: u16le(&self.buffer, 0x1c),
                };
                self.frame = Some(frame);
                self.search_cursor = 0;
                let mut diagnostics = BTreeMap::new();
                self.line_parsing =
                    matches!(frame.mode, 5 | 6) || (frame.mode <= 3 && self.parameters.is_some());
                if !self.line_parsing {
                    self.opaque_reason = if frame.mode <= 3 {
                        "missing_external_parameters"
                    } else {
                        "unsupported_mode"
                    };
                    diagnostics.insert(self.opaque_reason.into(), 1);
                }
                segments.push(self.take(HEADER_BYTES, "frame_header", frame.json(), diagnostics));
                continue;
            }
            if self.line_parsing {
                let frame = self.frame.expect("line parsing follows a header");
                if !self.offset.is_multiple_of(4) {
                    // Preserve the preceding formula's exact byte length. Our
                    // four-byte search cannot corroborate the next boundary;
                    // keep subsequent bytes opaque instead of realigning.
                    self.line_parsing = false;
                    self.search_cursor = 0;
                    self.opaque_reason = "post_line_boundary_unaligned";
                    continue;
                }
                if self.buffer.len() < 8 {
                    if eof {
                        if MARKER.starts_with(&self.buffer[..self.buffer.len().min(4)]) {
                            let mut d = BTreeMap::new();
                            d.insert("truncated_line_prefix".into(), 1);
                            segments.push(self.take(self.buffer.len(),"truncated_line",json!({"candidate_frame":frame.json(),"expected_prefix_bytes":PREFIX_BYTES}),d));
                        } else {
                            let n = self.buffer.len();
                            segments.push(self.opaque(n, "desynchronization_observed"));
                        }
                    }
                    break;
                }
                if self.buffer[..4] != MARKER {
                    self.line_parsing = false;
                    self.search_cursor = 0;
                    self.opaque_reason = "desynchronization_observed";
                    continue;
                }
                let word = u32le(&self.buffer, 4);
                let length = match line_length(
                    frame.mode,
                    frame.p,
                    word,
                    self.parameters,
                    self.limits.max_line_bytes,
                ) {
                    Ok(n) => n,
                    Err(reason) => {
                        self.line_parsing = false;
                        self.search_cursor = 0;
                        self.opaque_reason = match reason.as_str() {
                            "length_arithmetic_overflow" => "length_arithmetic_overflow",
                            "length_below_prefix" => "length_below_prefix",
                            "line_resource_bound" => "line_resource_bound",
                            _ => "invalid_length",
                        };
                        continue;
                    }
                };
                let subtype = (word >> 20) & 15;
                let next_alignment = (self.offset + length as u64) % 4;
                let metadata = json!({"candidate_frame":frame.json(),"word_at_4":word,"total_line_bytes":length,"prefix_bytes":PREFIX_BYTES,"next_boundary_alignment_mod4":next_alignment,"sample_format":"unknown","subtype":if matches!(frame.mode,5|6){Some(subtype)}else{None},"candidate_class":if matches!(frame.mode,5|6){if subtype<4{"B"}else if subtype==4{"M"}else{"other_preserved"}}else{"unclassified"}});
                if self.buffer.len() < length {
                    if eof {
                        let mut d = BTreeMap::new();
                        d.insert("truncated_line".into(), 1);
                        segments.push(self.take(self.buffer.len(), "truncated_line", metadata, d));
                    }
                    break;
                }
                let mut diagnostics = BTreeMap::new();
                if next_alignment != 0 {
                    diagnostics.insert("unaligned_following_boundary".into(), 1);
                }
                segments.push(self.take(length, "line", metadata, diagnostics));
                continue;
            }
            let mut candidate = None;
            if self.buffer.len() >= 8 {
                for i in self.search_cursor..=self.buffer.len() - 8 {
                    if (self.offset + i as u64).is_multiple_of(4)
                        && self.buffer[i..i + 4] == MARKER
                        && self.buffer[i + 4..i + 8] == MARKER
                    {
                        candidate = Some(i);
                        break;
                    }
                }
                self.search_cursor = self.buffer.len() - 7;
            }
            if let Some(position) = candidate {
                if position > 0 {
                    segments.push(self.opaque(position, self.opaque_reason));
                }
                self.search_cursor = 0;
                continue;
            }
            let emit = if eof {
                self.buffer.len()
            } else if self.buffer.len() >= self.limits.opaque_chunk_bytes + 7 {
                self.limits.opaque_chunk_bytes
            } else {
                0
            };
            if emit == 0 {
                break;
            }
            segments.push(self.opaque(emit, self.opaque_reason));
        }
        Ok(segments)
    }
}
