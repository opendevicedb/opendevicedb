// Refresh the eight offline snapshots from a locally supplied reference profile.
#[path = "../src/selected_values.rs"]
mod selected_values;
use odb_convex_decoder::{Session, resources::ResourceStore};
use serde_json::{Value, json};
use std::{env, fs, path::PathBuf};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args().skip(1).collect();
    if args.len() != 3 {
        return Err("Expected resource JSON, hardware status message, new output directory".into());
    }
    let files: ResourceStore = serde_json::from_slice(&fs::read(&args[0])?)?;
    let message = fs::read(&args[1])?;
    let expected = selected_values::binding_signature()?;
    let status = odb_convex_decoder::decode_message(&message)?;
    for (key, value) in expected.as_object().unwrap() {
        if status[key] != *value {
            return Err(format!("Incompatible status field {key}").into());
        }
    }
    let output = PathBuf::from(&args[2]);
    fs::create_dir(&output)?;
    let mut unique: Vec<(String, Vec<u8>)> = Vec::new();
    let mut rows = String::from("pub static PACKETS: &[&[(&str, &[u8])]] = &[\n");
    for depth in 0..8 {
        let mut configuration = selected_values::configuration()?;
        for path in [
            "/selection/depth_index",
            "/settings/bfsp/depth_index",
            "/settings/dsc/depth_index",
        ] {
            *configuration.pointer_mut(path).unwrap() = json!(depth);
        }
        let mut session = Session::new(&configuration, &files)?;
        let image = session.selected_image_profile()?.json();
        fs::write(
            output.join(format!("image-{depth}.json")),
            serde_json::to_vec(&image)?,
        )?;
        let bound = session.bind(&message)?;
        rows.push_str("    &[\n");
        for packet in bound["packets"]
            .as_array()
            .ok_or("Missing configuration packets")?
        {
            let name = packet["name"].as_str().ok_or("Missing packet name")?;
            let bytes: Vec<u8> = serde_json::from_value::<Vec<u8>>(Value::clone(&packet["bytes"]))?;
            let file = if let Some((file, _)) = unique.iter().find(|(_, b)| *b == bytes) {
                file.clone()
            } else {
                let file = format!("{name}-{depth}.bin");
                fs::write(output.join(&file), &bytes)?;
                unique.push((file.clone(), bytes));
                file
            };
            rows.push_str(&format!("        ({name:?}, include_bytes!({file:?})),\n"));
        }
        rows.push_str("    ],\n");
    }
    rows.push_str("];\n");
    fs::write(output.join("packets.rs"), rows)?;
    Ok(())
}
