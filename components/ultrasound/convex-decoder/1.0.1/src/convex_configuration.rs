// SPDX-License-Identifier: AGPL-3.0-or-later
//! Offline, hash-bound UC5-2S producer bundle. Not a transport/executable plan.
use crate::{
    Result,
    convex_parameters::{self as p, Adc8, Prf8, TxWave8, Upload},
    convex_producers as c,
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, path::Path};
const EXTRA: [(&str, usize); 5] = [
    ("A_BF.bin", 44),
    ("B_TxControl.bin", 1024),
    ("B_DynamicFilter.bin", 43084),
    ("B_LPF.bin", 256),
    ("A_Up4Coef.bin", 364),
];
pub struct Request {
    depth: usize,
    frequency: usize,
    focus: usize,
    logic: u32,
    low_power: u8,
    disable_low_power: bool,
}
impl Request {
    pub fn parse(v: &Value) -> Result<Self> {
        let keys = [
            "schema_version",
            "depth_index",
            "frequency_index",
            "focus_index",
            "logic_compile_version",
            "low_power_mode",
            "disable_low_power",
            "state_policy",
            "register_order",
        ];
        let obj = v.as_object().ok_or("Convex request must be an object")?;
        if obj.len() != keys.len()
            || obj.keys().any(|k| !keys.contains(&k.as_str()))
            || v["schema_version"] != "convex-b-producers-request-v1"
            || v["state_policy"] != "fresh-b-only-v1"
            || v["register_order"] != "ascending-address-portability-v1"
        {
            return Err("Require exact convex-b-producers-request-v1 with explicit fresh-B state and register-order policy".into());
        }
        let get = |k: &str, max: u64| {
            v[k].as_u64()
                .filter(|v| *v <= max)
                .ok_or_else(|| format!("Invalid {k}"))
        };
        Ok(Self {
            depth: get("depth_index", 7)? as usize,
            frequency: get("frequency_index", 2)? as usize,
            focus: get("focus_index", 6)? as usize,
            logic: get("logic_compile_version", u32::MAX as u64)? as u32,
            low_power: get("low_power_mode", 3)? as u8,
            disable_low_power: v["disable_low_power"]
                .as_bool()
                .ok_or("Explicit disable_low_power boolean required")?,
        })
    }
    fn json(&self) -> Value {
        json!({"schema_version":"convex-b-producers-request-v1","depth_index":self.depth,"frequency_index":self.frequency,
        "focus_index":self.focus,"logic_compile_version":self.logic,"low_power_mode":self.low_power,"disable_low_power":self.disable_low_power,
        "state_policy":"fresh-b-only-v1","register_order":"ascending-address-portability-v1"})
    }
}
struct Packet {
    name: &'static str,
    kind: u32,
    wire: u32,
    bytes: Vec<u8>,
    role: &'static str,
}
fn packet(kind: u32, metadata: u32, payload: &[u8]) -> Result<Vec<u8>> {
    if payload.is_empty()
        || !payload.len().is_multiple_of(4)
        || payload.len() > 4096 * 4
        || metadata > 4095
        || kind > 255
    {
        return Err("Invalid bounded producer payload/metadata".into());
    }
    let meaningful = payload.len() + 24;
    let mut result = vec![0; meaningful.div_ceil(512) * 512];
    result[..16].copy_from_slice(&c::words([0x5a5aa5a5, kind | metadata << 20, 0, 0]));
    result[16..16 + payload.len()].copy_from_slice(payload);
    result[16 + payload.len()..meaningful].copy_from_slice(&c::words([kind, 0xa5a55a5a]));
    Ok(result)
}
fn registers(entries: &[(u32, u32)]) -> Result<Vec<u8>> {
    if entries.is_empty() || entries.len() > 61 {
        return Err("Selected register packet requires1..61pairs".into());
    }
    packet(2, 0, &c::words(entries.iter().flat_map(|&(a, b)| [a, b])))
}
struct Inputs {
    raw: BTreeMap<String, Vec<u8>>,
    hv: Vec<u8>,
    files: Value,
    matches: Vec<String>,
    hv_file: Value,
}
/// Inputs are loaded and hash-bound before opening USB. Logic/low-power can
/// only be supplied later by the acquisition coordinator's persisted message.
pub(crate) struct Prepared {
    inputs: Inputs,
    selection: Value,
}
impl Prepared {
    pub(crate) fn load(directory: &Path, hv: &Path, selection: Value) -> Result<Self> {
        Self::from_source(
            &crate::resources::Files(directory),
            &crate::resources::Files(hv),
            selection,
        )
    }
    pub(crate) fn from_source(
        directory: &dyn crate::resources::Source,
        hv: &dyn crate::resources::Source,
        selection: Value,
    ) -> Result<Self> {
        validate_selection(&selection)?;
        Ok(Self {
            inputs: load_source(directory, hv)?,
            selection,
        })
    }
    pub(crate) fn report(&self) -> Value {
        json!({"selection":self.selection,"files":self.inputs.files,
            "hv_file":self.inputs.hv_file,"matching_verified_asset_groups":self.inputs.matches})
    }
    pub(crate) fn bind(self, logic: u32, low_power: u8) -> Result<Bundle> {
        let mut request = self.selection;
        request["schema_version"] = json!("convex-b-producers-request-v1");
        request["logic_compile_version"] = json!(logic);
        request["low_power_mode"] = json!(low_power);
        Bundle::build(self.inputs, Request::parse(&request)?)
    }
}
/// Validate the fixed acquisition inputs before a caller starts a preview or
/// opens USB. This report is not a capability to bind hardware parameters.
pub fn preparation_report(directory: &Path, hv: &Path, selection: Value) -> Result<Value> {
    Ok(Prepared::load(directory, hv, selection)?.report())
}
fn validate_selection(v: &Value) -> Result<()> {
    let keys = [
        "schema_version",
        "depth_index",
        "frequency_index",
        "focus_index",
        "disable_low_power",
        "state_policy",
        "register_order",
    ];
    if !v
        .as_object()
        .is_some_and(|o| o.len() == keys.len() && o.keys().all(|k| keys.contains(&k.as_str())))
        || v["schema_version"] != "convex-b-message-selection-v1"
        || v["state_policy"] != "fresh-b-only-v1"
        || v["register_order"] != "ascending-address-portability-v1"
        || ![
            ("depth_index", 7),
            ("frequency_index", 2),
            ("focus_index", 6),
        ]
        .iter()
        .all(|(key, max)| v[key].as_u64().is_some_and(|n| n <= *max))
        || v["disable_low_power"].as_bool().is_none()
    {
        return Err("Require exact convex-b-message-selection-v1 and bounded B-only selection; no caller-supplied logic or low-power".into());
    }
    Ok(())
}
fn load(directory: &Path, hv_directory: &Path) -> Result<Inputs> {
    load_source(
        &crate::resources::Files(directory),
        &crate::resources::Files(hv_directory),
    )
}
fn load_source(
    directory: &dyn crate::resources::Source,
    hv_directory: &dyn crate::resources::Source,
) -> Result<Inputs> {
    let mut raw = BTreeMap::new();
    let mut files = Vec::new();
    for (name, size) in p::FILES.into_iter().chain(EXTRA) {
        let b = directory.read(name, size as u64)?;
        p::exact(&b, size, name)?;
        files.push(json!({"name":name,"bytes":b.len(),"sha256":p::sha(&b)}));
        raw.insert(name.into(), b);
    }
    let known: Value = serde_json::from_str(include_str!("known_convex_producer_assets.json"))
        .map_err(|e| e.to_string())?;
    let matches: Vec<String> = known["profiles"]
        .as_object()
        .ok_or("Missing known producer groups")?
        .iter()
        .filter_map(|(name, expected)| {
            expected
                .as_object()?
                .iter()
                .all(|(name, meta)| {
                    files.iter().any(|r| {
                        r["name"] == *name
                            && r["sha256"] == meta["sha256"]
                            && r["bytes"] == meta["bytes"]
                    })
                })
                .then_some(name.clone())
        })
        .collect();
    if matches.is_empty() {
        return Err(
            "Inputs must match one complete known twelve-file UC5-2S producer group".into(),
        );
    }
    let g = c::Geometry::parse(&raw["A_Probe.bin"])?;
    let name = format!("{}.coe", g.hv_index);
    let meta = &known["hv_files"][&name];
    let size = meta["bytes"].as_u64().ok_or("Unrecognized HV selection")?;
    let hv = hv_directory.read(&name, size)?;
    p::exact(&hv, size as usize, &name)?;
    if meta["sha256"] != p::sha(&hv) {
        return Err("HV input hash mismatch".into());
    }
    let hv_file = json!({"name":name,"bytes":hv.len(),"sha256":p::sha(&hv)});
    Ok(Inputs {
        raw,
        hv,
        files: json!(files),
        matches,
        hv_file,
    })
}
/// Named fixed producers only. Payloads remain private to this module and are
/// neither accepted by the linear executor nor exported by the report CLI.
pub struct Bundle {
    request: Request,
    inputs: Inputs,
    packets: Vec<Packet>,
    tx: Value,
    scan: Value,
    waveform: usize,
    register_count: usize,
}
impl Bundle {
    pub(crate) fn into_packets(self) -> Vec<(&'static str, Vec<u8>)> {
        self.packets
            .into_iter()
            .map(|p| (p.name, p.bytes))
            .collect()
    }
    pub fn load(directory: &Path, hv_directory: &Path, request: Request) -> Result<Self> {
        Self::build(load(directory, hv_directory)?, request)
    }
    fn build(inputs: Inputs, request: Request) -> Result<Self> {
        let r = &inputs.raw;
        let g = c::Geometry::parse(&r["A_Probe.bin"])?;
        let selected = Prf8::parse(&r["B_PRF.bin"])?.select(request.depth, g.clock)?;
        let selection = c::select_tx(
            &r["B_TxControl.bin"],
            g,
            request.depth,
            request.frequency,
            request.focus,
        )?;
        let wave = TxWave8::parse(&r["A_TxWave.bin"])?.fundamental(selection.waveform)?;
        let tx = c::tx(&r["B_TxControl.bin"], g, &selection, wave)?;
        let rx = c::rx(g)?;
        let filters = c::filters(
            &r["B_DynamicFilter.bin"],
            &r["B_LPF.bin"],
            &r["A_Up4Coef.bin"],
            request.depth,
            request.frequency,
        )?;
        let scan = c::scan(
            g,
            selected,
            &r["A_BF.bin"],
            request.logic,
            request.low_power,
            request.disable_low_power,
        )?;
        let mut map = BTreeMap::new();
        let mut add = |entries: &[(u32, u32)]| -> Result<()> {
            for &(k, v) in entries {
                if let Some(previous) = map.insert(k, v)
                    && previous != v
                {
                    return Err(format!("Conflicting selected producer register{k:08x}"));
                }
            }
            Ok(())
        };
        let adc = Adc8::parse(&r["A_ADC.bin"])?;
        add(&adc
            .0
            .iter()
            .enumerate()
            .map(|(i, &v)| (0x50035 + i as u32, v))
            .collect::<Vec<_>>())?;
        add(&[
            (0x70003, wave.fields[1] | wave.fields[4].wrapping_shl(8)),
            (0x70021, wave.fields[0]),
        ])?;
        add(&tx.gates)?;
        add(&filters.registers)?;
        add(&scan.registers)?;
        let f = selected.fields;
        let points = f[1] as i64;
        if points <= 0 || f[11] < 0 {
            return Err("Points/multiplier outside selected B branch".into());
        }
        let upload = points * 2 / filters.iq_m as i64;
        let bf_cut = c::integer(
            (((g.offset + g.offset) / f32::from_bits(0x3fc51eb8)) * g.clock * 0.25) as f64,
            "BF cut",
        )? as i64;
        add(&[
            (0x50030, 0),
            (0x5000e, 2),
            (0x5001e, 3),
            (0x50009, 2),
            (0x60017, c::half(upload, 0)?),
            (0x60018, c::half((points + 32) * 2, bf_cut)?),
            (0x60042, c::half(0, 32)?),
            (0x60046, c::half((f[11] as i64 * upload + 32) / 4, 0)?),
            (0x60047, 2),
            (0x60048, c::unsigned((2 * upload + 32) / 4)?),
            (0x50047, c::unsigned(f[8] as i64)?),
            (0x50033, 0),
            (0x50034, 0),
        ])?;
        let register_count = map.len();
        let sorted: Vec<_> = map.into_iter().collect();
        let mut packets = vec![
            Packet {
                name: "probe-index-activation",
                kind: 100,
                wire: 2,
                bytes: registers(&[(0x50060, 1)])?,
                role: "native immediate candidate; not a scheduler barrier",
            },
            Packet {
                name: "deduplicated-registers",
                kind: 2,
                wire: 2,
                bytes: registers(&sorted)?,
                role: "buffered family; ascending-address portability order",
            },
        ];
        for (name, kind, metadata, payload) in [
            ("TX16", 5, 8, tx.payload),
            ("RX-ADC8", 6, 0, rx),
            ("B-LPF", 8, 1280, filters.lpf),
            ("B-IQ", 16, 512, filters.iq),
            ("Up4", 18, 0, filters.up4),
            ("HV-SW", 21, 0, c::hv(&inputs.hv)?),
        ] {
            packets.push(Packet {
                name,
                kind,
                wire: kind,
                bytes: packet(kind, metadata, &payload)?,
                role: "buffered family",
            });
        }
        for (name, kind, upload) in [
            ("ATGC", 12, Upload::Atgc),
            ("Apo", 13, Upload::Apo),
            ("ApoComp", 14, Upload::ApoComp),
        ] {
            packets.push(Packet {
                name,
                kind,
                wire: kind,
                bytes: upload.encode(&r[upload.file()])?,
                role: "buffered family",
            });
        }
        packets.push(Packet {
            name: "ScanCtrl",
            kind: 1,
            wire: 1,
            bytes: packet(1, 0, &scan.payload)?,
            role: "buffered family",
        });
        packets.push(Packet {
            name: "voltage-state",
            kind: 2,
            wire: 2,
            bytes: wave.voltage_packet(),
            role: "direct candidate with repeated key; never deduplicated",
        });
        Ok(Self {
            request,
            inputs,
            packets,
            tx: tx.report,
            scan: scan.report,
            waveform: selection.waveform,
            register_count,
        })
    }
    pub fn report(&self) -> Value {
        json!({"schema_version":"convex-b-producer-bundle-v1","profile":"convex-01","vid_pid":"04b4:4611","software":crate::identity::build_provenance(),
            "mode":"offline_only","selected_branch_producers_materialized":true,"complete_configuration":false,"executable_plan":false,"usb_accessed":false,
            "request":self.request.json(),"matching_verified_asset_groups":self.inputs.matches,"files":self.inputs.files,"hv_file":self.inputs.hv_file,
            "selection":{"fundamental_waveform_index":self.waveform,"origin":"B_TxControl depth/frequency/focus getters","TXchannels":16,"ADCvariant":8,
                "mode":"B","harmonic":false,"NE":false,"PA":false,"C_D_frequencies_for_Up4":0},
            "TX":self.tx,"ScanCtrl":self.scan,"deduplicated_register_count":self.register_count,
            "packets":self.packets.iter().map(|p|json!({"producer":p.name,"internal_kind":p.kind,"wire_type":p.wire,"bytes":p.bytes.len(),"sha256":p::sha(&p.bytes),"role":p.role})).collect::<Vec<_>>(),
            "packet_payloads_exported":false,"listing_is_execution_order":false,"native_buffer_drain_order":[2,5,6,8,16,18,21,12,13,14,1,99],
            "controls":[{"name":"Start","internal_kind":99,"wire_type":2,"sha256":p::sha(&crate::convex_command::encode(crate::convex_command::Command::Start))},
                {"name":"Freeze","internal_kind":99,"wire_type":2,"sha256":p::sha(&crate::convex_command::encode(crate::convex_command::Command::Freeze))}],
            "numerical_policy":"sequential host binary32; TX +/-0.5 in binary64 then truncation, RX +/-0.5 in binary32; checked integer conversions",
            "register_order_policy":"ascending-address-portability-v1; native unordered_map iteration is not reproduced",
            "padding_policy":"explicit zeros; no uninitialized native bytes copied","physical_calibration":null,"gpu_or_native_equivalence_validated":false,
            "unresolved_required":["actual logic-version/low-power hardware message and reconnect attribution","callback side effects (including LogicType!=0 and voltage10)",
                "complete lifecycle executor and hardware acknowledgements/error recovery","attributed transfer order/timing and numeric reference runtime","phantom image and verified acoustic/electrical stop"],
            "limitations":["Materialized producer families do not prove a complete native configuration or executable activation sequence",
                "Declared fresh B-only state excludes harmonic/PA/NE/debug/C/D and focus overrides",
                "Native first ordinary packet can write implicit Freeze; kind100 can write immediately; timer can later write Start without UnFreeze",
                "No USB access, device compatibility, voltage units, sound speed or geometric calibration inferred from file settings",
                "Vendor inputs read once and hash-bound; reports export digests and selected derived settings, not payloads"]})
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    fn put(raw: &mut [u8], off: usize, v: u32) {
        raw[off..off + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn request() -> Value {
        json!({"schema_version":"convex-b-producers-request-v1","depth_index":0,"frequency_index":1,"focus_index":6,
        "logic_compile_version":0,"low_power_mode":2,"disable_low_power":false,"state_policy":"fresh-b-only-v1","register_order":"ascending-address-portability-v1"})
    }
    pub(crate) fn bundle() -> Bundle {
        Bundle::build(inputs(), Request::parse(&request()).unwrap()).unwrap()
    }
    pub(crate) fn prepared() -> Prepared {
        let mut v = request();
        v.as_object_mut().unwrap().remove("logic_compile_version");
        v.as_object_mut().unwrap().remove("low_power_mode");
        v["schema_version"] = json!("convex-b-message-selection-v1");
        Prepared {
            inputs: inputs(),
            selection: v,
        }
    }
    fn inputs() -> Inputs {
        let mut raw: BTreeMap<String, Vec<u8>> = p::FILES
            .into_iter()
            .chain(EXTRA)
            .map(|(n, s)| (n.into(), vec![0; s]))
            .collect();
        let probe = raw.get_mut("A_Probe.bin").unwrap();
        for (o, v) in [
            (0, 0.5f32.to_bits()),
            (4, 50f32.to_bits()),
            (8, 10f32.to_bits()),
            (0x10, 1),
            (0x14, 2),
            (0x18, 100f32.to_bits()),
            (0x1c, 8),
            (0x24, 64),
            (0x40, 16),
        ] {
            put(probe, o, v);
        }
        let bf = raw.get_mut("A_BF.bin").unwrap();
        for (o, v) in [(4, 4), (12, 128), (16, 64)] {
            put(bf, o, v);
        }
        let tx = raw.get_mut("B_TxControl.bin").unwrap();
        for (i, v) in [1, 2, 3].into_iter().enumerate() {
            put(tx, 4 * i, v);
        }
        for d in 0..8 {
            for j in 0..8 {
                put(tx, 0x40 + 44 * d + 4 * j, 20 + 10 * j as u32);
            }
            for (j, v) in [2, 1, 0].into_iter().enumerate() {
                put(tx, 0x40 + 44 * d + 32 + 4 * j, v);
            }
            put(tx, 0x1a0 + 16 * d, 16);
            for j in 1..4 {
                put(tx, 0x1a0 + 16 * d + 4 * j, (d as u32 + 1) * 20);
            }
        }
        let prf = raw.get_mut("B_PRF.bin").unwrap();
        put(prf, 0, 8);
        for (bank, v) in [0, 100, 1000, 1000, 2000, 24, 24, 4, 2, 2, 4, 4]
            .into_iter()
            .enumerate()
        {
            for d in 0..8 {
                put(prf, 4 + bank * 32 + d * 4, v);
            }
        }
        let dynf = raw.get_mut("B_DynamicFilter.bin").unwrap();
        put(dynf, 0, 2);
        for f in 0..3 {
            put(dynf, 0xa834 + 4 * f, 3);
        }
        Inputs {
            raw,
            hv: b"01020304,\r\nA0B0C0D0;".to_vec(),
            files: json!([]),
            matches: vec![],
            hv_file: json!({"synthetic":true}),
        }
    }
    #[test]
    fn request_requires_all_logic_and_policy_fields_and_refuses_unmapped_scopes() {
        assert!(Request::parse(&request()).is_ok());
        for key in request().as_object().unwrap().keys() {
            let mut v = request();
            v.as_object_mut().unwrap().remove(key);
            assert!(Request::parse(&v).is_err(), "{key}");
        }
        for (key, value) in [
            ("depth_index", json!(8)),
            ("frequency_index", json!(3)),
            ("focus_index", json!(7)),
            ("low_power_mode", json!(4)),
            ("logic_compile_version", json!(4294967296u64)),
            ("logic_compile_version", json!(1.5)),
            ("disable_low_power", json!(0)),
            ("state_policy", json!("remembered")),
            ("register_order", json!("native")),
            ("harmonic", json!(true)),
        ] {
            let mut v = request();
            v[key] = value;
            assert!(Request::parse(&v).is_err(), "{key}");
        }
    }
    #[test]
    fn bounded_packet_envelopes_keep_count_metadata_trailers_and_zero_padding() {
        let p = packet(5, 8, &[7; 32]).unwrap();
        assert_eq!(p.len(), 512);
        assert_eq!(p::word(&p, 4), 0x00800005);
        assert_eq!(&p[48..56], &c::words([5, 0xa5a55a5a]));
        assert!(p[56..].iter().all(|v| *v == 0));
        let p = packet(6, 0, &vec![9; 1024]).unwrap();
        assert_eq!(p.len(), 1536);
        assert_eq!(&p[1040..1048], &c::words([6, 0xa5a55a5a]));
        for (kind, meta, raw) in [
            (2, 0, vec![]),
            (8, 4096, vec![0; 4]),
            (256, 0, vec![0; 4]),
            (5, 0, vec![0; 3]),
            (6, 0, vec![0; 16388]),
        ] {
            assert!(packet(kind, meta, &raw).is_err());
        }
        assert!(registers(&[(1, 2); 62]).is_err());
    }
    #[test]
    fn full_synthetic_bundle_materializes13_families_and_distinguishes_activation_voltage_and_controls()
     {
        let b = Bundle::build(inputs(), Request::parse(&request()).unwrap()).unwrap();
        let report = b.report();
        assert_eq!(report["packets"].as_array().unwrap().len(), 13);
        assert_eq!(report["usb_accessed"], false);
        assert_eq!(report["complete_configuration"], false);
        assert_eq!(report["executable_plan"], false);
        assert_eq!(report["listing_is_execution_order"], false);
        assert_eq!(report["ScanCtrl"]["nodes"], 194);
        let names: Vec<_> = b.packets.iter().map(|p| p.name).collect();
        assert_eq!(
            names,
            [
                "probe-index-activation",
                "deduplicated-registers",
                "TX16",
                "RX-ADC8",
                "B-LPF",
                "B-IQ",
                "Up4",
                "HV-SW",
                "ATGC",
                "Apo",
                "ApoComp",
                "ScanCtrl",
                "voltage-state"
            ]
        );
        let regs = crate::convex_command::inspect(&b.packets[1].bytes).unwrap();
        let pairs = regs.opaque_pairs;
        let keys: Vec<_> = pairs.iter().map(|p| p.words[0]).collect();
        assert!(keys.windows(2).all(|w| w[0] < w[1]));
        assert!(pairs.iter().any(|p| p.words == [0x60017, 1000]));
        assert!(pairs.iter().any(|p| p.words == [0x60018, 324 << 16 | 2064]));
        assert!(
            pairs
                .iter()
                .all(|p| p.words[0] != 0x60001 && p.words[0] != 0x50060 && p.words[0] != 0x70034)
        );
        let voltage = crate::convex_command::inspect(&b.packets[12].bytes).unwrap();
        assert_eq!(voltage.opaque_pairs[0].words, [0x70034, 0]);
        assert_eq!(voltage.opaque_pairs[2].words, [0x70034, 0x10]);
        assert_eq!(b.packets[0].kind, 100);
        assert_eq!(b.packets[0].wire, 2);
        for p in &b.packets {
            assert!(p.bytes.len().is_multiple_of(512));
            assert_eq!(p::word(&p.bytes, 0), 0x5a5aa5a5);
        }
    }
    #[test]
    fn producer_build_rejects_overflow_and_branch_mismatches_before_any_transport_exists() {
        for case in 0..8 {
            let mut f = inputs();
            match case {
                0 => put(f.raw.get_mut("A_Probe.bin").unwrap(), 0, f32::NAN.to_bits()),
                1 => put(f.raw.get_mut("A_Probe.bin").unwrap(), 0x14, 1),
                2 => put(f.raw.get_mut("A_Probe.bin").unwrap(), 0x3c, 4),
                3 => put(f.raw.get_mut("A_BF.bin").unwrap(), 12, 256),
                4 => put(f.raw.get_mut("B_PRF.bin").unwrap(), 4 + 32 * 5, 16),
                5 => put(f.raw.get_mut("B_PRF.bin").unwrap(), 4 + 32 * 2, 100000),
                6 => put(f.raw.get_mut("B_TxControl.bin").unwrap(), 0, 65536),
                _ => put(
                    f.raw.get_mut("B_DynamicFilter.bin").unwrap(),
                    0xa834 + 4,
                    256,
                ),
            }
            assert!(
                Bundle::build(f, Request::parse(&request()).unwrap()).is_err(),
                "case{case}"
            );
        }
    }
    #[test]
    fn public_loader_rejects_unknown_twelve_file_group_and_symlink_without_exporting_payloads() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "SYNTHETIC-convex-bundle-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        let input = inputs();
        for (n, b) in &input.raw {
            std::fs::write(path.join(n), b).unwrap();
        }
        assert!(
            Bundle::load(&path, &path, Request::parse(&request()).unwrap())
                .err()
                .unwrap()
                .contains("complete known")
        );
        std::fs::remove_file(path.join("A_BF.bin")).unwrap();
        std::os::unix::fs::symlink(path.join("A_Probe.bin"), path.join("A_BF.bin")).unwrap();
        assert!(Bundle::load(&path, &path, Request::parse(&request()).unwrap()).is_err());
        std::fs::remove_dir_all(path).unwrap();
    }
}

#[cfg(test)]
mod selection_tests {
    use super::*;
    #[test]
    fn live_selection_requires_exact_explicit_b_scope_without_declared_logic() {
        let valid = tests::prepared().selection;
        validate_selection(&valid).unwrap();
        for key in valid.as_object().unwrap().keys() {
            let mut v = valid.clone();
            v.as_object_mut().unwrap().remove(key);
            assert!(validate_selection(&v).is_err());
        }
        for (key, value) in [
            ("logic_compile_version", json!(0)),
            ("low_power_mode", json!(0)),
            ("depth_index", json!(8)),
            ("frequency_index", json!(3)),
            ("focus_index", json!(7)),
            ("disable_low_power", json!(0)),
            ("state_policy", json!("resume")),
        ] {
            let mut v = valid.clone();
            v[key] = value;
            assert!(validate_selection(&v).is_err());
        }
    }
}
