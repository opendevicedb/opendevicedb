// SPDX-License-Identifier: AGPL-3.0-or-later
use crate::{Result, convex_parameters::sha};
use serde_json::{Value, json};
fn u16_at(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes(b[o..o + 2].try_into().unwrap())
}
fn u32_at(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
pub fn decode(raw: &[u8]) -> Result<Value> {
    if raw.len() != 512 {
        return Err(
            "Require one complete512-byte host read; partials are not padded or concatenated"
                .into(),
        );
    }
    let version = u32_at(raw, 8);
    let flags = u16_at(raw, 500);
    let pid = u32_at(raw, 504);
    let msg_type = u32_at(raw, 16);
    let probe = u16_at(raw, 12);
    let connection = u16_at(raw, 76);
    let family = if pid == 0 {
        "hardware_parameters_candidate"
    } else if pid == 1 {
        "gyro_candidate"
    } else if msg_type == 2 {
        "button_candidate"
    } else {
        "unknown"
    };
    Ok(
        json!({"schema_version":"convex-message-candidate-v1","bytes":512,"sha256":sha(raw),"family":family,
        "header_word":u32_at(raw,0),"tail_word":u32_at(raw,508),"framing_or_checksum_validated":false,
        "logic_revision_bytes":[raw[4],raw[5]],"hardware_revision_bytes":[raw[6],raw[7]],
        "logic_compile_version":version,"logic_type":(version>>14)&3,"product_series":(version>>9)&31,"logic_revision_bits":version&511,
        "reported_probe_id":probe,"java_probe_id_candidate":if probe==0&&connection==0{21845}else{probe},"probe_backup_flags":u16_at(raw,14),
        "secondary_probe_id":u16_at(raw,72),"secondary_probe_append":u16_at(raw,74),"probe_connection_bits":connection,
        "message_type":msg_type,"message_value":u32_at(raw,20),"message_pid":pid,
        "special_flag0":u16_at(raw,498),"special_flag1":flags,"low_power_mode":(flags&6)>>1,"pluggable_probe_bits":(flags&24)>>3,"color_type":u16_at(raw,502),
        "motion_raw_i16":(0..6).map(|n|u16_at(raw,52+2*n) as i16).collect::<Vec<_>>(),
        "selected_uc5_2s_parameters_candidate":pid==0&&probe==1435,
        "native_deferred_probe_branch_possible":((version>>9)&31==14||(version>>9)&31==15)&&probe==0,
        "device_unique_fields_exported":false,"physical_calibration":null,"acoustic_state_verified":false,
        "scope":"Field interpretation of one complete host-read payload; neither source authenticity nor live/current device state"}),
    )
}
