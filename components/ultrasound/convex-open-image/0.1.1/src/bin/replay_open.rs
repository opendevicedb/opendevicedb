// SPDX-License-Identifier: AGPL-3.0-or-later
mod capture;
use probe_open_image::{Display, HEIGHT, OpenSession, WIDTH, manifest};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}
fn run(input: &Path, out: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if out.exists() {
        return Err("Output directory must be new".into());
    }
    // Snapshot and verify ALL declared DATA before creating a result or feeding the engine.
    let captured = capture::snapshot(input)?;
    let cfg = Display::default();
    let mut session = OpenSession::new(cfg)?;
    fs::create_dir(out)?;
    let mut audit = json!({"schema":"odb-native-replay/1","state":"processing","input":captured.audit,
        "images":0,"commands_executed":0,"calibrated":false,"error":null});
    write_new(
        &out.join("replay.json"),
        &serde_json::to_vec_pretty(&audit)?,
    )?;
    let mut rows = Vec::new();
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let mut save =
            |frames: Vec<odb_convex_decoder::RgbaFrame>| -> Result<(), Box<dyn std::error::Error>> {
                for f in frames {
                    let name = format!("{:06}.png", f.sequence);
                    let png = odb_convex_decoder::encode_rgba_png(WIDTH, HEIGHT, &f.rgba)?;
                    write_new(&out.join(&name), &png)?;
                    rows.push(json!({"sequence":f.sequence,"file":name,"sha256":format!("{:x}",Sha256::digest(&png)),"rgba_sha256":format!("{:x}",Sha256::digest(&f.rgba))}));
                }
                Ok(())
            };
        for bytes in &captured.reads {
            save(session.push(bytes)?)?;
        }
        save(session.finish()?)?;
        write_new(&out.join("images.json"), &serde_json::to_vec_pretty(&rows)?)?;
        write_new(
            &out.join("profile.json"),
            &serde_json::to_vec_pretty(&manifest(cfg)?)?,
        )?;
        Ok(())
    })();
    audit["images"] = json!(rows.len());
    audit["state"] = json!(if result.is_ok() {
        "completed"
    } else {
        "failed"
    });
    if let Err(error) = &result {
        audit["error"] = json!(error.to_string());
    }
    // A crash leaves processing/invalid JSON rather than promoting a prefix to completion.
    fs::write(out.join("replay.json"), serde_json::to_vec_pretty(&audit)?)?;
    result?;
    println!(
        "{} images; verified declared DATA snapshot; no configuration or USB",
        rows.len()
    );
    Ok(())
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let a: Vec<_> = env::args().skip(1).collect();
    if a.len() != 2 {
        return Err("Usage: replay_open archived-capture new-output-dir".into());
    }
    run(Path::new(&a[0]), Path::new(&a[1]))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_snapshot_creates_no_output_and_existing_results_are_preserved() {
        let root = std::env::temp_dir().join(format!("odb-native-result-{}", std::process::id()));
        fs::create_dir(&root).unwrap();
        let data = root.join("capture/receive/data");
        fs::create_dir_all(&data).unwrap();
        fs::write(data.join("00001.bin"), [1u8, 2, 3]).unwrap();
        let mut v = json!({"synthetic":true,"schema_version":"probe-receive-v1","state":"cancelled","reads_requested":2,"received_bytes":3,
            "plan":{"profile":"convex-01","channel":"data","endpoint":134,"transfer_type":"bulk","requested_bytes":16384},
            "passive_profile":{"profile":"convex-01","vid_pid":"04b4:4611","profile_match":true},
            "reads":[{"ordinal":1,"expected_raw_file":"00001.bin","raw_file":"00001.bin","state":"received","code":0,"requested_bytes":16384,"received_bytes":3,"sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]});
        fs::write(data.join("manifest.json"), serde_json::to_vec(&v).unwrap()).unwrap();
        let output = root.join("result");
        assert!(run(&root.join("capture"), &output).is_err());
        assert!(!output.exists());
        v["reads"][0]["sha256"] = json!(format!("{:x}", Sha256::digest([1u8, 2, 3])));
        fs::write(data.join("manifest.json"), serde_json::to_vec(&v).unwrap()).unwrap();
        run(&root.join("capture"), &output).unwrap();
        let before = fs::read(output.join("replay.json")).unwrap();
        let audit: serde_json::Value = serde_json::from_slice(&before).unwrap();
        assert_eq!(audit["state"], "completed");
        assert_eq!(audit["images"], 0);
        assert_eq!(audit["input"]["received_bytes"], 3);
        assert!(run(&root.join("capture"), &output).is_err());
        assert_eq!(before, fs::read(output.join("replay.json")).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
