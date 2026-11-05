// SPDX-License-Identifier: AGPL-3.0-or-later
//! Bounded UC5-2S TX16/ADC8 configuration primitives, offline only.
//! These are parts of an unresolved complete lifecycle, never an executable
//! activation plan. Vendor file payloads are supplied locally, not embedded.
use crate::Result;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::Read,
    path::Path,
};

pub(crate) const FILES: [(&str, usize); 7] = [
    ("A_Probe.bin", 68),
    ("A_ADC.bin", 20),
    ("A_TxWave.bin", 660),
    ("B_PRF.bin", 388),
    ("A_ATGC.bin", 1024),
    ("A_Apo.bin", 2048),
    ("A_ApoComp.bin", 2048),
];
pub(crate) fn word(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
}
pub(crate) fn exact(bytes: &[u8], size: usize, name: &str) -> Result<()> {
    if bytes.len() != size {
        Err(format!("{name} requires exactly{size}bytes"))
    } else {
        Ok(())
    }
}
pub(crate) fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Probe {
    pub clock_setting: f32,
}
impl Probe {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        exact(bytes, 68, "A_Probe.bin")?;
        let clock_setting = f32::from_bits(word(bytes, 0x18));
        if word(bytes, 0x1c) != 8
            || word(bytes, 0x40) != 16
            || word(bytes, 0x38) != 0
            || word(bytes, 0x10) != 1
        {
            return Err("This partial profile requires non-PA/TX16/ADC8/NEoff; folder name is not a selector".into());
        }
        if !clock_setting.is_finite() || clock_setting <= 0.0 {
            return Err("Clock setting must be finite and positive".into());
        }
        Ok(Self { clock_setting })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Adc8(pub(crate) [u32; 5]);
impl Adc8 {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        exact(bytes, 20, "A_ADC.bin")?;
        Ok(Self(std::array::from_fn(|i| word(bytes, 4 * i))))
    }
    /// Isolated kind2 buffer with only these five producer entries present.
    pub fn isolated_packet(&self) -> Vec<u8> {
        pairs(
            &self
                .0
                .iter()
                .enumerate()
                .map(|(i, &v)| (0x0005_0035 + i as u32, v))
                .collect::<Vec<_>>(),
        )
    }
}

#[derive(Clone, Debug)]
pub struct TxWave8(Vec<u32>);
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FundamentalWave {
    pub(crate) fields: [u32; 5],
}
impl TxWave8 {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        exact(bytes, 660, "A_TxWave.bin")?;
        Ok(Self((0..165).map(|i| word(bytes, 4 * i)).collect()))
    }
    pub fn fundamental(&self, index: usize) -> Result<FundamentalWave> {
        if index >= 16 {
            return Err("Fundamental TxWave index must be0..15".into());
        }
        Ok(FundamentalWave {
            fields: std::array::from_fn(|bank| self.0[33 * bank + index]),
        })
    }
}
impl FundamentalWave {
    pub fn isolated_packet(self) -> Vec<u8> {
        pairs(&[
            (0x0007_0003, self.fields[1] | self.fields[4].wrapping_shl(8)),
            (0x0007_0021, self.fields[0]),
        ])
    }
    /// Direct builder: ordering and repeated key are retained, not map-deduped.
    /// Native SendVoltageMsg ends with 0x10, not 1 (USB-test start).
    /// This is only the voltage-state envelope, not voltage units or Start.
    pub fn voltage_packet(self) -> Vec<u8> {
        pairs(&[
            (0x0007_0034, 0),
            (0x0007_001a, self.fields[3]),
            (0x0007_0034, 0x10),
        ])
    }
    pub fn delay_setting(self) -> u32 {
        self.fields[2]
    }
}

