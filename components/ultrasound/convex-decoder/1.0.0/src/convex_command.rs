// SPDX-License-Identifier: AGPL-3.0-or-later
//! Pure UC5-2S control-envelope serialization.
//!
//! Internal kind 99 is constructed with wire type 2. The named native producers
//! enqueue the pair (0x00060001, 0) for Start and (0x00060001, 1) for Freeze.
//! Construction below assumes an otherwise empty queue/map. These bytes have
//! not been replayed on this unit; names do not establish acoustic states.
//! There is no transport, arbitrary-register encoder or initialization API.

pub const PACKET_BYTES: usize = 512;
pub const PROFILE: &str = "convex-01";
pub const VID_PID: &str = "04b4:4611";
pub const COMMAND_ENDPOINT: u8 = 0x02;
pub const INTERNAL_KIND: u32 = 99;
pub const WIRE_TYPE: u32 = 2;
pub const EVIDENCE_KIND: &str = "static_candidate_not_replayed";

const HEADER: [u8; 4] = [0xa5, 0xa5, 0x5a, 0x5a];
const FOOTER: [u8; 4] = [0x5a, 0x5a, 0xa5, 0xa5];
const CONTROL_KEY: u32 = 0x0006_0001;

/// Native producer names only. Freeze is not a verified acoustic stop or power-off.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    Start,
    Freeze,
}

impl Command {
    fn value(self) -> u32 {
        match self {
            Self::Start => 0,
            Self::Freeze => 1,
        }
    }
}

/// Serialize one isolated named control; this function performs no I/O.
pub fn encode(command: Command) -> [u8; PACKET_BYTES] {
    let mut packet = [0; PACKET_BYTES];
    packet[..4].copy_from_slice(&HEADER);
    packet[4..8].copy_from_slice(&WIRE_TYPE.to_le_bytes());
    packet[16..20].copy_from_slice(&CONTROL_KEY.to_le_bytes());
    packet[20..24].copy_from_slice(&command.value().to_le_bytes());
    packet[24..28].copy_from_slice(&WIRE_TYPE.to_le_bytes());
    packet[28..32].copy_from_slice(&FOOTER);
    packet
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InspectError {
    WrongLength { actual: usize },
    WrongHeader,
    WrongWireType,
    ReservedBytesNonzero,
    MissingAlignedTrailer,
    PaddingNonzero,
}

impl std::fmt::Display for InspectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WrongLength { actual } => write!(f, "Expected one 512-byte packet, got {actual}"),
            Self::WrongHeader => f.write_str("Missing convex type-2 header"),
            Self::WrongWireType => f.write_str("Expected little-endian wire type 2"),
            Self::ReservedBytesNonzero => f.write_str("Bytes 8..16 must be zero in this envelope"),
            Self::MissingAlignedTrailer => f.write_str("Missing type-2 trailer at a pair boundary"),
            Self::PaddingNonzero => f.write_str("Nonzero bytes follow the type-2 trailer"),
        }
    }
}

impl std::error::Error for InspectError {}

/// Two literal little-endian words retained without assigning register semantics.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OpaquePair {
    pub byte_offset: usize,
    pub words: [u32; 2],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LocatedCommand {
    pub byte_offset: usize,
    pub command: Command,
}

/// Structural interpretation of one candidate envelope, never proof of execution.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Inspection {
    pub known_commands: Vec<LocatedCommand>,
    pub opaque_pairs: Vec<OpaquePair>,
    pub pair_count: usize,
    pub trailer_offset: usize,
    pub padding_bytes: usize,
}

impl Inspection {
    pub fn isolated_command(&self) -> Option<Command> {
        match self.known_commands.as_slice() {
            [
                LocatedCommand {
                    byte_offset: 16,
                    command,
                },
            ] if self.pair_count == 1
                && self.opaque_pairs.is_empty()
                && self.trailer_offset == 24
                && self.padding_bytes == 480 =>
            {
                Some(*command)
            }
            _ => None,
        }
    }
}

