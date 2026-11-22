//! UL10-5E C4/8 framing and signed-lane candidates from retained static evidence.
//! No acoustic units, RF/IQ assignment, DSP or image reconstruction.
use crate::{MARKER, Result, Segment};
use serde_json::{Value, json};
use std::collections::{BTreeMap, VecDeque};

pub const PREFIX_BYTES: usize = 8;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Parameters {
    pub p: usize,
    pub n: usize,
    pub organization_field4: u8,
}
impl Parameters {
    pub fn from_json(value: &Value) -> Result<Self> {
        let object = value
            .as_object()
            .ok_or("Linear parameters must be an object")?;
        let keys = [
            "schema_version",
            "organization_type",
            "P",
            "N",
            "organization_field4",
        ];
        if object.len() != keys.len()
            || object.keys().any(|k| !keys.contains(&k.as_str()))
            || value["schema_version"] != "linear-c4-8-parameters-v1"
            || value["organization_type"] != 0
        {
            return Err(
                "Require exact linear-c4-8-parameters-v1 fields, organization_type0".into(),
            );
        }
        let get = |key: &str| {
            value[key]
                .as_u64()
                .and_then(|n| usize::try_from(n).ok())
                .ok_or_else(|| format!("{key} must be an unsigned integer"))
        };
        let parameters = Self {
            p: get("P")?,
            n: get("N")?,
            organization_field4: u8::try_from(get("organization_field4")?)
                .map_err(|e| e.to_string())?,
        };
        parameters.validate(Limits::default())?;
        Ok(parameters)
    }
    /// Accepts our explicit parameter report, or its copy in an acquisition
    /// manifest. This does not attest that those settings reached the device.
    pub fn from_configuration(value: &Value) -> Result<Self> {
        let report = match value["schema_version"].as_str() {
            Some("probe-parameters-inspection-v1") => value,
            Some("probe-acquisition-v1") if value["profile"] == "linear-01" => {
                &value["configuration"]
            }
            _ => return Err("Expected a linear parameter report or acquisition manifest".into()),
        };
        if report["schema_version"] != "probe-parameters-inspection-v1"
            || report["profile"] != "linear-01"
            || report["probe_configuration"]["pa"] != 0
        {
            return Err("Configuration must be linear-01, m_nPA0".into());
        }
        let word = report["selected_depth"]["prf_word"]
            .as_str()
            .ok_or("Missing PRF.col0")?;
        if word.len() != 10
            || !word.starts_with("0x")
            || !word[2..].bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Invalid PRF.col0 hex word".into());
        }
        let word = u32::from_str_radix(&word[2..], 16).map_err(|e| e.to_string())?;
        let index = report["selected_depth"]["index"]
            .as_u64()
            .ok_or("Missing depth index")?;
        let count = report["probe_configuration"]["depth_count"]
            .as_u64()
            .ok_or("Missing depth count")?;
        if index >= count {
            return Err("Depth outside Probe count".into());
        }
        Self::from_json(
            &json!({"schema_version":"linear-c4-8-parameters-v1","organization_type":0,
            "P":report["selected_depth"]["line_length_word"],"N":report["probe_configuration"]["focus_count"],
            "organization_field4":(word>>24)&15}),
        )
    }
    pub fn json(self) -> Value {
        json!({"schema_version":"linear-c4-8-parameters-v1","organization_type":0,"P":self.p,"N":self.n,
            "organization_field4":self.organization_field4})
    }
    fn validate(self, limits: Limits) -> Result<(usize, usize)> {
        if self.p < 4
            || !self.p.is_multiple_of(2)
            || !(2..=255).contains(&self.n)
            || self.organization_field4 > 15
        {
            return Err("Strict C4/8 profile requires even P>=4, N2..255, field4<=15".into());
        }
        let line = self.p.checked_mul(2).ok_or("Line size overflow")?;
        let frame = line.checked_mul(self.n).ok_or("Frame size overflow")?;
        if frame > limits.max_frame_bytes {
            return Err("Frame exceeds max_frame_bytes".into());
        }
        Ok((line, frame))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Alignment {
    Phase(u8),
    RecoverAll,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Availability {
    Minimal,
    NativeWrapper,
}
#[derive(Clone, Copy, Debug)]
pub struct Policy {
    pub alignment: Alignment,
    pub availability: Availability,
}
impl Policy {
    pub fn json(self) -> Value {
        json!({"alignment":match self.alignment {Alignment::Phase(n)=>json!(n),Alignment::RecoverAll=>json!("recover_all_phases")},
            "availability":match self.availability {Availability::Minimal=>"F+8",Availability::NativeWrapper=>"3F/2"},
            "alignment_origin":"observed file byte offset zero; not an attestation of original wire phase"})
    }
}
#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub max_input_bytes: u64,
    pub max_push_bytes: usize,
    pub max_frame_bytes: usize,
    pub max_buffer_bytes: usize,
    pub opaque_chunk_bytes: usize,
    pub max_segment_files: u64,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            max_input_bytes: 256 * 1024 * 1024,
            max_push_bytes: 64 * 1024,
            max_frame_bytes: 8 * 1024 * 1024,
            max_buffer_bytes: 12 * 1024 * 1024 + 64 * 1024,
            opaque_chunk_bytes: 64 * 1024,
            max_segment_files: 100_000,
        }
    }
}
impl Limits {
    pub fn json(self) -> Value {
        json!({"max_input_bytes":self.max_input_bytes,"max_push_bytes":self.max_push_bytes,"max_frame_bytes":self.max_frame_bytes,
            "max_buffer_bytes":self.max_buffer_bytes,"opaque_chunk_bytes":self.opaque_chunk_bytes,"max_segment_files":self.max_segment_files})
    }
    fn validate(self, required: usize) -> Result<()> {
        if self.max_input_bytes == 0
            || self.max_push_bytes == 0
            || self.max_segment_files == 0
            || self.opaque_chunk_bytes < PREFIX_BYTES
            || self.max_frame_bytes < 16
            || required
                .checked_add(self.max_push_bytes)
                .is_none_or(|n| n > self.max_buffer_bytes)
            || self
                .opaque_chunk_bytes
                .checked_add(PREFIX_BYTES - 1)
                .and_then(|n| n.checked_add(self.max_push_bytes))
                .is_none_or(|n| n > self.max_buffer_bytes)
        {
            return Err("Inconsistent/zero linear resource limits".into());
        }
        Ok(())
    }
}
#[derive(Clone, Copy)]
struct Candidate {
    checked: usize,
}