#[derive(Clone, Debug)]
pub struct Prf8 {
    count: usize,
    banks: [[i32; 8]; 12],
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SelectedPrf {
    pub display_setting: i32,
    pub fields: [i32; 13],
}
impl Prf8 {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        exact(bytes, 388, "B_PRF.bin")?;
        let count = word(bytes, 0) as usize;
        if !(1..=8).contains(&count) {
            return Err("PRF8 count must be1..8".into());
        }
        Ok(Self {
            count,
            banks: std::array::from_fn(|b| {
                std::array::from_fn(|i| word(bytes, 4 + 32 * b + 4 * i) as i32)
            }),
        })
    }
    pub fn depth_count(&self) -> usize {
        self.count
    }
    pub fn select(&self, depth: usize, clock: f32) -> Result<SelectedPrf> {
        // Native depth==count aliases later banks/clock: deliberately refused.
        if depth >= self.count || !clock.is_finite() || clock <= 0.0 {
            return Err("Invalid PRF depth or clock setting".into());
        }
        let mut fields = [0; 13];
        for (out, bank) in [1, 2, 3, 4].into_iter().enumerate() {
            fields[out] = self.banks[bank][depth];
        }
        for (out, bank) in [(4, 3), (5, 4)] {
            let divisor = self.banks[bank][depth];
            if divisor <= 0 {
                return Err("PRF timing divisor must be positive".into());
            }
            let v = ((clock * 1_000_000.0) / divisor as f32) * 0.25;
            if !v.is_finite() || !(0.0..2_147_483_648.0).contains(&v.trunc()) {
                return Err("PRF timing conversion exceeds signed32".into());
            }
            fields[out] = i32::try_from((v.trunc() as i64) * 4)
                .map_err(|_| "PRF shifted timing exceeds signed32")?;
        }
        for (out, bank) in (5..12).enumerate() {
            fields[out + 6] = self.banks[bank][depth];
        }
        Ok(SelectedPrf {
            display_setting: self.banks[0][depth],
            fields,
        })
    }
}

// Private serializer: fixed named producers above, no public arbitrary-register
// builder and no conversion into the linear executor's sealed Plan type.
fn pairs(entries: &[(u32, u32)]) -> Vec<u8> {
    let mut bytes = vec![0; 512];
    put(&mut bytes, 0, 0x5a5a_a5a5);
    put(&mut bytes, 4, 2);
    for (i, &(key, value)) in entries.iter().enumerate() {
        put(&mut bytes, 16 + 8 * i, key);
        put(&mut bytes, 20 + 8 * i, value);
    }
    put(&mut bytes, 16 + 8 * entries.len(), 2);
    put(&mut bytes, 20 + 8 * entries.len(), 0xa5a5_5a5a);
    bytes
}
fn put(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

#[derive(Clone, Copy, Debug)]
pub enum Upload {
    Atgc,
    Apo,
    ApoComp,
}
impl Upload {
    pub fn file(self) -> &'static str {
        match self {
            Self::Atgc => "A_ATGC.bin",
            Self::Apo => "A_Apo.bin",
            Self::ApoComp => "A_ApoComp.bin",
        }
    }
    pub fn encode(self, raw: &[u8]) -> Result<Vec<u8>> {
        let (kind, size, metadata) = match self {
            Self::Atgc => (12, 1024, 256u32),
            Self::Apo => (13, 2048, 0),
            Self::ApoComp => (14, 2048, 0),
        };
        exact(raw, size, self.file())?;
        let meaningful = 16 + raw.len() + 8;
        let mut bytes = vec![0; meaningful.div_ceil(512) * 512];
        put(&mut bytes, 0, 0x5a5a_a5a5);
        put(&mut bytes, 4, kind | metadata << 20);
        bytes[16..16 + raw.len()].copy_from_slice(raw);
        put(&mut bytes, 16 + raw.len(), kind);
        put(&mut bytes, 20 + raw.len(), 0xa5a5_5a5a);
        Ok(bytes)
    }
}

pub(crate) fn load(directory: &Path, name: &str, size: usize) -> Result<Vec<u8>> {
    let path = directory.join(name);
    if !fs::symlink_metadata(&path)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_file()
    {
        return Err(format!("{name}: regular non-symlink input required"));
    }
    let file = File::open(&path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Opened input is not regular".into());
    }
    let mut bytes = Vec::new();
    file.take(size as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    exact(&bytes, size, name)?;
    Ok(bytes)
}
