// SPDX-License-Identifier: AGPL-3.0-or-later
//! Normalize Cargo's host-dependent metadata for the two locked local crates.
//! Dependency metadata and every numerical/optimization/compiler option survive.
use std::{env, ffi::OsString, process::Command};

fn normalize(args: Vec<OsString>, version: &str) -> Vec<OsString> {
    let value = |key: &str| {
        args.windows(2)
            .find(|v| v[0] == key)
            .map(|v| v[1].to_string_lossy().into_owned())
    };
    let Some(name) = value("--crate-name") else {
        return args;
    };
    if !["odb_convex_decoder", "probe_open_image"].contains(&name.as_str()) {
        return args;
    }
    let target = value("--target").unwrap_or_else(|| "host".into());
    let mut cfg: Vec<_> = args
        .windows(2)
        .filter(|v| v[0] == "--cfg")
        .map(|v| v[1].to_string_lossy().into_owned())
        .collect();
    cfg.sort();
    let metadata = format!(
        "metadata=odb-locked-local-v1:{name}:{version}:{target}:{}",
        cfg.join(";")
    );
    let mut output = Vec::with_capacity(args.len() + 2);
    let mut i = 0;
    while i < args.len() {
        if args[i] == "-C"
            && args
                .get(i + 1)
                .is_some_and(|v| v.to_string_lossy().starts_with("metadata="))
        {
            i += 2;
        } else if args[i].to_string_lossy().starts_with("-Cmetadata=") {
            i += 1;
        } else {
            output.push(args[i].clone());
            i += 1;
        }
    }
    output.extend([OsString::from("-C"), metadata.into()]);
    output
}

fn main() {
    let mut args = env::args_os().skip(1);
    let compiler = args
        .next()
        .expect("RUSTC_WRAPPER requires the compiler path");
    let args = normalize(
        args.collect(),
        &env::var("CARGO_PKG_VERSION").unwrap_or_default(),
    );
    let status = Command::new(compiler)
        .args(args)
        .status()
        .expect("Cannot execute rustc");
    std::process::exit(status.code().unwrap_or(1));
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }
    #[test]
    fn compiler_queries_and_dependencies_are_untouched() {
        for input in [
            args(&["-vV"]),
            args(&["--crate-name", "serde_json", "-C", "metadata=original"]),
        ] {
            assert_eq!(normalize(input.clone(), "1"), input);
        }
    }
    #[test]
    fn host_metadata_differences_do_not_change_local_crate_identity() {
        let a = args(&[
            "--crate-name",
            "odb_convex_decoder",
            "-C",
            "metadata=aaa",
            "-Cmetadata=bbb",
        ]);
        let b = args(&["--crate-name", "odb_convex_decoder", "-C", "metadata=ccc"]);
        assert_eq!(normalize(a, "1.0.0"), normalize(b, "1.0.0"));
    }
    #[test]
    fn versions_targets_and_features_remain_distinct() {
        let base = args(&["--crate-name", "odb_convex_decoder"]);
        let plain = normalize(base.clone(), "1");
        assert_ne!(plain, normalize(base.clone(), "2"));
        for tail in [["--target", "wasm32-wasip1"], ["--cfg", "feature=\"ffi\""]] {
            let mut changed = base.clone();
            changed.extend(args(&tail));
            assert_ne!(plain.last(), normalize(changed, "1").last());
        }
    }
    #[test]
    fn numerical_options_paths_and_feature_order_survive() {
        let input = args(&[
            "--crate-name",
            "probe_open_image",
            "--cfg",
            "b",
            "--cfg",
            "a",
            "path with spaces/lib.rs",
            "-C",
            "opt-level=3",
            "-C",
            "codegen-units=1",
        ]);
        let output = normalize(input.clone(), "0.1.0");
        assert_eq!(&output[..input.len()], input);
        let mut reordered = input.clone();
        reordered.swap(3, 5);
        assert_eq!(output.last(), normalize(reordered, "0.1.0").last());
    }
}