/// Returned segments partition all observed bytes exactly (gap events have zero
/// length). Chunk boundaries are immaterial. A declared discontinuity flushes
/// the candidate and requires explicit re-anchoring before any further input.
pub struct Inspector {
    parameters: Parameters,
    policy: Policy,
    limits: Limits,
    line_bytes: usize,
    frame_bytes: usize,
    required: usize,
    buffer: VecDeque<u8>,
    received: u64,
    offset: u64,
    frame_count: u64,
    search_cursor: usize,
    candidate: Option<Candidate>,
    awaiting_alignment: bool,
    finished: bool,
}
impl Inspector {
    pub fn new(parameters: Parameters, policy: Policy, limits: Limits) -> Result<Self> {
        if matches!(policy.alignment,Alignment::Phase(n) if n>3) {
            return Err("Alignment phase must be0..3".into());
        }
        let (line_bytes, frame_bytes) = parameters.validate(limits)?;
        let required = match policy.availability {
            Availability::Minimal => frame_bytes.checked_add(PREFIX_BYTES),
            Availability::NativeWrapper => frame_bytes.checked_add(frame_bytes / 2),
        }
        .ok_or("Lookahead size overflow")?;
        limits.validate(required)?;
        Ok(Self {
            parameters,
            policy,
            limits,
            line_bytes,
            frame_bytes,
            required,
            buffer: VecDeque::new(),
            received: 0,
            offset: 0,
            frame_count: 0,
            search_cursor: 0,
            candidate: None,
            awaiting_alignment: false,
            finished: false,
        })
    }
    pub fn accepted_bytes(&self) -> u64 {
        self.received
    }
    pub fn buffered_bytes(&self) -> usize {
        self.buffer.len()
    }
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Segment>> {
        if self.finished || self.awaiting_alignment {
            return Err("Inspector finished or requires explicit alignment after gap".into());
        }
        let total = self
            .received
            .checked_add(bytes.len() as u64)
            .ok_or("Input count overflow")?;
        if bytes.len() > self.limits.max_push_bytes
            || total > self.limits.max_input_bytes
            || self
                .buffer
                .len()
                .checked_add(bytes.len())
                .is_none_or(|n| n > self.limits.max_buffer_bytes)
        {
            return Err("Resource bound exceeded; chunk not consumed".into());
        }
        self.received = total;
        self.buffer.extend(bytes.iter().copied());
        Ok(self.process())
    }
    pub fn discontinuity(
        &mut self,
        reason: &str,
        missing_bytes: Option<u64>,
    ) -> Result<Vec<Segment>> {
        if self.finished || self.awaiting_alignment {
            return Err("No active stream epoch".into());
        }
        if reason.is_empty() || reason.len() > 1024 {
            return Err("Gap reason must contain1..1024bytes".into());
        }
        let mut result = Vec::new();
        if !self.buffer.is_empty() {
            result.push(self.take(
                self.buffer.len(),
                "discontinuous_candidate",
                json!({"candidate_present":self.candidate.is_some(),
                "reason":reason,"structural_frame_confirmed":false}),
                Some("declared_discontinuity"),
            ));
        }
        self.candidate = None;
        self.search_cursor = 0;
        self.awaiting_alignment = true;
        result.push(self.take(0,"gap",json!({"reason":reason,"missing_bytes":missing_bytes,
            "offset_domain":"observed bytes only; missing bytes are not synthesized","requires_explicit_alignment":true}),Some("declared_gap")));
        Ok(result)
    }
    /// Phase is relative to the complete observed-byte stream, not epoch start.
    pub fn resume(&mut self, alignment: Alignment) -> Result<()> {
        if !self.awaiting_alignment
            || self.finished
            || matches!(alignment,Alignment::Phase(n) if n>3)
        {
            return Err("Resume requires a pending gap and explicit valid alignment".into());
        }
        self.policy.alignment = alignment;
        self.awaiting_alignment = false;
        Ok(())
    }
    pub fn finish(&mut self) -> Result<Vec<Segment>> {
        if self.finished {
            return Err("Inspector already finished".into());
        }
        self.finished = true;
        let mut result = self.process();
        if !self.buffer.is_empty() {
            let (kind, reason) = if let Some(c) = self.candidate {
                if c.checked == self.parameters.n + 1 {
                    ("pending_frame", "native_wrapper_availability_threshold")
                } else if self.buffer.len() >= self.frame_bytes {
                    ("pending_frame", "candidate_pending_next_line1")
                } else {
                    ("truncated_frame", "candidate_truncated_before_frame_end")
                }
            } else {
                ("opaque", "no_complete_line1_anchor")
            };
            result.push(self.take(self.buffer.len(),kind,json!({"reason":reason,"expected_frame_bytes":self.frame_bytes,
                "required_available_bytes":self.required,"checked_headers":self.candidate.map(|c|c.checked),
                "structural_frame_confirmed":false,"availability_policy":self.policy.json()}),Some(reason)));
        }
        Ok(result)
    }
    fn take(
        &mut self,
        length: usize,
        kind: &'static str,
        metadata: Value,
        diagnostic: Option<&str>,
    ) -> Segment {
        let offset = self.offset;
        self.offset += length as u64;
        self.search_cursor = self.search_cursor.saturating_sub(length);
        let mut diagnostics = BTreeMap::new();
        if let Some(reason) = diagnostic {
            diagnostics.insert(reason.to_owned(), 1);
        }
        Segment {
            offset,
            kind,
            bytes: self.buffer.drain(..length).collect(),
            metadata,
            diagnostics,
        }
    }
    fn header(&self, position: usize) -> Option<(bool, u8, u32)> {
        if position.checked_add(PREFIX_BYTES)? > self.buffer.len() {
            return None;
        }
        let h: [u8; PREFIX_BYTES] = std::array::from_fn(|i| self.buffer[position + i]);
        Some((
            h[..4] == MARKER,
            h[5],
            u32::from_le_bytes(h[4..8].try_into().unwrap()),
        ))
    }
    fn aligned(&self, position: usize) -> bool {
        match self.policy.alignment {
            Alignment::Phase(n) => (self.offset + position as u64) % 4 == u64::from(n),
            Alignment::RecoverAll => true,
        }
    }
    fn process(&mut self) -> Vec<Segment> {
        let mut result = Vec::new();
        loop {
            if self.candidate.is_none() {
                let mut anchor = None;
                if self.buffer.len() >= PREFIX_BYTES {
                    for i in self.search_cursor..=self.buffer.len() - PREFIX_BYTES {
                        if self.aligned(i)
                            && self
                                .header(i)
                                .is_some_and(|(marker, counter, _)| marker && counter == 1)
                        {
                            anchor = Some(i);
                            break;
                        }
                    }
                    self.search_cursor = self.buffer.len() - (PREFIX_BYTES - 1);
                }
                if let Some(i) = anchor {
                    if i > 0 {
                        result.push(self.take(i,"opaque",json!({"reason":"searching_line1","realignment_policy":self.policy.json()}),Some("searching_line1")));
                    }
                    self.search_cursor = 0;
                    self.candidate = Some(Candidate { checked: 1 });
                } else {
                    if self.buffer.len() >= self.limits.opaque_chunk_bytes + PREFIX_BYTES - 1 {
                        result.push(self.take(
                            self.limits.opaque_chunk_bytes,
                            "opaque",
                            json!({"reason":"searching_line1"}),
                            Some("searching_line1"),
                        ));
                        continue;
                    }
                    break;
                }
            }
            let mut candidate = self.candidate.unwrap();
            let mut bad = None;
            while candidate.checked <= self.parameters.n {
                let position = candidate.checked * self.line_bytes;
                let Some((marker, counter, _)) = self.header(position) else {
                    break;
                };
                let expected = if candidate.checked == self.parameters.n {
                    1
                } else {
                    (candidate.checked + 1) as u8
                };
                if !marker || counter != expected {
                    bad = Some((
                        position,
                        expected,
                        counter,
                        if marker { "bad_counter" } else { "bad_marker" },
                    ));
                    break;
                }
                candidate.checked += 1;
            }
            self.candidate = Some(candidate);
            if let Some((position, expected, actual, reason)) = bad {
                let step = match self.policy.alignment {
                    Alignment::Phase(_) => 4,
                    Alignment::RecoverAll => 1,
                };
                result.push(self.take(step,"rejected_candidate",json!({"reason":reason,"failed_header_relative_offset":position,
                    "expected_counter":expected,"observed_counter":actual,"structural_frame_confirmed":false}),Some(reason)));
                self.candidate = None;
                self.search_cursor = 0;
                continue;
            }
            if candidate.checked != self.parameters.n + 1 || self.buffer.len() < self.required {
                break;
            }
            self.frame_count += 1;
            let headers:Vec<_>=(0..self.parameters.n).map(|line| {
                let position=line*self.line_bytes;
                let (_,counter,metadata)=self.header(position).unwrap();
                json!({"line_index_zero_based":line,"counter":counter,"relative_offset":position,
                    "metadata_le_u32":metadata,"byte4":self.buffer[position+4],"byte7_high_nibble":self.buffer[position+7]>>4})
            }).collect();
            let lookahead: Vec<_> = self
                .buffer
                .range(self.frame_bytes..self.frame_bytes + PREFIX_BYTES)
                .copied()
                .collect();
            let token = self.header(0).unwrap().2 & 0x0fff_ffff;
            result.push(self.take(self.frame_bytes,"linear_frame",json!({"parser_frame_ordinal":self.frame_count,
                "parameters":self.parameters.json(),"line_bytes":self.line_bytes,"prefix_bytes":PREFIX_BYTES,
                "headers":headers,"first_metadata_token28":token,"wire_frame_id":null,
                "lookahead_header":lookahead,"lookahead_retained":true,"structural_frame_confirmed":true,
                "policy":self.policy.json(),"sample_representation":"signed_lane_candidates","physical_calibration":null,"image_decoded":false}),None));
            self.candidate = None;
            self.search_cursor = 0;
        }
        result
    }
}
