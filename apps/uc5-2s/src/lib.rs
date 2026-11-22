//! Fixed bench profile runtime. The host owns all physical USB operations.
mod profile;
mod selected_values;
use odb_convex_decoder::{Frame, Result, RgbaFrame, Session, decode_message};
use serde_json::{Value, json};
use std::cell::RefCell;

pub struct EmbeddedSession {
    engine: Session,
    acquisition: bool,
    bound: bool,
    depth: u8,
}
impl EmbeddedSession {
    fn at_depth(depth: u8, acquisition: bool) -> Result<Self> {
        let mut configuration = selected_values::configuration()?;
        for target in [
            "/selection/depth_index",
            "/settings/bfsp/depth_index",
            "/settings/dsc/depth_index",
        ] {
            *configuration
                .pointer_mut(target)
                .ok_or("Missing depth setting")? = json!(depth);
        }
        let mut engine = Session::from_profile(&configuration, profile::image(depth)?)?;
        if depth != 0 {
            engine.use_received_line_length();
        }
        Ok(Self {
            engine,
            acquisition,
            bound: false,
            depth,
        })
    }
    pub fn advance(&mut self, bytes: &[u8]) -> Result<()> {
        self.engine.advance(bytes)
    }
    pub fn push_rgba(&mut self, bytes: &[u8]) -> Result<Vec<RgbaFrame>> {
        self.engine.push_rgba(bytes)
    }
    pub fn finish_rgba(&mut self) -> Result<Vec<RgbaFrame>> {
        self.engine.finish_rgba()
    }
    pub fn ready(&self) -> Value {
        json!({"ready":true,"width":512,"height":512,"calibrated":false,"profile":if self.depth == 0 {"uc5-2s-fixed-bench-v1"} else {"uc5-2s-general-depth-v1"},"external_resource_files":0,"depth_index":self.depth,"frequency_index":0,"focus_index":0,"enhancement":0})
    }
    pub fn bind(&mut self, raw: &[u8]) -> Result<Value> {
        if !self.acquisition || self.bound {
            return Err("This session cannot produce configuration packets".into());
        }
        let decoded = decode_message(raw)?;
        let expected = selected_values::binding_signature()?;
        for (key, value) in expected.as_object().ok_or("Invalid compiled signature")? {
            if decoded[key] != *value {
                return Err(format!(
                    "Current device state is outside the compiled profile: {key}"
                ));
            }
        }
        self.bound = true;
        let packets = profile::PACKETS[usize::from(self.depth)]
            .iter()
            .map(|(name, bytes)| json!({"name": name,"bytes": bytes}))
            .collect::<Vec<_>>();
        Ok(json!({"packets": packets,"message": decoded}))
    }
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Frame>> {
        self.engine.push(bytes)
    }
    pub fn finish(&mut self) -> Result<Vec<Frame>> {
        self.engine.finish()
    }
}
thread_local! {static SESSION:RefCell<Option<EmbeddedSession>>=const{RefCell::new(None)};static OUTPUT:RefCell<Vec<u8>>=const{RefCell::new(Vec::new())};}
fn init(bytes: &[u8]) -> Result<Vec<u8>> {
    init_mode(bytes, false)
}
fn init_mode(bytes: &[u8], continuous: bool) -> Result<Vec<u8>> {
    let options: Value = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    let object = options
        .as_object()
        .ok_or("Require built-in session options")?;
    if object.keys().any(|k| k != "purpose" && k != "depth_index") {
        return Err("Unknown built-in session option".into());
    }
    let acquisition = match object.get("purpose") {
        None => true,
        Some(Value::String(s)) if s == "acquisition" => true,
        Some(Value::String(s)) if s == "reconstruction" => false,
        _ => return Err("Unknown session purpose".into()),
    };
    let depth = match object.get("depth_index") {
        None => 0,
        Some(value) => value
            .as_u64()
            .filter(|d| *d < 8)
            .ok_or("Expected depth index 0 through 7")? as u8,
    };
    let mut session = EmbeddedSession::at_depth(depth, acquisition)?;
    if continuous {
        session.engine.allow_continuous();
    }
    let ready = serde_json::to_vec(&session.ready()).unwrap();
    SESSION.with(|s| *s.borrow_mut() = Some(session));
    Ok(ready)
}
fn packed(frames: Vec<Frame>) -> Result<Vec<u8>> {
    let mut out = (frames.len() as u32).to_le_bytes().to_vec();
    for frame in frames {
        out.extend_from_slice(&frame.sequence.to_le_bytes());
        out.extend_from_slice(&(frame.png.len() as u32).to_le_bytes());
        out.extend_from_slice(&frame.png);
    }
    Ok(out)
}
fn packed_rgba(frames: Vec<RgbaFrame>) -> Result<Vec<u8>> {
    let mut out = (frames.len() as u32).to_le_bytes().to_vec();
    for frame in frames {
        out.extend_from_slice(&frame.sequence.to_le_bytes());
        out.extend_from_slice(&(frame.rgba.len() as u32).to_le_bytes());
        out.extend_from_slice(&frame.rgba);
    }
    Ok(out)
}
#[unsafe(no_mangle)]
pub extern "C" fn odb_live_api() -> u32 {
    1
}
#[unsafe(no_mangle)]
pub extern "C" fn odb_builtin_profile() -> u32 {
    1
}
#[unsafe(no_mangle)]
pub extern "C" fn odb_alloc(length: usize) -> *mut u8 {
    if length > 4 * 1024 * 1024 {
        return std::ptr::null_mut();
    }
    Box::into_raw(vec![0u8; length].into_boxed_slice()) as *mut u8
}
/// # Safety
/// Pointer and length must identify a live allocation returned by odb_alloc.
#[unsafe(no_mangle)]
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
/// Pointer must reference length initialized bytes for this call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn odb_call(operation: u32, pointer: *const u8, length: usize) -> i32 {
    if length > 4 * 1024 * 1024 || pointer.is_null() {
        return -1;
    }
    let bytes = unsafe { std::slice::from_raw_parts(pointer, length) };
    let result = match operation {
        7 => init(bytes),
        11 => odb_convex_decoder::encode_rgba_png(512, 512, bytes),
        12 => SESSION
            .with(|s| {
                s.borrow_mut()
                    .as_mut()
                    .ok_or("Initialize decoder first")?
                    .advance(bytes)
            })
            .map(|_| 0u32.to_le_bytes().to_vec()),
        8 => init_mode(bytes, true),
        9 => SESSION
            .with(|s| {
                s.borrow_mut()
                    .as_mut()
                    .ok_or("Initialize decoder first")?
                    .push_rgba(bytes)
            })
            .and_then(packed_rgba),
        10 => SESSION
            .with(|s| {
                s.borrow_mut()
                    .as_mut()
                    .ok_or("Initialize decoder first")?
                    .finish_rgba()
            })
            .and_then(packed_rgba),
        3 => decode_message(bytes).map(|v| serde_json::to_vec(&v).unwrap()),
        4 => SESSION
            .with(|s| {
                s.borrow_mut()
                    .as_mut()
                    .ok_or("Initialize decoder first")?
                    .bind(bytes)
            })
            .map(|v| serde_json::to_vec(&v).unwrap()),
        2 => SESSION
            .with(|s| {
                s.borrow_mut()
                    .as_mut()
                    .ok_or("Initialize decoder first")?
                    .push(bytes)
            })
            .and_then(packed),
        5 => SESSION
            .with(|s| {
                s.borrow_mut()
                    .as_mut()
                    .ok_or("Initialize decoder first")?
                    .finish()
            })
            .and_then(packed),
        _ => Err("Unsupported operation for compiled profile".into()),
    };
    let (status, out) = match result {
        Ok(v) => (0, v),
        Err(e) => (-1, e.into_bytes()),
    };
    OUTPUT.with(|o| *o.borrow_mut() = out);
    status
}
#[unsafe(no_mangle)]
pub extern "C" fn odb_output_ptr() -> *const u8 {
    OUTPUT.with(|o| o.borrow().as_ptr())
}
#[unsafe(no_mangle)]
pub extern "C" fn odb_output_len() -> usize {
    OUTPUT.with(|o| o.borrow().len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_depths_have_an_image_profile_and_the_same_hv_packet() {
        let bank = |depth: usize| {
            profile::PACKETS[depth]
                .iter()
                .find(|(name, _)| *name == "HV-SW")
                .unwrap()
                .1
        };
        for depth in 0..8 {
            let session = EmbeddedSession::at_depth(depth, true).unwrap();
            assert_eq!(session.ready()["depth_index"], depth);
            assert_eq!(profile::PACKETS[usize::from(depth)].len(), 13);
            assert_eq!(bank(usize::from(depth)), bank(0));
        }
        assert!(EmbeddedSession::at_depth(8, true).is_err());
    }

    #[test]
    fn reconstruction_and_incomplete_status_cannot_bind_acquisition() {
        assert!(
            EmbeddedSession::at_depth(2, false)
                .unwrap()
                .bind(&[])
                .is_err()
        );
        assert!(
            EmbeddedSession::at_depth(5, true)
                .unwrap()
                .bind(&[0; 511])
                .is_err()
        );
    }
}
