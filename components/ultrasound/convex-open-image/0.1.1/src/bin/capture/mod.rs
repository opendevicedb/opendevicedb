// SPDX-License-Identifier: AGPL-3.0-or-later
//! Native host boundary only: immutable owned DATA snapshot before image evaluation.
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Read,
    path::Path,
};

type Result<T> = std::result::Result<T, String>;
const TRANSFER: u64 = 16_384;
const MAX_READS: u64 = 10_000;
const MAX_MANIFEST: u64 = 16 * 1024 * 1024;

pub struct Capture {
    pub reads: Vec<Vec<u8>>,
    pub audit: Value,
}

fn regular_bytes(path: &Path, maximum: u64) -> Result<Vec<u8>> {
    if !fs::symlink_metadata(path)
        .map_err(|e| e.to_string())?
        .is_file()
    {
        return Err("Capture input must be a regular file, not a symlink or device".into());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options.open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > maximum {
        return Err("Capture file exceeds its bound or is not regular".into());
    }
    let mut bytes = Vec::new();
    file.take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > maximum || bytes.len() as u64 != metadata.len() {
        return Err("Capture file grew, shrank or exceeded its bound while reading".into());
    }
    Ok(bytes)
}

fn unsigned(value: &Value, name: &str) -> Result<u64> {
    value
        .as_u64()
        .ok_or_else(|| format!("Missing/invalid {name}"))
}

fn memory_seal(v: &Value, count: u64, rows: usize, state: &str) -> Result<()> {
    let b = &v["batch"];
    if b["first_ordinal"] != 1
        || b["last_ordinal"] != count
        || b["persisted_reads"] != rows
        || b["maximum_retained_buffer_capacity_bytes"] != 2 * count * TRANSFER
    {
        return Err("Memory reservation/persisted prefix mismatch".into());
    }
    if state == "prepared" && rows == 0 {
        if b["authorization_durable"] != false
            || b["sealed"] != false
            || !b["attempted_reads"].is_null()
            || v["received_bytes"] != 0
        {
            return Err("Prepared memory journal claims outcomes".into());
        }
        return Ok(());
    }
    let unattempted = if rows as u64 == count {
        Value::Null
    } else {
        json!(rows + 1)
    };
    if b["sealed"] != true
        || b["authorization_durable"] != true
        || b["attempted_reads"] != rows
        || b["unattempted_from"] != unattempted
        || b["retained_buffer_capacity_bytes"]
            .as_u64()
            .is_none_or(|n| n > 2 * count * TRANSFER)
        || v["finished_unix_ms"].as_u64().is_none()
    {
        return Err(
            "Unsealed memory journal or unknown attempted suffix; continuity not established"
                .into(),
        );
    }
    Ok(())
}

/// A bounded declared host prefix, not an attestation of loss-free device acquisition.
pub fn snapshot(capture: &Path) -> Result<Capture> {
    let root = capture.canonicalize().map_err(|e| e.to_string())?;
    for directory in [root.join("receive"), root.join("receive/data")] {
        if !fs::symlink_metadata(directory)
            .map_err(|e| e.to_string())?
            .is_dir()
        {
            return Err("Receive directories must be real directories".into());
        }
    }
    let root = root.join("receive/data");
    let manifest = regular_bytes(&root.join("manifest.json"), MAX_MANIFEST)?;
    let v: Value = serde_json::from_slice(&manifest).map_err(|e| e.to_string())?;
    let schema = v["schema_version"]
        .as_str()
        .ok_or("Missing receive schema")?;
    if !["probe-receive-v1", "probe-receive-memory-v1"].contains(&schema)
        || v["plan"]["profile"] != "convex-01"
        || v["plan"]["channel"] != "data"
        || v["plan"]["endpoint"] != 0x86
        || v["plan"]["transfer_type"] != "bulk"
        || v["plan"]["requested_bytes"] != TRANSFER
        || v["passive_profile"]["profile"] != "convex-01"
        || v["passive_profile"]["vid_pid"] != "04b4:4611"
        || v["passive_profile"]["profile_match"] != true
    {
        return Err("Require the declared UC5-2S convex DATA86/16384 receive profile".into());
    }
    let requested = unsigned(&v["reads_requested"], "read budget")?;
    let rows = v["reads"].as_array().ok_or("Missing receive rows")?;
    let state = v["state"].as_str().ok_or("Missing receive state")?;
    if !(1..=MAX_READS).contains(&requested)
        || rows.len() as u64 > requested
        || !["prepared", "cancelled", "read_budget_exhausted"].contains(&state)
        || (state == "prepared" && !rows.is_empty())
        || (state == "read_budget_exhausted" && rows.len() as u64 != requested)
        || (schema == "probe-receive-memory-v1"
            && state == "cancelled"
            && rows.len() as u64 == requested)
    {
        return Err(
            "Unknown, failed or nonterminal receive outcome; no continuous replay admitted".into(),
        );
    }
    if schema == "probe-receive-memory-v1" {
        memory_seal(&v, requested, rows.len(), state)?;
    }
    let mut reads = Vec::with_capacity(rows.len());
    let mut total = 0u64;
    let mut stream = Sha256::new();
    let mut cancelled_before_io = None;
    for (index, row) in rows.iter().enumerate() {
        let ordinal = index + 1;
        let name = format!("{ordinal:05}.bin");
        if row["state"] == "cancelled_before_io" {
            if schema != "probe-receive-v1"
                || state != "cancelled"
                || ordinal != rows.len()
                || row["ordinal"] != ordinal
                || row["requested_bytes"] != TRANSFER
                || row["expected_raw_file"] != name
                || !row["raw_file"].is_null()
                || !row["received_bytes"].is_null()
                || !row["code"].is_null()
                || !row["sha256"].is_null()
            {
                return Err(
                    "Only a final, result-free per-read cancellation before I/O is admissible"
                        .into(),
                );
            }
            // This is an explicit no-I/O intent, not an unknown transfer or payload.
            cancelled_before_io = Some(ordinal);
            continue;
        }
        let n = unsigned(&row["received_bytes"], "received length")?;
        let code = match row["state"].as_str() {
            Some("received") => 0,
            Some("timeout") => -7,
            _ => {
                return Err(format!(
                    "Read{ordinal}: unknown/error outcome; never join across a gap"
                ));
            }
        };
        let hash = row["sha256"].as_str().ok_or("Missing DATA SHA256")?;
        if row["ordinal"] != ordinal
            || row["requested_bytes"] != TRANSFER
            || row["raw_file"] != name
            || row["expected_raw_file"] != name
            || row["code"] != code
            || n > TRANSFER
            || hash.len() != 64
            || !hash
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(format!(
                "Read{ordinal}: ordinal, filename, code, length or hash mismatch"
            ));
        }
        let bytes = regular_bytes(&root.join(&name), n)?;
        if bytes.len() as u64 != n || format!("{:x}", Sha256::digest(&bytes)) != hash {
            return Err(format!("Read{ordinal}: stored DATA length/SHA256 mismatch"));
        }
        total += n;
        stream.update(&bytes);
        reads.push(bytes);
    }
    if v["received_bytes"] != total {
        return Err("Receive byte total mismatch".into());
    }
    let data_reads = reads.len();
    Ok(Capture {
        reads,
        audit: json!({"schema":"odb-native-DATA-snapshot/1",
        "source_schema":schema,"source_state":state,"manifest_sha256":format!("{:x}",Sha256::digest(&manifest)),
        "DATA_sha256":format!("{:x}",stream.finalize()),"received_bytes":total,"journal_rows":rows.len(),
        "DATA_reads":data_reads,"cancelled_before_io_ordinal":cancelled_before_io,
        "snapshot":"owned immutable byte arrays verified before image evaluation",
        "max_DATA_bytes":MAX_READS*TRANSFER,"manifest_byte_limit":MAX_MANIFEST,
        "timeout_prefixes_preserved":true,"device_identity_attested":false,
        "wire_loss_free":false,"physical_capture_complete":false}),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    struct Fixture {
        root: std::path::PathBuf,
        value: Value,
    }
    impl Fixture {
        fn new(memory: bool) -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let root = std::env::temp_dir().join(format!(
                "odb-native-capture-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(root.join("receive/data")).unwrap();
            let mut rows = Vec::new();
            for (index, bytes) in [vec![], vec![1u8, 2, 3], vec![4u8, 5]]
                .into_iter()
                .enumerate()
            {
                let name = format!("{:05}.bin", index + 1);
                fs::write(root.join("receive/data").join(&name), &bytes).unwrap();
                let timeout = index != 1;
                rows.push(json!({"ordinal":index+1,"state":if timeout{"timeout"}else{"received"},"code":if timeout{-7}else{0},"requested_bytes":TRANSFER,"received_bytes":bytes.len(),"raw_file":name,"expected_raw_file":name,"sha256":format!("{:x}",Sha256::digest(&bytes))}));
            }
            let value = json!({"schema_version":if memory{"probe-receive-memory-v1"}else{"probe-receive-v1"},"state":"cancelled","reads_requested":4,"received_bytes":5,"finished_unix_ms":1,
                "plan":{"profile":"convex-01","channel":"data","endpoint":134,"transfer_type":"bulk","requested_bytes":TRANSFER},
                "passive_profile":{"profile":"convex-01","vid_pid":"04b4:4611","profile_match":true},"reads":rows,
                "batch":{"first_ordinal":1,"last_ordinal":4,"persisted_reads":3,"maximum_retained_buffer_capacity_bytes":8*TRANSFER,"sealed":true,"authorization_durable":true,"attempted_reads":3,"unattempted_from":4,"retained_buffer_capacity_bytes":2*TRANSFER}});
            Self { root, value }
        }
        fn load(&self) -> Result<Capture> {
            fs::write(
                self.root.join("receive/data/manifest.json"),
                serde_json::to_vec(&self.value).unwrap(),
            )
            .unwrap();
            snapshot(&self.root)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    #[test]
    fn both_journals_preserve_empty_and_partial_timeout_bytes_in_owned_snapshot() {
        for memory in [false, true] {
            let f = Fixture::new(memory);
            let captured = f.load().unwrap();
            assert_eq!(captured.reads, [vec![], vec![1, 2, 3], vec![4, 5]]);
            fs::write(f.root.join("receive/data/00002.bin"), b"changed").unwrap();
            assert_eq!(captured.reads[1], [1, 2, 3]);
            assert_eq!(captured.audit["received_bytes"], 5);
            assert_eq!(captured.audit["physical_capture_complete"], false);
        }
    }
    #[test]
    fn explicit_terminal_no_io_is_not_a_gap_and_orphan_files_are_not_consumed() {
        let mut f = Fixture::new(false);
        let intent = json!({"ordinal":4,"state":"cancelled_before_io","expected_raw_file":"00004.bin","requested_bytes":TRANSFER,"raw_file":null,"received_bytes":null,"sha256":null});
        f.value["reads"].as_array_mut().unwrap().push(intent);
        fs::write(f.root.join("receive/data/00004.bin"), [99u8]).unwrap();
        let result = f.load().unwrap();
        assert_eq!(result.reads.len(), 3);
        assert_eq!(result.audit["received_bytes"], 5);
        assert_eq!(result.audit["cancelled_before_io_ordinal"], 4);
        f.value["reads"][3]["received_bytes"] = json!(1);
        assert!(f.load().is_err());
        f.value["reads"][3]["received_bytes"] = Value::Null;
        f.value["reads"][2]["state"] = json!("cancelled_before_io");
        assert!(f.load().is_err());
    }
    #[test]
    fn hash_length_profile_ordinals_and_unknown_outcomes_are_rejected() {
        for mutation in 0..13 {
            let mut f = Fixture::new(false);
            match mutation {
                0 => f.value["reads"][1]["sha256"] = json!("0".repeat(64)),
                1 => f.value["reads"][1]["received_bytes"] = json!(2),
                2 => f.value["reads"][1]["ordinal"] = json!(1),
                3 => f.value["reads"][1]["raw_file"] = json!("../outside"),
                4 => f.value["plan"]["endpoint"] = json!(0x88),
                5 => f.value["reads"][1]["state"] = json!("in_flight"),
                6 => f.value["reads"][1]["code"] = json!(-1),
                7 => f.value["received_bytes"] = json!(6),
                8 => f.value["state"] = json!("in_progress"),
                9 => f.value["state"] = json!("failed"),
                10 => f.value["reads_requested"] = json!(10_001),
                11 => f.value["passive_profile"]["profile_match"] = json!(false),
                _ => f.value["reads"][1]["sha256"] = json!("A".repeat(64)),
            }
            assert!(f.load().is_err(), "mutation{mutation}");
        }
    }
    #[test]
    fn memory_requires_a_consistent_durable_seal_without_unknown_suffix() {
        for mutation in 0..8 {
            let mut f = Fixture::new(true);
            match mutation {
                0 => f.value["batch"]["sealed"] = json!(false),
                1 => f.value["batch"]["authorization_durable"] = json!(false),
                2 => f.value["batch"]["attempted_reads"] = json!(4),
                3 => f.value["batch"]["persisted_reads"] = json!(2),
                4 => f.value["batch"]["unattempted_from"] = Value::Null,
                5 => f.value["batch"]["first_ordinal"] = json!(0),
                6 => f.value["batch"]["retained_buffer_capacity_bytes"] = json!(9 * TRANSFER),
                _ => f.value["finished_unix_ms"] = Value::Null,
            }
            assert!(f.load().is_err(), "seal mutation{mutation}");
        }
    }
    #[cfg(unix)]
    #[test]
    fn source_symlinks_and_nonregular_inputs_are_never_read() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new(false);
        f.load().unwrap();
        let raw = f.root.join("receive/data/00002.bin");
        fs::remove_file(&raw).unwrap();
        symlink("00003.bin", &raw).unwrap();
        assert!(f.load().is_err());
        fs::remove_file(&raw).unwrap();
        fs::create_dir(&raw).unwrap();
        assert!(f.load().is_err());
        fs::remove_dir(&raw).unwrap();
        fs::write(&raw, [1, 2, 3]).unwrap();
        let data = f.root.join("receive/data");
        fs::rename(&data, f.root.join("receive/other")).unwrap();
        symlink("other", &data).unwrap();
        assert!(snapshot(&f.root).is_err());
    }
}
