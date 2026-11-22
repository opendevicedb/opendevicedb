// SPDX-License-Identifier: AGPL-3.0-or-later
//! Bounded resource access shared by native and WASM callers. No USB or network.
use crate::Result;
use std::{collections::BTreeMap, path::Path};

pub type ResourceStore = BTreeMap<String, Vec<u8>>;
pub trait Source {
    fn read(&self, name: &str, maximum: u64) -> Result<Vec<u8>>;
    fn exists(&self, name: &str) -> Result<bool>;
}
pub struct Files<'a>(pub &'a Path);
impl Source for Files<'_> {
    fn read(&self, name: &str, maximum: u64) -> Result<Vec<u8>> {
        crate::linear_dsp::read_regular(&self.0.join(name), maximum)
    }
    fn exists(&self, name: &str) -> Result<bool> {
        match std::fs::symlink_metadata(self.0.join(name)) {
            Ok(_) => Ok(true),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(format!("Cannot establish resource absence: {e}")),
        }
    }
}
pub struct Memory<'a> {
    pub files: &'a ResourceStore,
    pub group: &'a str,
}
impl Memory<'_> {
    fn builtin(&self, name: &str) -> Option<&'static [u8]> {
        match (self.group, name) {
            ("hv", "0.coe") => Some(include_bytes!("uc5-2s-bank0.coe")),
            _ => None,
        }
    }
}
impl Source for Memory<'_> {
    fn read(&self, name: &str, maximum: u64) -> Result<Vec<u8>> {
        let key = format!("{}/{name}", self.group);
        let bytes = self
            .files
            .get(&key)
            .map(Vec::as_slice)
            .or_else(|| self.builtin(name))
            .ok_or_else(|| format!("Missing resource: {key}"))?;
        if bytes.len() as u64 > maximum {
            return Err(format!("Resource exceeds bound: {key}"));
        }
        Ok(bytes.to_vec())
    }
    fn exists(&self, name: &str) -> Result<bool> {
        Ok(self.files.contains_key(&format!("{}/{name}", self.group))
            || self.builtin(name).is_some())
    }
}
pub fn validate(files: &ResourceStore) -> Result<()> {
    if files.len() > 512 {
        return Err("Resource count exceeds512".into());
    }
    let mut total = 0usize;
    for (key, value) in files {
        let (group, name) = key.split_once('/').ok_or("Invalid resource key")?;
        if !["assets", "hv", "sri", "maps"].contains(&group)
            || name.is_empty()
            || !name.as_bytes()[0].is_ascii_alphanumeric()
            || !name
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
        {
            return Err("Invalid resource key".into());
        }
        total = total
            .checked_add(value.len())
            .ok_or("Resource bound overflow")?;
        if value.len() > 4 * 1024 * 1024 || total > 16 * 1024 * 1024 {
            return Err("Resource bytes exceed bounds".into());
        }
    }
    Ok(())
}
