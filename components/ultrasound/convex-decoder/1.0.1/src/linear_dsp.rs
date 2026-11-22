use crate::Result;
use std::{fs::File, io::Read, path::Path};
pub(crate) fn read_regular(path: &Path, maximum: u64) -> Result<Vec<u8>> {
    if !std::fs::symlink_metadata(path)
        .map_err(|e| format!("{}: {e}", path.display()))?
        .file_type()
        .is_file()
    {
        return Err("Input must be a regular non-symlink file".into());
    }
    let file = File::open(path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Opened input is not a regular file".into());
    }
    let mut bytes = Vec::new();
    file.take(maximum.checked_add(1).ok_or("Read bound overflow")?)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > maximum {
        return Err("Input exceeds bounded read".into());
    }
    Ok(bytes)
}
fn word(bytes: &[u8], offset: usize) -> Result<u32> {
    Ok(u32::from_le_bytes(
        bytes
            .get(offset..offset.checked_add(4).ok_or("Offset overflow")?)
            .ok_or("Truncated word")?
            .try_into()
            .unwrap(),
    ))
}
fn floats(bytes: &[u8], count: usize) -> Result<Vec<f32>> {
    if bytes.len() != count.checked_mul(4).ok_or("Float size overflow")? {
        return Err("Unexpected coefficient length".into());
    }
    let result: Vec<_> = bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect();
    if result.iter().any(|f| !f.is_finite()) {
        return Err("Nonfinite input coefficient; no computation attempted".into());
    }
    Ok(result)
}
