use crate::Result;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::Path;
pub fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn source_provenance() -> Value {
    json!({"program":"odb-convex-decoder","version":"1.0.0","runtime":if cfg!(target_arch="wasm32") {"browser-wasm"} else {"native-memory"}})
}
// Persistent archives are outside this browser decoder's capabilities.
pub fn write_new(_: &Path, _: &[u8]) -> Result<()> {
    Err("Persistent filesystem unavailable in decoder".into())
}
pub fn checkpoint(_: &Path, _: &Value) -> Result<()> {
    Err("Persistent filesystem unavailable in decoder".into())
}

pub fn diagnostic_sha(bytes: &[u8]) -> String {
    if cfg!(target_arch = "wasm32") {
        String::new()
    } else {
        sha(bytes)
    }
}
