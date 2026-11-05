// SPDX-License-Identifier: AGPL-3.0-or-later
use probe_open_image::{Display, HEIGHT, OpenSession, WIDTH, manifest};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{env, fs, path::Path};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let a: Vec<_> = env::args().skip(1).collect();
    if a.len() != 2 {
        return Err("Usage: replay_open archived-capture new-output-dir".into());
    }
    let input = Path::new(&a[0]).join("receive/data");
    let out = Path::new(&a[1]);
    fs::create_dir(out)?;
    let cfg = Display::default();
    let mut session = OpenSession::new(cfg)?;
    let reads: Value = serde_json::from_slice(&fs::read(input.join("manifest.json"))?)?;
    let mut rows = Vec::new();
    let mut save =
        |frames: Vec<odb_convex_decoder::RgbaFrame>| -> Result<(), Box<dyn std::error::Error>> {
            for f in frames {
                let name = format!("{:06}.png", f.sequence);
                let png = odb_convex_decoder::encode_rgba_png(WIDTH, HEIGHT, &f.rgba)?;
                fs::write(out.join(&name), &png)?;
                rows.push(json!({"sequence":f.sequence,"file":name,"sha256":format!("{:x}",Sha256::digest(&png)),"rgba_sha256":format!("{:x}",Sha256::digest(&f.rgba))}));
            }
            Ok(())
        };
    for row in reads["reads"].as_array().ok_or("Missing read manifest")? {
        let name = row["raw_file"].as_str().ok_or("Missing raw filename")?;
        if Path::new(name).components().count() != 1 {
            return Err("Invalid raw filename".into());
        }
        save(session.push(&fs::read(input.join(name))?)?)?;
    }
    save(session.finish()?)?;
    fs::write(out.join("images.json"), serde_json::to_vec_pretty(&rows)?)?;
    fs::write(
        out.join("profile.json"),
        serde_json::to_vec_pretty(&manifest(cfg)?)?,
    )?;
    println!(
        "{} images; original generated display profile; no configuration or USB",
        rows.len()
    );
    Ok(())
}
