// SPDX-License-Identifier: AGPL-3.0-or-later
//! Shared native/WASM in-memory decoder. Hosts own transport, storage and display.
#![allow(dead_code)]
mod framing;
mod selected_profile;
pub use selected_profile::ImageProfile;
pub mod resources;
pub use framing::{
    HEADER_BYTES, Inspector, Limits, MARKER, PREFIX_BYTES, Parameters, Result, Segment, line_length,
};
mod admission;
mod archive;
mod convex_bfsp;
mod convex_command;
mod convex_compound;
mod convex_configuration;
mod convex_dsc;
mod convex_dtgc;
mod convex_group;
mod convex_lifecycle;
mod convex_messages;
mod convex_parameters;
mod convex_pipeline;
mod convex_producers;
mod convex_sri;
mod convex_sri_plan;
mod linear_dsp;
mod linear_palette;
mod linear_post;
mod rgba_png;
mod identity {
    pub fn build_provenance() -> serde_json::Value {
        crate::archive::source_provenance()
    }
}
use serde_json::{Value, json};
use std::{cell::RefCell, path::Path};
/// Display policy only; never changes USB configuration or transmit settings.
#[derive(Clone, Copy, Debug, Default)]
pub enum Palette {
    #[default]
    Reference,
    LinearGray,
}
/// Original identity gray transfer: RGB=intensity; fourth channel is the index.
/// This is a DSC lookup table, not an RGBA image (fourth channel is NOT opacity).
pub fn linear_gray_map() -> Vec<u8> {
    (0..=255u8).flat_map(|level| [level; 4]).collect()
}
pub struct Frame {
    pub sequence: u32,
    pub png: Vec<u8>,
}
pub struct RgbaFrame {
    pub sequence: u32,
    pub rgba: Vec<u8>,
}
struct ProcessedFrame {
    sequence: u32,
    png: Option<Vec<u8>>,
    rgba: Vec<u8>,
}
/// One host-independent session. The caller owns USB, timing, storage and display.
pub struct Session {
    decoder: Decoder,
}
pub fn encode_rgba_png(width: usize, height: usize, rgba: &[u8]) -> Result<Vec<u8>> {
    rgba_png::encode(width, height, rgba)
}
pub fn decode_message(message: &[u8]) -> Result<Value> {
    convex_messages::decode(message)
}
impl Session {
    /// Prepare only the selected image parameters, without file resources.
    pub fn from_profile(configuration: &Value, profile: ImageProfile) -> Result<Self> {
        let settings = convex_pipeline::Settings::parse(&configuration["settings"])?;
        let parameters = Parameters::from_json(&configuration["parameters"])?;
        let grouping = convex_group::Settings::parse(&configuration["grouping"])?;
        let resources = convex_pipeline::Resources::from_selected(settings, profile)?;
        let state = convex_pipeline::State::cpu_zeroed(resources.plan())?;
        Ok(Self {
            decoder: Decoder {
                parser: Inspector::new(Some(parameters), Limits::default())?,
                organizer: convex_group::Organizer::new(parameters, grouping)?,
                engine: convex_pipeline::Engine::new(resources, state)?,
                prepared: None,
                boundary: false,
                sequence: 0,
                attempts: 0,
                maximum: settings.max_groups,
            },
        })
    }
    /// Snapshot only values consumed by the selected no-enhancement image path.
    pub fn selected_image_profile(&self) -> Result<ImageProfile> {
        self.decoder.engine.resources().selected()
    }