/// Inspect one zero-padded type-2 packet (at most 61 pairs), not concatenated
/// USB transfers or incoming data. The last aligned marker is the candidate
/// trailer, so an identical pair inside the payload is retained as opaque.
/// Unknown pairs, including zero pairs, are preserved without interpretation.
/// No checksum, acknowledgement, queue history or hardware state is inferred.
pub fn inspect(packet: &[u8]) -> Result<Inspection, InspectError> {
    if packet.len() != PACKET_BYTES {
        return Err(InspectError::WrongLength {
            actual: packet.len(),
        });
    }
    if packet[..4] != HEADER {
        return Err(InspectError::WrongHeader);
    }
    if packet[4..8] != WIRE_TYPE.to_le_bytes() {
        return Err(InspectError::WrongWireType);
    }
    if packet[8..16] != [0; 8] {
        return Err(InspectError::ReservedBytesNonzero);
    }
    let trailer_offset = (16..512)
        .step_by(8)
        .rev()
        .find(|&offset| {
            packet[offset..offset + 4] == WIRE_TYPE.to_le_bytes()
                && packet[offset + 4..offset + 8] == FOOTER
        })
        .ok_or(InspectError::MissingAlignedTrailer)?;
    if packet[trailer_offset + 8..].iter().any(|byte| *byte != 0) {
        return Err(InspectError::PaddingNonzero);
    }
    let mut result = Inspection {
        known_commands: Vec::new(),
        opaque_pairs: Vec::new(),
        pair_count: (trailer_offset - 16) / 8,
        trailer_offset,
        padding_bytes: PACKET_BYTES - trailer_offset - 8,
    };
    for (index, pair) in packet[16..trailer_offset]
        .as_chunks::<8>()
        .0
        .iter()
        .enumerate()
    {
        let words = [
            u32::from_le_bytes(pair[..4].try_into().expect("four-byte key")),
            u32::from_le_bytes(pair[4..].try_into().expect("four-byte value")),
        ];
        let byte_offset = 16 + index * 8;
        let command = match words {
            [CONTROL_KEY, 0] => Some(Command::Start),
            [CONTROL_KEY, 1] => Some(Command::Freeze),
            _ => None,
        };
        if let Some(command) = command {
            result.known_commands.push(LocatedCommand {
                byte_offset,
                command,
            });
        } else {
            result.opaque_pairs.push(OpaquePair { byte_offset, words });
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn isolated_bytes_follow_literal_little_endian_envelope() {
        for (command, value) in [(Command::Start, 0), (Command::Freeze, 1)] {
            let packet = encode(command);
            let mut expected = [0u8; 512];
            expected[..32].copy_from_slice(&[
                0xa5, 0xa5, 0x5a, 0x5a, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 6, 0, value, 0,
                0, 0, 2, 0, 0, 0, 0x5a, 0x5a, 0xa5, 0xa5,
            ]);
            assert_eq!(packet, expected);
            assert_eq!(inspect(&packet).unwrap().isolated_command(), Some(command));
        }
    }

    #[test]
    fn rejects_truncation_concatenation_and_wrong_endianness() {
        let packet = encode(Command::Start);
        for length in [0, 4, 16, 24, 31, 32, 511] {
            assert_eq!(
                inspect(&packet[..length]),
                Err(InspectError::WrongLength { actual: length })
            );
        }
        assert!(inspect(&[packet.as_slice(), packet.as_slice()].concat()).is_err());
        for offset in [0, 4, 24, 28] {
            let mut changed = packet;
            changed[offset..offset + 4].reverse();
            assert!(inspect(&changed).is_err(), "offset {offset}");
        }
    }

    #[test]
    fn rejects_nonzero_reserved_padding_and_unaligned_trailers() {
        for offset in [8, 15, 32, 511] {
            let mut packet = encode(Command::Freeze);
            packet[offset] = 1;
            assert!(inspect(&packet).is_err(), "offset {offset}");
        }
        let mut packet = encode(Command::Start);
        packet.copy_within(24..32, 25);
        packet[24] = 0;
        assert_eq!(inspect(&packet), Err(InspectError::MissingAlignedTrailer));
    }

    #[test]
    fn unknown_pairs_are_opaque_including_a_marker_pair_inside_payload() {
        let mut packet = encode(Command::Start);
        // The old trailer becomes an opaque pair; a new one follows it.
        packet[32..36].copy_from_slice(&[0x78, 0x56, 0x34, 0x12]);
        packet[36..40].copy_from_slice(&[0xef, 0xcd, 0xab, 0x90]);
        packet[40..48].copy_from_slice(&[2, 0, 0, 0, 0x5a, 0x5a, 0xa5, 0xa5]);
        let result = inspect(&packet).unwrap();
        assert_eq!(result.pair_count, 3);
        assert_eq!(
            result.opaque_pairs,
            vec![
                OpaquePair {
                    byte_offset: 24,
                    words: [2, 0xa5a5_5a5a]
                },
                OpaquePair {
                    byte_offset: 32,
                    words: [0x1234_5678, 0x90ab_cdef]
                },
            ]
        );
        assert_eq!(result.isolated_command(), None);
    }

    #[test]
    fn bounds_opaque_pairs_to_one_packet_without_guessing_zero_fill() {
        let mut packet = [0u8; 512];
        packet[..4].copy_from_slice(&HEADER);
        packet[4..8].copy_from_slice(&WIRE_TYPE.to_le_bytes());
        packet[504..508].copy_from_slice(&WIRE_TYPE.to_le_bytes());
        packet[508..].copy_from_slice(&FOOTER);
        let result = inspect(&packet).unwrap();
        assert_eq!(result.pair_count, 61);
        assert_eq!(result.opaque_pairs.len(), 61);
        assert_eq!(result.padding_bytes, 0);
        assert!(result.known_commands.is_empty());
    }

    #[test]
    fn control_key_with_unrecognized_value_is_preserved() {
        let mut packet = encode(Command::Start);
        packet[20..24].copy_from_slice(&0x0100_0000u32.to_le_bytes());
        let result = inspect(&packet).unwrap();
        assert_eq!(result.opaque_pairs[0].words, [CONTROL_KEY, 0x0100_0000]);
        assert_eq!(result.isolated_command(), None);
    }
}
