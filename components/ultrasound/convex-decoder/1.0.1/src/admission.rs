use crate::{HEADER_BYTES, MARKER, Result, convex_bfsp::Plan};
pub fn audit_candidate(lines: &[u8], header: &[u8], plan: Plan) -> Result<u8> {
    if header.len() != HEADER_BYTES
        || header[..4] != MARKER
        || header[4..8] != MARKER
        || ![0, 1, 5, 6].contains(&header[16])
        || lines.len() != plan.input_bytes()
    {
        return Err(
            "Require candidate B header1024 and exact declared General B line-buffer length".into(),
        );
    }
    for line in lines.chunks_exact(plan.line_words() * 4) {
        let word = u32::from_le_bytes(line[4..8].try_into().unwrap());
        if line[..4] != MARKER
            || word & 0xffff != plan.line_words() as u32
            || ([5, 6].contains(&header[16]) && (word >> 20) & 15 >= 4)
        {
            return Err("Candidate line marker/word length/B subtype mismatch".into());
        }
    }
    Ok(header[17])
}