    pub fn new(configuration: &Value, files: &resources::ResourceStore) -> Result<Self> {
        Self::with_mode(configuration, files, true)
    }
    /// Decode archived DATA without loading transmission, ADC, apodization or HV resources.
    /// No configuration packets can be obtained from this session.
    pub fn reconstruction(configuration: &Value, files: &resources::ResourceStore) -> Result<Self> {
        Self::with_mode(configuration, files, false)
    }
    fn with_mode(
        configuration: &Value,
        files: &resources::ResourceStore,
        acquisition: bool,
    ) -> Result<Self> {
        let settings = convex_pipeline::Settings::parse(&configuration["settings"])?;
        let parameters = Parameters::from_json(&configuration["parameters"])?;
        let grouping = convex_group::Settings::parse(&configuration["grouping"])?;
        if acquisition && configuration["selection"]["depth_index"] != settings.bfsp.depth {
            return Err("Acquisition and image depths differ".into());
        }
        resources::validate(files)?;
        let palette = match configuration.get("display_palette") {
            None => Palette::Reference,
            Some(Value::String(s)) if s == "reference" => Palette::Reference,
            Some(Value::String(s)) if s == "linear-gray-v1" => Palette::LinearGray,
            _ => return Err("Unknown display palette".into()),
        };
        let source = |group| resources::Memory { files, group };
        let prepared = if acquisition {
            Some(convex_configuration::Prepared::from_source(
                &source("assets"),
                &source("hv"),
                configuration["selection"].clone(),
            )?)
        } else {
            None
        };
        let resources = convex_pipeline::Resources::from_source(
            &source("assets"),
            &source("sri"),
            &source("maps"),
            settings,
            None,
            palette,
        )?;
        let state = convex_pipeline::State::cpu_zeroed(resources.plan())?;
        Ok(Self {
            decoder: Decoder {
                parser: Inspector::new(Some(parameters), Limits::default())?,
                organizer: convex_group::Organizer::new(parameters, grouping)?,
                engine: convex_pipeline::Engine::new(resources, state)?,
                prepared,
                boundary: false,
                sequence: 0,
                attempts: 0,
                maximum: settings.max_groups,
            },
        })
    }
    /// Continuous lifetime with the same per-push/buffer bounds and temporal history.
    /// Does not issue USB commands, reset history, or change any image/TX parameter.
    pub fn allow_continuous(&mut self) {
        self.decoder.parser.allow_continuous();
        self.decoder.maximum = usize::MAX;
    }
    pub fn advance(&mut self, bytes: &[u8]) -> Result<()> {
        process_output(&mut self.decoder, bytes, false, false, false)?;
        Ok(())
    }
    pub fn push_rgba(&mut self, bytes: &[u8]) -> Result<Vec<RgbaFrame>> {
        self.rgba(bytes, false)
    }
    pub fn finish_rgba(&mut self) -> Result<Vec<RgbaFrame>> {
        self.rgba(&[], true)
    }
    fn rgba(&mut self, bytes: &[u8], finish: bool) -> Result<Vec<RgbaFrame>> {
        Ok(
            process_output(&mut self.decoder, bytes, finish, false, true)?
                .into_iter()
                .map(|f| RgbaFrame {
                    sequence: f.sequence,
                    rgba: f.rgba,
                })
                .collect(),
        )
    }
    pub fn ready(&self) -> Value {
        let settings = self.decoder.engine.resources().settings();
        json!({"ready":true,"width":settings.dsc.width,"height":settings.dsc.height,"calibrated":false})
    }
    pub fn bind(&mut self, message: &[u8]) -> Result<Value> {
        bind_decoder(&mut self.decoder, message)
    }
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Frame>> {
        process(&mut self.decoder, bytes, false)
    }
    pub fn finish(&mut self) -> Result<Vec<Frame>> {
        process(&mut self.decoder, &[], true)
    }
}
struct Decoder {
    parser: Inspector,
    organizer: convex_group::Organizer,
    engine: convex_pipeline::Engine,
    prepared: Option<convex_configuration::Prepared>,
    boundary: bool,
    sequence: u32,
    attempts: usize,
    maximum: usize,
}
thread_local! {static DECODER:RefCell<Option<Decoder>>=const{RefCell::new(None)};static OUTPUT:RefCell<Vec<u8>>=const{RefCell::new(Vec::new())};}
fn init(v: Value) -> Result<Value> {
    let settings = convex_pipeline::Settings::parse(&v["settings"])?;
    let parameters = Parameters::from_json(&v["parameters"])?;
    let grouping = convex_group::Settings::parse(&v["grouping"])?;
    if v["selection"]["depth_index"] != settings.bfsp.depth {
        return Err("Acquisition and image depths differ".into());
    }
    let assets = Path::new("/assets");
    let prepared =
        convex_configuration::Prepared::load(assets, Path::new("/hv"), v["selection"].clone())?;
    let resources = convex_pipeline::Resources::load(
        assets,
        Path::new("/sri"),
        Path::new("/maps"),
        settings,
        None,
    )?;
    let state = convex_pipeline::State::cpu_zeroed(resources.plan())?;
    let engine = convex_pipeline::Engine::new(resources, state)?;
    let parser = Inspector::new(Some(parameters), Limits::default())?;
    let organizer = convex_group::Organizer::new(parameters, grouping)?;
    DECODER.with(|d| {
        *d.borrow_mut() = Some(Decoder {
            parser,
            organizer,
            engine,
            prepared: Some(prepared),
            boundary: false,
            sequence: 0,
            attempts: 0,
            maximum: settings.max_groups,
        })
    });
    Ok(
        json!({"ready":true,"width":settings.dsc.width,"height":settings.dsc.height,"calibrated":false}),
    )
}
fn bind_decoder(decoder: &mut Decoder, message: &[u8]) -> Result<Value> {
    let decoded = convex_messages::decode(message)?;
    if decoded["message_pid"] != 0 {
        return Err("Configuration requires complete current PID0".into());
    }
    let logic = decoded["logic_compile_version"]
        .as_u64()
        .ok_or("Missing logic")? as u32;
    let low = decoded["low_power_mode"]
        .as_u64()
        .ok_or("Missing power state")? as u8;
    let prepared = decoder
        .prepared
        .take()
        .ok_or("Configuration can only be bound once per session")?;
    let packets = prepared.bind(logic, low)?.into_packets();
    Ok(
        json!({"packets":packets.into_iter().map(|(name,bytes)|json!({"name":name,"bytes":bytes})).collect::<Vec<_>>(),"message":decoded}),
    )
}
fn bind(message: &[u8]) -> Result<Value> {
    DECODER.with(|d| {
        bind_decoder(
            d.borrow_mut().as_mut().ok_or("Initialize decoder first")?,
            message,
        )
    })
}
fn init_memory(v: Value) -> Result<Value> {
    // Validate settings before resources, consistently with the reference entry point.
    convex_pipeline::Settings::parse(&v["settings"])?;
    let files: resources::ResourceStore =
        serde_json::from_value(v["files"].clone()).map_err(|e| e.to_string())?;
    let session = match v.get("purpose").and_then(Value::as_str) {
        None | Some("acquisition") => Session::new(&v, &files)?,
        Some("reconstruction") => Session::reconstruction(&v, &files)?,
        _ => return Err("Unknown session purpose".into()),
    };
    let ready = session.ready();
    DECODER.with(|d| *d.borrow_mut() = Some(session.decoder));
    Ok(ready)
}
fn process(decoder: &mut Decoder, bytes: &[u8], finish: bool) -> Result<Vec<Frame>> {
    Ok(process_output(decoder, bytes, finish, true, true)?
        .into_iter()
        .map(|f| Frame {
            sequence: f.sequence,
            png: f.png.unwrap(),
        })
        .collect())
}
fn process_output(
    decoder: &mut Decoder,
    bytes: &[u8],
    finish: bool,
    png: bool,
    render: bool,
) -> Result<Vec<ProcessedFrame>> {
    let segments = if finish {
        decoder.parser.finish()?
    } else {
        decoder.parser.push(bytes)?
    };
    let mut frames = Vec::new();
    for segment in segments {
        let step = decoder.organizer.push(&segment)?;
        if step
            .events
            .iter()
            .any(|e| e["event"] == "new_organizer_boundary")
        {
            decoder.boundary = true;
        }
        if let Some(group) = step.group {
            if decoder.attempts >= decoder.maximum {
                return Err("Decoded frame budget exhausted".into());
            }
            let lines = group.bytes();
            let phase = match admission::audit_candidate(
                &lines,
                &group.algorithm_header,
                decoder.engine.resources().plan(),
            ) {
                Ok(p) => p,
                Err(_) => {
                    decoder.boundary = true;
                    continue;
                }
            };
            if decoder.boundary {
                decoder.engine.state.software_freeze();
                decoder.boundary = false;
            }
            decoder.attempts = decoder
                .attempts
                .checked_add(1)
                .ok_or("Attempt count overflow")?;
            let output = if !render {
                decoder.engine.update_only(&lines, phase)?
            } else if png {
                decoder.engine.process(&lines, phase)?
            } else {
                decoder.engine.process_rgba(&lines, phase)?
            };
            if output.attempt.native_status_candidate == Some(0) {
                decoder.sequence = decoder
                    .sequence
                    .checked_add(1)
                    .ok_or("Image sequence overflow")?;
                if let Some(rgba) = output.rgba {
                    frames.push(ProcessedFrame {
                        sequence: decoder.sequence,
                        png: output.png,
                        rgba,
                    });
                }
            }
        }
    }
    Ok(frames)
}
fn push(bytes: &[u8], finish: bool) -> Result<Vec<u8>> {
    DECODER.with(|d| {
        let mut borrow = d.borrow_mut();
        let decoder = borrow.as_mut().ok_or("Initialize decoder first")?;
        let frames = process(decoder, bytes, finish)?;
        let mut result = (frames.len() as u32).to_le_bytes().to_vec();
        for frame in frames {
            result.extend_from_slice(&frame.sequence.to_le_bytes());
            result.extend_from_slice(&(frame.png.len() as u32).to_le_bytes());
            result.extend_from_slice(&frame.png);
        }
        Ok(result)
    })
}
/// Caller allocates input, invokes one bounded operation and copies output before next call.
/// 1=reference WASI init, 2=raw, 3=message, 4=bind, 5=finish, 6=in-memory JSON init.
#[cfg_attr(feature = "ffi", unsafe(no_mangle))]
pub extern "C" fn odb_alloc(length: usize) -> *mut u8 {
    if length > 4 * 1024 * 1024 {
        return std::ptr::null_mut();
    }
    let v = vec![0u8; length].into_boxed_slice();
    Box::into_raw(v) as *mut u8
}
/// # Safety
/// Pointer and length must identify one live allocation returned by odb_alloc.
#[cfg_attr(feature = "ffi", unsafe(no_mangle))]
pub unsafe extern "C" fn odb_free(pointer: *mut u8, length: usize) {
    if !pointer.is_null() {
        unsafe {
            drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
                pointer, length,
            )));
        }
    }
}
/// # Safety
/// Pointer must reference length initialized input bytes for this call.
#[cfg_attr(feature = "ffi", unsafe(no_mangle))]
pub unsafe extern "C" fn odb_call(operation: u32, pointer: *const u8, length: usize) -> i32 {
    if length > 4 * 1024 * 1024 || pointer.is_null() {
        return -1;
    }
    let input = unsafe { std::slice::from_raw_parts(pointer, length) };
    let result = match operation {
        1 => serde_json::from_slice(input)
            .map_err(|e| e.to_string())
            .and_then(init)
            .map(|v| serde_json::to_vec(&v).unwrap()),
        6 => serde_json::from_slice(input)
            .map_err(|e| e.to_string())
            .and_then(init_memory)
            .map(|v| serde_json::to_vec(&v).unwrap()),
        2 => push(input, false),
        3 => convex_messages::decode(input).map(|v| serde_json::to_vec(&v).unwrap()),
        4 => bind(input).map(|v| serde_json::to_vec(&v).unwrap()),
        5 => push(&[], true),
        _ => Err("Unknown decoder operation".into()),
    };
    let (status, bytes) = match result {
        Ok(v) => (0, v),
        Err(e) => (-1, e.into_bytes()),
    };
    OUTPUT.with(|o| *o.borrow_mut() = bytes);
    status
}
#[cfg_attr(feature = "ffi", unsafe(no_mangle))]
pub extern "C" fn odb_output_ptr() -> *const u8 {
    OUTPUT.with(|o| o.borrow().as_ptr())
}
#[cfg_attr(feature = "ffi", unsafe(no_mangle))]
pub extern "C" fn odb_output_len() -> usize {
    OUTPUT.with(|o| o.borrow().len())
}

