// Fixed bench setting. Generated offline; do not edit numeric values by hand.
use odb_convex_decoder::Result;
use serde_json::Value;
pub fn configuration() -> Result<Value> {
    serde_json::from_str(r#"{"grouping":{"b_capacity_bytes":2097152,"bm_header_26":0,"bm_header_28":0,"epoch_policy":"new-organizer-per-observed-epoch-v1","m_capacity_bytes":2097152,"m_line_count":1,"schema_version":"convex-b-grouping-settings-v1"},"parameters":{"A":2,"B":0,"C":4,"D":4,"E":4},"selection":{"depth_index":0,"disable_low_power":false,"focus_index":0,"frequency_index":0,"register_order":"ascending-address-portability-v1","schema_version":"convex-b-message-selection-v1","state_policy":"fresh-b-only-v1"},"settings":{"bfsp":{"depth_index":0,"line_words":1800,"schema_version":"convex-bfsp-settings-v1","selector_index":0},"dsc":{"depth_index":0,"gray_map":0,"height":512,"schema_version":"convex-dsc-settings-v1","tint_map":0,"width":512},"dtgc":{"bank_selector_0x48":0,"dynamic_range":60,"gain":50,"schema_version":"convex-dtgc-settings-v1","tgc_controls":[0,0,0,0,0,0]},"max_groups":128,"schema_version":"convex-pipeline-settings-v1","sri":{"correlation_index":3,"enhancement":0}}}"#).map_err(|e|e.to_string())
}
pub fn binding_signature() -> Result<Value> {
    serde_json::from_str(r#"{"color_type":0,"logic_compile_version":19458,"low_power_mode":0,"message_pid":0,"message_type":0,"probe_backup_flags":0,"probe_connection_bits":0,"reported_probe_id":0,"secondary_probe_append":0,"secondary_probe_id":0,"special_flag0":0,"special_flag1":0}"#).map_err(|e|e.to_string())
}
