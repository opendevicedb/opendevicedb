// SPDX-License-Identifier: AGPL-3.0-or-later
//! General SRI parameter/binding/execution recipe. No image kernels execute here.
//! Derived tables/banks must remain private and are never embedded in this crate.
use crate::{Result, archive, linear_dsp::read_regular};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    path::Path,
};
const ASSETS: [(&str, usize, &str); 3] = [
    (
        "A_BF.bin",
        44,
        "28ed79893f9f224a7c1a29e2288491cb3bf224bbb3851d308c50e799b48dbdee",
    ),
    (
        "B_PRF.bin",
        388,
        "bf553725fc08bf50b6c4919ebc38d8cb8d648b8f03072a6d2da6fe32dcd84231",
    ),
    (
        "B_SRI.bin",
        352,
        "06822694c67a7c94168be168d86221301853e8ce8aba48c49fedd7b1cde2164b",
    ),
];
const RESOURCES: [(&str, usize, &str); 5] = [
    (
        "direction-base-225.f32le",
        900,
        "d3b36f851a8f2dbe0ee1ffffd154795abdf038f01947ce2fc9a8a2dc9bec67d9",
    ),
    (
        "direction-delta-200.f32le",
        800,
        "b2b0106e0ce2997b31674daa14dde0aaa03b9b58737e5197ecadcd436b5ffdb6",
    ),
    (
        "isotropic-iterations-1to3.f32le",
        24,
        "e8e95fdbb5c03a86b7cef320de6179837054e4eac52ef9fd7a4cd49c3da1293e",
    ),
    (
        "isotropic-fallback.f32le",
        8,
        "8ac3a611b819e18e9409f486739caa9bf6fb8d37957ca7b7dca75f2f774bc55a",
    ),
    (
        "correlation-default-9.f32le",
        36,
        "176d2008e9196bbdb706427f68cb07ff20fb7ae71550c2f7b4b5bf4834f5d1a2",
    ),
];
#[derive(Clone, Copy, Debug)]
pub struct Settings {
    pub depth: usize,
    pub enhancement: usize,
    pub correlation: usize,
    pub frame_count: usize,
}
impl Settings {
    pub fn from_json(v: &Value) -> Result<Self> {
        let keys = [
            "schema_version",
            "depth_index",
            "enhancement",
            "correlation_index",
            "frame_count_before",
        ];
        let o = v.as_object().ok_or("Require SRI settings object")?;
        if o.len() != keys.len()
            || o.keys().any(|s| !keys.contains(&s.as_str()))
            || v["schema_version"] != "convex-sri-settings-v1"
        {
            return Err("Require exact convex-sri-settings-v1 settings; no defaults".into());
        }
        let get = |key: &str| {
            v[key]
                .as_u64()
                .and_then(|n| usize::try_from(n).ok())
                .ok_or_else(|| format!("Invalid {key}"))
        };
        let s = Self {
            depth: get("depth_index")?,
            enhancement: get("enhancement")?,
            correlation: get("correlation_index")?,
            frame_count: get("frame_count_before")?,
        };
        s.validate()?;
        Ok(s)
    }
    fn validate(self) -> Result<()> {
        if self.depth >= 8 || self.enhancement > 8 || self.correlation > 8 || self.frame_count > 2 {
            return Err("Require depth0..7, enhancement/correlation0..8, frame_count0..2".into());
        }
        Ok(())
    }
    pub fn json(self) -> Value {
        json!({"schema_version":"convex-sri-settings-v1","depth_index":self.depth,"enhancement":self.enhancement,"correlation_index":self.correlation,"frame_count_before":self.frame_count})
    }
}
pub struct Plan {
    pub parameters: Vec<u8>,
    pub coarse: Vec<u8>,
    pub fine: Vec<u8>,
    pub dispatch: Vec<u8>,
    pub state_after_update: Vec<u8>,
    pub bindings: Value,
    pub recipe: Value,
    pub provenance: Value,
}
fn load_group(
    directory: &dyn crate::resources::Source,
    group: &[(&str, usize, &str)],
) -> Result<(Vec<Vec<u8>>, Vec<Value>)> {
    let mut files = Vec::new();
    let mut rows = Vec::new();
    for (name, size, expected) in group {
        let bytes = directory.read(name, *size as u64)?;
        if bytes.len() != *size || archive::sha(&bytes) != *expected {
            return Err(format!("Require complete known General SRI input {name}"));
        }
        rows.push(json!({"file":name,"bytes":size,"sha256":expected}));
        files.push(bytes);
    }
    Ok((files, rows))
}
fn word(raw: &[u8], i: usize) -> u32 {
    u32::from_le_bytes(raw[4 * i..4 * i + 4].try_into().unwrap())
}
fn floats(raw: &[u8]) -> Vec<f32> {
    raw.as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect()
}
fn bytes(values: &[f32]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}
fn slot(v: &str) -> usize {
    usize::from_str_radix(v.strip_prefix("0x").unwrap(), 16).unwrap()
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
impl Plan {
    pub(crate) fn no_enhancement(correlation: f32, frame_count: usize) -> Result<Self> {
        if !correlation.is_finite() || !(0.0..=1.0).contains(&correlation) || frame_count > 2 {
            return Err("Invalid temporal correlation or frame counter".into());
        }
        let count_after = (frame_count + 1).min(2);
        let effective = if frame_count == 0 { 0. } else { correlation };
        let bindings = json!([
            {"kernel_slot":"0x220","argument":0,"bytes":8,"value":{"kind":"image_or_buffer","source":"compound_output"}},
            {"kernel_slot":"0x220","argument":1,"bytes":8,"value":{"kind":"image_or_buffer","source":"0x308"}},
            {"kernel_slot":"0x510","argument":0,"bytes":8,"value":{"kind":"image_or_buffer","source":"0x350"}},
            {"kernel_slot":"0x510","argument":1,"bytes":8,"value":{"kind":"image_or_buffer","source":"0x538"}},
            {"kernel_slot":"0x510","argument":2,"bytes":8,"value":{"kind":"image_or_buffer","source":"0x530"}},
            {"kernel_slot":"0x510","argument":3,"bytes":8,"value":{"kind":"image_or_buffer","source":"0x548"}}
        ]);
        let recipe = json!({"N":1,"frame_count_before":frame_count,"frame_count_after_update":count_after,"effective_mask_correlation_bits":effective.to_bits(),"operations":[
            {"operation":"kernel","slot":"0x220","global":[128,320]},
            {"operation":"copy_image","source":"0x308","destination":"0x350","region":[128,320,1]},
            {"operation":"fill_image","destination":"0x530","color_f32_bits":if count_after>1 {correlation.to_bits()} else {0},"region":[64,160,1]},
            {"operation":"kernel","slot":"0x510","global":[128,320]},
            {"operation":"copy_image","source":"0x548","destination":"0x538","region":[128,320,1]},
            {"operation":"copy_image","source":"0x3b8","destination":"0x540","region":[64,160,1]}
        ]});
        Ok(Self {
            parameters: Vec::new(),
            coarse: Vec::new(),
            fine: Vec::new(),
            dispatch: Vec::new(),
            state_after_update: Vec::new(),
            bindings,
            recipe,
            provenance: json!({"policy":"no-enhancement-temporal-v1"}),
        })
    }

    pub fn load(assets: &Path, resources: &Path, settings: Settings) -> Result<Self> {
        Self::from_source(
            &crate::resources::Files(assets),
            &crate::resources::Files(resources),
            settings,
        )
    }
    pub fn from_source(
        assets: &dyn crate::resources::Source,
        resources: &dyn crate::resources::Source,
        settings: Settings,
    ) -> Result<Self> {
        settings.validate()?;
        if assets.exists("B_Persist.bin")? {
            return Err("Known General has no B_Persist; overrides unsupported".into());
        }
        let (a, asset_rows) = load_group(assets, &ASSETS)?;
        let (r, resource_rows) = load_group(resources, &RESOURCES)?;
        if word(&a[0], 1) != 4 || word(&a[0], 2) != 2 || word(&a[0], 3) != 128 {
            return Err("General BF profile differs from B4/m2/T128".into());
        }
        let mut p = Self::derive(&a[2], &r, settings)?;
        p.provenance = json!({"profile":"Plus-UC5-2S_16-General-B4-T128-m2-type8","assets":asset_rows,"resources":resource_rows,
            "B_Persist_present":false,"payload_embedded":false,"payload_copied_to_archive":false});
        Ok(p)
    }
    fn derive(raw: &[u8], r: &[Vec<u8>], settings: Settings) -> Result<Self> {
        settings.validate()?;
        if raw.len() != 352
            || r.len() != 5
            || r.iter().zip(RESOURCES).any(|(b, (_, n, _))| b.len() != n)
        {
            return Err("Invalid complete SRI parameter/resource lengths".into());
        }
        let i = settings.enhancement.saturating_sub(1);
        let f = |row: usize| f32::from_bits(word(raw, row * 8 + i));
        let int = |row: usize| word(raw, row * 8 + i);
        let coarse_iterations = int(2);
        let fine_iterations = int(7);
        let n = if settings.enhancement == 0 {
            1
        } else {
            word(raw, 80 + settings.depth)
        };
        if !(1..=4).contains(&n) || !(1..=3).contains(&coarse_iterations) || fine_iterations != 0 {
            return Err(
                "Unsupported General SRI branch; fine pass is inactive in the known group".into(),
            );
        }
        let scale = f(4) + f(4);
        let mix = 1. - f(8);
        let words = [
            if settings.enhancement == 0 {
                (-1.0_f32).to_bits()
            } else {
                ((word(raw, i) as i32 as f32) * 0.125).to_bits()
            },
            f(1).to_bits(),
            coarse_iterations,
            int(3),
            scale.to_bits(),
            f(5).to_bits(),
            f(6).to_bits(),
            fine_iterations,
            0,
            f(9).to_bits(),
            mix.to_bits(),
            n,
            64,
            0,
            word(&r[4], settings.correlation),
        ];
        for index in [0, 1, 4, 5, 6, 9, 10, 14] {
            if !f32::from_bits(words[index]).is_finite() {
                return Err("Nonfinite SRI parameter".into());
            }
        }
        let parameters: Vec<u8> = words.iter().flat_map(|v| v.to_le_bytes()).collect();
        let base = floats(&r[0]);
        let delta = floats(&r[1]);
        let isotropic = floats(&r[2]);
        let fallback = floats(&r[3]);
        if [&base, &delta, &isotropic, &fallback]
            .into_iter()
            .flatten()
            .any(|v| !v.is_finite())
        {
            return Err("Nonfinite SRI bank resource".into());
        }
        let bank = |iterations: u32| {
            let (side, center) = if (1..=3).contains(&iterations) {
                (
                    isotropic[3 + iterations as usize - 1],
                    isotropic[iterations as usize - 1],
                )
            } else {
                (fallback[0], fallback[1])
            };
            let mut values = base.clone();
            values[..25].fill(0.);
            for j in [7, 11, 13, 17] {
                values[j] = side;
            }
            values[12] = center;
            for j in 0..200 {
                values[j + 25] = base[j + 25] + delta[j] * scale;
            }
            bytes(&values)
        };
        let coarse = bank(coarse_iterations);
        let fine = bank(fine_iterations);
        let layout: Value =
            serde_json::from_str(include_str!("known_convex_sri_layout.json")).unwrap();
        let mut dims = BTreeMap::new();
        let mut dispatch = Vec::new();
        for address in (0x440..=0x500).step_by(16) {
            let v = &layout["dimensions_after_SetKernelArg"][format!("0x{address:x}")];
            let v = if v[0].is_array() {
                &v[n as usize - 1]
            } else {
                v
            };
            let d = [v[0].as_u64().unwrap(), v[1].as_u64().unwrap()];
            dims.insert(format!("0x{address:x}"), d);
            for value in d {
                dispatch.extend_from_slice(&value.to_le_bytes());
            }
        }
        let mut bindings = BTreeMap::new();
        for kernel in layout["kernels"].as_array().unwrap() {
            for arg in kernel["bound_arguments"].as_array().unwrap() {
                if arg["condition"] == "fine_iterations==0" && fine_iterations != 0 {
                    continue;
                }
                let source = arg["source"].as_str().unwrap();
                let length = arg["bytes"].as_u64().unwrap();
                let binding = if length == 8 {
                    let source = if source == "external_BFSP_image_pointer_reference" {
                        "compound_output"
                    } else if source == "external_BFSP_RDH_pointer_reference" {
                        "native_RDH64"
                    } else {
                        source
                            .strip_prefix("this+")
                            .ok_or("Unknown SRI pointer source")?
                    };
                    json!({"kind":"image_or_buffer","source":source})
                } else {
                    let value = if source == "address_of_local_zero_i32" {
                        vec![0; 4]
                    } else {
                        let offset = slot(
                            source
                                .strip_prefix("this+")
                                .ok_or("Unknown SRI scalar source")?,
                        );
                        if !(0x164..0x1a0).contains(&offset) {
                            return Err("Scalar source outside SRI parameter block".into());
                        }
                        parameters[offset - 0x164..offset - 0x164 + 4].to_vec()
                    };
                    json!({"kind":"scalar32","value_hex":hex(&value)})
                };
                let k = kernel["slot"].as_str().unwrap();
                let idx = arg["argument"].as_u64().unwrap();
                bindings.insert((k.to_string(),idx),json!({"kernel_slot":k,"kernel":kernel["name"],"argument":idx,"bytes":length,"value":binding}));
            }
        }
        // UpdataKernelArg forces mask correlation0 before the first frame only.
        let effective_correlation = if settings.frame_count == 0 {
            0
        } else {
            words[14]
        };
        bindings.get_mut(&("0x518".to_string(), 3)).unwrap()["value"]["value_hex"] =
            json!(hex(&effective_correlation.to_le_bytes()));
        let count_after = (settings.frame_count + 1).min(2) as u32;
        let state_after_update = [count_after.to_le_bytes(), words[14].to_le_bytes()].concat();
        let mut operations = vec![];
        let kernel = |operations: &mut Vec<Value>, address: usize| {
            let metadata = layout["kernels"]
                .as_array()
                .unwrap()
                .iter()
                .find(|v| v["slot"] == format!("0x{address:x}"))
                .unwrap();
            let global = if metadata["global_dimensions_slot"] == "runtime-final" {
                json!([128, 320 / n])
            } else {
                json!(dims[metadata["global_dimensions_slot"].as_str().unwrap()])
            };
            operations.push(json!({"operation":"kernel","slot":metadata["slot"],"name":metadata["name"],"global":global,"local":dims[metadata["local_dimensions_slot"].as_str().unwrap()],"dimensions":metadata["dimensions"]}));
        };
        let copy = |operations: &mut Vec<Value>, src: &str, dst: &str, region: [usize; 3]| {
            operations.push(
                json!({"operation":"copy_image","source":src,"destination":dst,"region":region}),
            )
        };
        kernel(&mut operations, 0x220);
        if settings.enhancement == 0 {
            copy(&mut operations, "0x308", "0x350", [128, 320, 1]);
        } else {
            kernel(&mut operations, 0x228);
            kernel(&mut operations, 0x230);
            if n == 1 {
                copy(&mut operations, "0x318", "0x328", [128, 320, 1]);
            } else {
                for addr in [0x238, 0x240, 0x248, 0x250] {
                    kernel(&mut operations, addr);
                }
            }
            for addr in [
                0x268, 0x270, 0x280, 0x288, 0x290, 0x298, 0x2a0, 0x2a8, 0x2b0,
            ] {
                kernel(&mut operations, addr);
            }
            for _ in 1..coarse_iterations {
                copy(&mut operations, "0x3b8", "0x3b0", [64, 160, 1]);
                kernel(&mut operations, 0x2b0);
            }
            for addr in [0x2b8, 0x2c0, 0x260] {
                kernel(&mut operations, addr);
            }
        }
        if settings.enhancement == 0 {
            operations.push(json!({"operation":"fill_image","destination":"0x530","color_f32_bits":if count_after>1 {words[14]} else {0},"region":[64,160,1]}));
        } else {
            kernel(&mut operations, 0x518);
            kernel(&mut operations, 0x520);
        }
        kernel(&mut operations, 0x510);
        copy(&mut operations, "0x548", "0x538", [128, 320, 1]);
        copy(&mut operations, "0x3b8", "0x540", [64, 160, 1]);
        let recipe = json!({"schema_version":"convex-sri-recipe-v1","settings":settings.json(),"parameters_native_slot_begin":"0x164","parameters_bytes":60,
            "coarse_iterations":coarse_iterations,"fine_iterations":fine_iterations,"N":n,"P":64,"images":layout["images"],"persistent_image_bytes":5038080,
            "dimensions":dims,"operations":operations,"bound_but_not_dispatched":["0x258","0x278"],
            "frame_count_before":settings.frame_count,"frame_count_after_update":count_after,"warmup":count_after<2,
            "effective_mask_correlation_bits":effective_correlation,"success_status_candidate":if count_after<2 {-100} else {0},
            "setparam_fill":{"destination":"0x548","color_f32_bits":0,"region":[128,320,1]},
            "numeric_policy":"binary32 separate multiply/add, no FMA; finite scalar resources only",
            "images_computed":false,"native_GPU_or_full_engine_equivalence":false,
            "limitations":["Prepared General plan only; no image kernels, backing state, raw grouping or acquisition executed",
                "Dormant HF outputs must retain supplied state in a future processor; no implicit recalculation or zeroing",
                "Native RDH64 must retain clamp-to-edge reads; outside-write diagnostic is not an image extension",
                "Frame counter and status are predictions for successful host calls, not observed device readiness",
                "Fresh SetParam resets count; provided frame_count forecasts a later update, not attested state continuity"]});
        Ok(Self {
            parameters,
            coarse,
            fine,
            dispatch,
            state_after_update,
            bindings: json!(bindings.into_values().collect::<Vec<_>>()),
            recipe,
            provenance: Value::Null,
        })
    }
}
/// Durable plan archive only. Every derived bank/parameter must remain ignored.
pub fn run(assets: &Path, resources: &Path, settings_file: &Path, output: &Path) -> Result<Value> {
    let settings_raw = read_regular(settings_file, 16384)?;
    let settings =
        Settings::from_json(&serde_json::from_slice(&settings_raw).map_err(|e| e.to_string())?)?;
    let plan = Plan::load(assets, resources, settings)?;
    fs::create_dir(output).map_err(|e| format!("New SRI plan directory required: {e}"))?;
    File::open(
        output
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new(".")),
    )
    .and_then(|f| f.sync_all())
    .map_err(|e| e.to_string())?;
    let mut manifest = json!({"schema":"probe-convex-sri-plan-v1","state":"in_progress","software":archive::source_provenance(),"settings":settings.json(),"provenance":plan.provenance,
        "inputs":[],"input_copies_complete":false,"results":[],"images_computed":false,"image_decoded":false,"acquisition_validated":false,"physical_calibration":null,"usb_accessed":false,"h4_validated":false,"gpu_equivalence_validated":false,
        "scope":"Complete known General host parameters, two directional banks, final bindings, dispatch and successful-call recipe; no image processing"});
    archive::checkpoint(output, &manifest)?;
    let operation = (|| -> Result<()> {
        archive::write_new(&output.join("settings.json"), &settings_raw)?;
        manifest["inputs"] = json!([{"file":"settings.json","bytes":settings_raw.len(),"sha256":archive::sha(&settings_raw)}]);
        manifest["input_copies_complete"] = json!(true);
        archive::checkpoint(output, &manifest)?;
        for (name, b) in [
            ("parameters.bin", plan.parameters),
            ("coarse.f32le", plan.coarse),
            ("fine.f32le", plan.fine),
            ("dispatch.u64le", plan.dispatch),
            ("state-after-update.bin", plan.state_after_update),
            (
                "bindings.json",
                serde_json::to_vec_pretty(&plan.bindings).unwrap(),
            ),
            (
                "recipe.json",
                serde_json::to_vec_pretty(&plan.recipe).unwrap(),
            ),
        ] {
            archive::write_new(&output.join(name), &b)?;
            manifest["results"]
                .as_array_mut()
                .unwrap()
                .push(json!({"file":name,"bytes":b.len(),"sha256":archive::sha(&b)}));
        }
        Ok(())
    })();
    match operation {
        Ok(()) => {
            manifest["state"] = json!("complete_unvalidated");
            archive::checkpoint(output, &manifest)?;
            Ok(manifest)
        }
        Err(error) => {
            manifest["state"] = json!("failed");
            manifest["error"] = json!(error);
            archive::checkpoint(output, &manifest)
                .map_err(|e| format!("{error}; checkpoint failed: {e}"))?;
            Err(error)
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn settings(e: usize, count: usize) -> Settings {
        Settings {
            depth: 0,
            enhancement: e,
            correlation: 0,
            frame_count: count,
        }
    }
    fn inputs() -> (Vec<u8>, Vec<Vec<u8>>) {
        let mut raw = vec![0; 352];
        for i in 0..8 {
            raw[64 + 4 * i..68 + 4 * i].copy_from_slice(&3_u32.to_le_bytes());
            raw[320 + 4 * i..324 + 4 * i].copy_from_slice(&3_u32.to_le_bytes());
        }
        let mut r: Vec<Vec<u8>> = RESOURCES.iter().map(|(_, n, _)| vec![0; *n]).collect();
        r[0] = bytes(&vec![1.; 225]);
        r[1] = bytes(&vec![0.25; 200]);
        (raw, r)
    }
    #[test]
    fn full_recipe_preserves_dormant_states_and_general_n3_tail() {
        let (raw, r) = inputs();
        let p = Plan::derive(&raw, &r, settings(8, 0)).unwrap();
        assert_eq!(p.recipe["N"], 3);
        assert_eq!(p.recipe["images"].as_array().unwrap().len(), 42);
        let ops = p.recipe["operations"].as_array().unwrap();
        assert!(
            !ops.iter()
                .any(|v| v["slot"] == "0x258" || v["slot"] == "0x278")
        );
        assert_eq!(ops.iter().filter(|v| v["slot"] == "0x2b0").count(), 3);
        assert_eq!(
            ops.iter().find(|v| v["slot"] == "0x260").unwrap()["global"],
            json!([128, 106])
        );
        assert_eq!(p.recipe["frame_count_after_update"], 1);
        assert_eq!(p.recipe["success_status_candidate"], -100);
    }
    #[test]
    fn zero_enhancement_keeps_host_copy_fill_and_warmup() {
        let (raw, r) = inputs();
        let p = Plan::derive(&raw, &r, settings(0, 1)).unwrap();
        assert_eq!(p.recipe["N"], 1);
        assert_eq!(p.recipe["success_status_candidate"], 0);
        let ops = p.recipe["operations"].as_array().unwrap();
        assert!(ops.iter().any(|v| v["operation"] == "fill_image"));
        assert!(!ops.iter().any(|v| v["slot"] == "0x290"));
    }
    #[test]
    fn exact_settings_and_resource_domains_are_required() {
        let mut v = settings(1, 0).json();
        v["extra"] = json!(1);
        assert!(Settings::from_json(&v).is_err());
        let (raw, mut r) = inputs();
        r[0][..4].copy_from_slice(&f32::NAN.to_le_bytes());
        assert!(Plan::derive(&raw, &r, settings(1, 0)).is_err());
        assert!(Plan::derive(&raw, &r, settings(9, 0)).is_err());
    }
}
