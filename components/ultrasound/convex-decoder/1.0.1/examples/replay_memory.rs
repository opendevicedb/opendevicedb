// SPDX-License-Identifier: AGPL-3.0-or-later
//! Offline host for the SAME library compiled into decoder.wasm. No USB or networking.
use odb_convex_decoder::{Session, resources::ResourceStore};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{env, fs, path::Path};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args().skip(1).collect();
    if !(3..=4).contains(&args.len()) {
        return Err(
            "Usage: replay_memory input.json receive-data output-dir [bootstrap.bin]".into(),
        );
    }
    let input: Value = serde_json::from_slice(&fs::read(&args[0])?)?;
    let files: ResourceStore = serde_json::from_value(input["files"].clone())?;
    let mut session = if input["purpose"] == "reconstruction" {
        Session::reconstruction(&input, &files)?
    } else {
        Session::new(&input, &files)?
    };
    let output = Path::new(&args[2]);
    fs::create_dir(output)?;
    if args.len() == 4 {
        fs::write(
            output.join("commands.json"),
            serde_json::to_vec_pretty(&session.bind(&fs::read(&args[3])?)?)?,
        )?;
    }
    let data = Path::new(&args[1]);
    let manifest: Value = serde_json::from_slice(&fs::read(data.join("manifest.json"))?)?;
    let mut images = Vec::new();
    let mut save =
        |frames: Vec<odb_convex_decoder::Frame>| -> Result<(), Box<dyn std::error::Error>> {
            for frame in frames {
                let name = format!("{:06}.png", frame.sequence);
                fs::write(output.join(&name), &frame.png)?;
                images.push(json!({"sequence":frame.sequence,"file":name,"sha256":format!("{:x}",Sha256::digest(&frame.png))}));
            }
            Ok(())
        };
    for row in manifest["reads"].as_array().ok_or("Missing reads")? {
        let name = row["raw_file"].as_str().ok_or("Missing read filename")?;
        // Host fixture paths must remain simple local filenames.
        if Path::new(name).components().count() != 1 {
            return Err("Invalid fixture filename".into());
        }
        save(session.push(&fs::read(data.join(name))?)?)?;
    }
    save(session.finish()?)?;
    fs::write(
        output.join("images.json"),
        serde_json::to_vec_pretty(&images)?,
    )?;
    println!("{} frames from archived DATA; no USB access", images.len());
    Ok(())
}
