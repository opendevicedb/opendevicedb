// SPDX-License-Identifier: AGPL-3.0-or-later
//! Minimal bounded PNG writer: RGBA8, no interlace, filter0 and stored DEFLATE
//! blocks (RFC1950/1951; W3C PNG). No color calibration or gamma is invented.
use crate::{Result, linear_palette::MAX_PIXELS};
fn crc(bytes: &[u8]) -> u32 {
    let mut c = !0u32;
    for &b in bytes {
        c ^= b as u32;
        for _ in 0..8 {
            c = (c >> 1) ^ (0xedb88320u32 & 0u32.wrapping_sub(c & 1));
        }
    }
    !c
}
fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let start = out.len();
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let checksum = crc(&out[start..]);
    out.extend_from_slice(&checksum.to_be_bytes());
}
pub fn encode(width: usize, height: usize, rgba: &[u8]) -> Result<Vec<u8>> {
    let n = width.checked_mul(height).ok_or("PNG dimensions overflow")?;
    if width == 0
        || height == 0
        || width > 2048
        || height > 2048
        || n > MAX_PIXELS
        || rgba.len() != n * 4
    {
        return Err("PNG requires exact bounded RGBA8 dimensions1..2048".into());
    }
    let mut filtered = Vec::with_capacity(rgba.len() + height);
    for row in rgba.chunks_exact(width * 4) {
        filtered.push(0);
        filtered.extend_from_slice(row);
    }
    let mut z = vec![0x78, 0x01];
    for (i, b) in filtered.chunks(65535).enumerate() {
        z.push(u8::from((i + 1) * 65535 >= filtered.len()));
        z.extend_from_slice(&(b.len() as u16).to_le_bytes());
        z.extend_from_slice(&(!(b.len() as u16)).to_le_bytes());
        z.extend_from_slice(b);
    }
    let (mut a, mut b) = (1u32, 0u32);
    for v in filtered {
        a = (a + v as u32) % 65521;
        b = (b + a) % 65521;
    }
    z.extend_from_slice(&((b << 16) | a).to_be_bytes());
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&(width as u32).to_be_bytes());
    ihdr.extend_from_slice(&(height as u32).to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &z);
    chunk(&mut out, b"IEND", &[]);
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn png_checksums_and_external_standard_test_vector() {
        assert_eq!(crc(b"123456789"), 0xcbf43926);
        // Independently generated with Python struct/zlib: one nonopaque RGBA pixel.
        let expected = "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c48900000010494441547801010500faff00010203040019000bb9b0e3eb0000000049454e44ae426082";
        let actual = encode(1, 1, &[1, 2, 3, 4]).unwrap();
        let hex: String = actual.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, expected);
        assert!(encode(1, 1, &[]).is_err());
        assert!(encode(0, 1, &[]).is_err());
        assert!(encode(usize::MAX, 2, &[]).is_err());
    }
}