#[cfg(test)]
mod memory_tests {
    use super::*;
    #[test]
    fn untrusted_memory_keys_and_budgets_are_rejected() {
        for name in [
            "assets/../secret",
            "assets/.hidden",
            "other/x",
            "assets/x/y",
            "https://remote/x",
        ] {
            let files = [(name.into(), vec![])].into_iter().collect();
            assert!(resources::validate(&files).is_err());
        }
        let files = [("assets/x".into(), vec![0; 4 * 1024 * 1024 + 1])]
            .into_iter()
            .collect();
        assert!(resources::validate(&files).is_err());
        let files = resources::ResourceStore::new();
        let source = resources::Memory {
            files: &files,
            group: "assets",
        };
        use resources::Source;
        assert!(source.read("A_Probe.bin", 68).is_err());
        assert!(!source.exists("B_Smooth.bin").unwrap());
    }
    #[test]
    fn original_palette_is_monotonic_and_keeps_dsc_index() {
        let map = linear_gray_map();
        assert_eq!(map.len(), 1024);
        assert_eq!(&map[..4], &[0, 0, 0, 0]);
        assert_eq!(&map[1020..], &[255, 255, 255, 255]);
        for (i, pixel) in map.as_chunks::<4>().0.iter().enumerate() {
            assert_eq!(*pixel, [i as u8; 4]);
        }
    }
}
