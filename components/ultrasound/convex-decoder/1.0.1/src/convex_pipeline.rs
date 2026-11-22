// SPDX-License-Identifier: AGPL-3.0-or-later
//! Stateful General convex CPU engine. Immutable resources; explicit backing
//! creation/resumption, attempted-call scheduling and retained failure state.
use crate::{
    Result, archive, convex_bfsp as bfsp, convex_compound as compound, convex_dsc as dsc,
    convex_dtgc as dtgc, convex_lifecycle as lifecycle, convex_sri as sri,
    convex_sri_plan as sri_plan, linear_dsp::read_regular, rgba_png,
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, fs, path::Path};

#[derive(Clone, Copy)]
pub struct Settings {
    pub bfsp: bfsp::Settings,
    pub dtgc: dtgc::Settings,
    pub enhancement: usize,
    pub correlation: usize,
    pub dsc: dsc::Settings,
    pub max_groups: usize,
}
fn exact_keys(v: &Value, keys: &[&str]) -> Result<()> {
    let o = v.as_object().ok_or("Require settings object")?;
    if o.len() != keys.len() || o.keys().any(|k| !keys.contains(&k.as_str())) {
        return Err("Require exact convex pipeline keys; no defaults".into());
    }
    Ok(())
}
impl Settings {
    pub fn parse(v: &Value) -> Result<Self> {
        exact_keys(
            v,
            &["schema_version", "bfsp", "dtgc", "sri", "dsc", "max_groups"],
        )?;
        exact_keys(&v["sri"], &["enhancement", "correlation_index"])?;
        if v["schema_version"] != "convex-pipeline-settings-v1" {
            return Err("Require convex-pipeline-settings-v1".into());
        }
        let bfsp = bfsp::Settings::from_json(&v["bfsp"])?;
        let dtgc = dtgc::Settings::from_json(&v["dtgc"])?;
        let dsc = dsc::Settings::parse(&v["dsc"])?;
        let s = sri_plan::Settings::from_json(&json!({"schema_version":"convex-sri-settings-v1",
            "depth_index":bfsp.depth,"enhancement":v["sri"]["enhancement"],
            "correlation_index":v["sri"]["correlation_index"],"frame_count_before":0}))?;
        let max_groups = v["max_groups"]
            .as_u64()
            .filter(|n| (1..=128).contains(n))
            .ok_or("max_groups must be1..128")? as usize;
        if dsc.depth != bfsp.depth {
            return Err("BFSP and DSC depths must match".into());
        }
        Ok(Self {
            bfsp,
            dtgc,
            enhancement: s.enhancement,
            correlation: s.correlation,
            dsc,
            max_groups,
        })
    }
    pub fn json(self) -> Value {
        json!({"schema_version":"convex-pipeline-settings-v1","bfsp":self.bfsp.json(),
            "dtgc":self.dtgc.json(),"sri":{"enhancement":self.enhancement,"correlation_index":self.correlation},
            "dsc":self.dsc.json(),"max_groups":self.max_groups})
    }
}
pub struct Resources {
    bfsp: bfsp::Assets,
    plan: bfsp::Plan,
    dtgc: dtgc::Processor,
    compound: compound::Processor,
    sri: [sri::Processor; 3],
    dsc: dsc::Plan,
    settings: Settings,
    provenance: Value,
    identity: String,
}
impl Resources {
    pub(crate) fn selected(&self) -> Result<crate::ImageProfile> {
        if self.settings.enhancement != 0 {
            return Err("Only no-enhancement selected profiles supported".into());
        }
        let (bfsp_coefficients, bfsp_downsample) = self.bfsp.selected();
        let (dtgc_tgc, dtgc_depth, dtgc_gain, dtgc_dr) = self.dtgc.selected();
        let (compound_window, compound_coef0, compound_threshold_a, compound_threshold_b) =
            self.compound.selected();
        let temporal_correlation = f32::from_bits(
            self.sri[1].plan().recipe["effective_mask_correlation_bits"]
                .as_u64()
                .ok_or("Missing temporal correlation")? as u32,
        );
        Ok(crate::ImageProfile {
            settings: self.settings.json(),
            bfsp_coefficients,
            bfsp_downsample,
            dtgc_tgc,
            dtgc_depth,
            dtgc_gain,
            dtgc_dr,
            compound_window,
            compound_coef0,
            compound_threshold_a,
            compound_threshold_b,
            temporal_correlation,
            dsc_parameters: self
                .dsc
                .parameters
                .clone()
                .try_into()
                .map_err(|_| "DSC parameter shape")?,
            display_map: self
                .dsc
                .map
                .clone()
                .try_into()
                .map_err(|_| "DSC map shape")?,
        })
    }
    pub(crate) fn from_selected(settings: Settings, profile: crate::ImageProfile) -> Result<Self> {
        if settings.enhancement != 0
            || settings.json() != Settings::parse(&profile.settings)?.json()
        {
            return Err("Selected image profile and settings mismatch".into());
        }
        let bfsp = bfsp::Assets::from_selected(
            settings.bfsp,
            profile.bfsp_coefficients,
            profile.bfsp_downsample,
        )?;
        let plan = bfsp.plan(settings.bfsp)?;
        let dtgc = dtgc::Processor::from_selected(
            profile.dtgc_tgc,
            profile.dtgc_depth,
            profile.dtgc_gain,
            profile.dtgc_dr,
        )?;
        let compound = compound::Processor::from_selected(
            profile.compound_window,
            profile.compound_coef0,
            profile.compound_threshold_a,
            profile.compound_threshold_b,
        )?;
        let sri = [
            sri::Processor::no_enhancement(profile.temporal_correlation, 0)?,
            sri::Processor::no_enhancement(profile.temporal_correlation, 1)?,
            sri::Processor::no_enhancement(profile.temporal_correlation, 2)?,
        ];
        let dsc =
            dsc::Plan::from_selected(settings.dsc, profile.dsc_parameters, profile.display_map)?;
        let provenance = json!({"policy":"selected-memory-profile-v1","parameters_sha256":archive::sha(&serde_json::to_vec(&profile.json()).unwrap())});
        let identity = archive::sha(&serde_json::to_vec(&provenance).unwrap());
        Ok(Self {
            bfsp,
            plan,
            dtgc,
            compound,
            sri,
            dsc,
            settings,
            provenance,
            identity,
        })
    }

    pub fn plan(&self) -> bfsp::Plan {
        self.plan
    }
    pub fn settings(&self) -> Settings {
        self.settings
    }
    pub fn provenance(&self) -> &Value {
        &self.provenance
    }
    pub fn identity(&self) -> &str {
        &self.identity
    }
    pub fn load(
        assets: &Path,
        sri_resources: &Path,
        maps: &Path,
        settings: Settings,
        custom: Option<&[u8]>,
    ) -> Result<Self> {
        Self::from_source(
            &crate::resources::Files(assets),
            &crate::resources::Files(sri_resources),
            &crate::resources::Files(maps),
            settings,
            custom,
            crate::Palette::Reference,
        )
    }
    pub fn from_source(
        assets: &dyn crate::resources::Source,
        sri_resources: &dyn crate::resources::Source,
        maps: &dyn crate::resources::Source,
        settings: Settings,
        custom: Option<&[u8]>,
        palette: crate::Palette,
    ) -> Result<Self> {
        // Revalidate programmatic callers too.
        let settings = Settings::parse(&settings.json())?;
        let bfsp = bfsp::Assets::from_source(assets, settings.bfsp)?;
        let plan = bfsp.plan(settings.bfsp)?;
        let dtgc = dtgc::Processor::from_source(assets, settings.bfsp, settings.dtgc)?;
        let compound = compound::Processor::from_source(assets, settings.bfsp, settings.dtgc)?;
        let load = |frame_count| {
            sri::Processor::from_source(
                assets,
                sri_resources,
                sri_plan::Settings {
                    depth: settings.bfsp.depth,
                    enhancement: settings.enhancement,
                    correlation: settings.correlation,
                    frame_count,
                },
            )
        };
        let sri = [load(0)?, load(1)?, load(2)?];
        let dsc = dsc::Plan::from_source(assets, maps, settings.dsc, custom, palette)?;
        let provenance = json!({"bfsp":bfsp.provenance(),"bfsp_plan":plan.json(),"dtgc":dtgc.provenance(),
            "compound":compound.provenance(),"sri":sri[0].provenance,"dsc":dsc.provenance,
            "settings":settings.json(),"custom_gray_sha256":custom.map(archive::sha),
            "policy":"immutable-General-CPU-resources-v1","NE_enabled":false,"ThreeLine_enabled":false});
        let identity = archive::sha(&serde_json::to_vec(&provenance).unwrap());
        Ok(Self {
            bfsp,
            plan,
            dtgc,
            compound,
            sri,
            dsc,
            settings,
            provenance,
            identity,
        })
    }
}
pub struct State {
    pub bfsp: bfsp::State,
    pub dtgc: Vec<u8>,
    pub compound: compound::State,
    pub sri: sri::State,
    pub host: lifecycle::State,
    pub attempts: u64,
    pub poisoned: bool,
    pub initialization: String,
}
fn sri_layout() -> Vec<(String, usize)> {
    let v: Value = serde_json::from_str(include_str!("known_convex_sri_layout.json")).unwrap();
    v["images"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| {
            let slot =
                u16::from_str_radix(i["slot"].as_str().unwrap().trim_start_matches("0x"), 16)
                    .unwrap();
            (
                format!("{slot:04x}.u8"),
                i["General_bytes"].as_u64().unwrap() as usize,
            )
        })
        .collect()
}
impl State {
    /// Deliberate initialization of OUR CPU memory, never a native cold-start claim.
    pub fn cpu_zeroed(plan: bfsp::Plan) -> Result<Self> {
        let compound = compound::State::from_bytes(
            &json!({"schema_version":"convex-compound-state-v1",
            "history_initialized":false,"rdh_write_policy":compound::POLICY}),
            std::array::from_fn(|_| vec![0; compound::BYTES]),
        )?;
        let sri = sri::State::from_bytes(
            &json!({"schema_version":"convex-sri-state-v1","policy":sri::POLICY,
            "frame_count":0,"bound_mask_correlation_bits":0}),
            sri_layout().iter().map(|(_, n)| vec![0; *n]).collect(),
        )?;
        Ok(Self {
            bfsp: bfsp::State::from_bytes(
                plan,
                vec![0; plan.raw_bytes()],
                vec![0; plan.up_bytes()],
                vec![0; plan.reshape_bytes()],
            )?,
            dtgc: vec![0; dtgc::IMAGE_BYTES],
            compound,
            sri,
            host: lifecycle::State {
                frame_count: 0,
                dirty: true,
                bound_mask_correlation: 0.,
            },
            attempts: 0,
            poisoned: false,
            initialization: "cpu-zeroed-v1".into(),
        })
    }
    pub fn software_freeze(&mut self) -> Value {
        let before = self.host.json();
        self.host.software_freeze();
        self.sri.frame_count = 0;
        self.compound.initialized = false;
        json!({"event":"software_Freeze","before":before,"after":self.host.json(),
            "compound_initialized_after":false,"backings_cleared":false,"acoustic_command_sent":false,
            "policy":"explicit-CPU-history-boundary-v1"})
    }
    fn files(&self) -> Vec<(String, Vec<u8>)> {
        let mut files = vec![
            ("bfsp-raw.bin".into(), self.bfsp.raw.clone()),
            ("bfsp-up4.u16le".into(), self.bfsp.up4.clone()),
            ("bfsp-reshape.f32le".into(), self.bfsp.reshaped_bytes()),
            ("dtgc.u8".into(), self.dtgc.clone()),
        ];
        files.extend(
            self.compound
                .files()
                .iter()
                .map(|(n, b)| (format!("compound-{n}"), b.to_vec())),
        );
        files.extend(
            self.sri
                .files()
                .iter()
                .map(|(n, b)| (format!("sri-{n}"), b.to_vec())),
        );
        files
    }
    pub fn save(&self, directory: &Path, resources: &Resources) -> Result<Value> {
        fs::create_dir(directory)
            .map_err(|e| format!("New pipeline state directory required: {e}"))?;
        let mut rows = Vec::new();
        for (name, bytes) in self.files() {
            archive::write_new(&directory.join(&name), &bytes)?;
            rows.push(json!({"file":name,"bytes":bytes.len(),"sha256":archive::sha(&bytes)}));
        }
        let meta = json!({"schema_version":"convex-pipeline-state-v1","resource_identity":resources.identity,
            "host":self.host.json(),"compound":self.compound.metadata(),"sri":self.sri.metadata(),
            "attempts":self.attempts,"poisoned":self.poisoned,"initialization":self.initialization,"files":rows});
        archive::write_new(
            &directory.join("state.json"),
            &serde_json::to_vec_pretty(&meta).unwrap(),
        )?;
        fs::File::open(directory)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(meta)
    }
    pub fn load(directory: &Path, resources: &Resources) -> Result<Self> {
        let meta: Value =
            serde_json::from_slice(&read_regular(&directory.join("state.json"), 32768)?)
                .map_err(|e| e.to_string())?;
        exact_keys(
            &meta,
            &[
                "schema_version",
                "resource_identity",
                "host",
                "compound",
                "sri",
                "attempts",
                "poisoned",
                "initialization",
                "files",
            ],
        )?;
        if meta["schema_version"] != "convex-pipeline-state-v1"
            || meta["resource_identity"] != resources.identity
            || meta["poisoned"] != false
        {
            return Err(
                "State schema/resources mismatch or incomplete CPU state; no implicit recovery"
                    .into(),
            );
        }
        exact_keys(
            &meta["host"],
            &["frame_count", "dirty", "bound_mask_correlation_bits"],
        )?;
        let mut expected = vec![
            ("bfsp-raw.bin".into(), resources.plan.raw_bytes()),
            ("bfsp-up4.u16le".into(), resources.plan.up_bytes()),
            ("bfsp-reshape.f32le".into(), resources.plan.reshape_bytes()),
            ("dtgc.u8".into(), dtgc::IMAGE_BYTES),
        ];
        expected.extend(
            compound::STATE_FILES
                .iter()
                .map(|n| (format!("compound-{n}"), compound::BYTES)),
        );
        expected.extend(sri_layout().iter().map(|(n, b)| (format!("sri-{n}"), *b)));
        let rows = meta["files"]
            .as_array()
            .filter(|r| r.len() == expected.len())
            .ok_or("Require complete51-file state index")?;
        let mut files = BTreeMap::new();
        for (name, size) in &expected {
            let matches: Vec<_> = rows.iter().filter(|r| r["file"] == *name).collect();
            if matches.len() != 1 {
                return Err("Duplicate/missing pipeline state file".into());
            }
            let raw = read_regular(&directory.join(name), *size as u64)?;
            if raw.len() != *size
                || matches[0]["bytes"] != *size
                || matches[0]["sha256"] != archive::sha(&raw)
            {
                return Err(format!("Pipeline state file changed: {name}"));
            }
            files.insert(name.clone(), raw);
        }
        let bfsp = bfsp::State::from_bytes(
            resources.plan,
            files.remove("bfsp-raw.bin").unwrap(),
            files.remove("bfsp-up4.u16le").unwrap(),
            files.remove("bfsp-reshape.f32le").unwrap(),
        )?;
        let dtgc = files.remove("dtgc.u8").unwrap();
        let compound = compound::State::from_bytes(
            &meta["compound"],
            std::array::from_fn(|i| {
                files
                    .remove(&format!("compound-{}", compound::STATE_FILES[i]))
                    .unwrap()
            }),
        )?;
        let sri = sri::State::from_bytes(
            &meta["sri"],
            sri_layout()
                .iter()
                .map(|(n, _)| files.remove(&format!("sri-{n}")).unwrap())
                .collect(),
        )?;
        let dirty = meta["host"]["dirty"]
            .as_bool()
            .ok_or("Explicit dirty flag required")?;
        if meta["host"]["frame_count"] != sri.frame_count
            || meta["host"]["bound_mask_correlation_bits"] != sri.bound_mask_correlation.to_bits()
        {
            return Err("Host/SRI state mismatch".into());
        }
        let host = lifecycle::State {
            frame_count: sri.frame_count,
            dirty,
            bound_mask_correlation: sri.bound_mask_correlation,
        };
        host.validate()?;
        let attempts = meta["attempts"]
            .as_u64()
            .ok_or("Explicit attempts required")?;
        let initialization = meta["initialization"]
            .as_str()
            .filter(|s| ["cpu-zeroed-v1", "caller-explicit-v1"].contains(s))
            .ok_or("Unknown state initialization policy")?
            .to_string();
        Ok(Self {
            bfsp,
            dtgc,
            compound,
            sri,
            host,
            attempts,
            poisoned: false,
            initialization,
        })
    }
}
pub struct Engine {
    resources: Resources,
    pub state: State,
}
pub struct Output {
    pub attempt: lifecycle::Attempt,
    pub png: Option<Vec<u8>>,
    pub rgba: Option<Vec<u8>>,
    pub interp: Option<Vec<u8>>,
    pub compound_outside: Option<Vec<u8>>,
    pub stages: Vec<Value>,
}
impl Engine {
    pub fn resources(&self) -> &Resources {
        &self.resources
    }
    pub fn new(resources: Resources, state: State) -> Result<Self> {
        state.host.validate()?;
        bfsp::State::from_bytes(
            resources.plan,
            state.bfsp.raw.clone(),
            state.bfsp.up4.clone(),
            state.bfsp.reshaped_bytes(),
        )?;
        if state.poisoned
            || state.dtgc.len() != dtgc::IMAGE_BYTES
            || state.sri.frame_count != state.host.frame_count
            || state.sri.bound_mask_correlation.to_bits()
                != state.host.bound_mask_correlation.to_bits()
        {
            return Err("Incomplete or inconsistent pipeline state".into());
        }
        // Public backing fields must also be valid before beginning Update.
        compound::State::from_bytes(
            &state.compound.metadata(),
            std::array::from_fn(|i| state.compound.files()[i].1.to_vec()),
        )?;
        Ok(Self { resources, state })
    }
    /// Typed B_mode boundary: exact size rejection occurs AFTER Update. Header
    /// admission is the caller's distinct audit, not a fabricated native return.
    pub fn process(&mut self, lines: &[u8], phase: u8) -> Result<Output> {
        self.process_output(lines, phase, true, true)
    }
    pub(crate) fn process_rgba(&mut self, lines: &[u8], phase: u8) -> Result<Output> {
        self.process_output(lines, phase, false, true)
    }
    pub(crate) fn update_only(&mut self, lines: &[u8], phase: u8) -> Result<Output> {
        self.process_output(lines, phase, false, false)
    }
    fn process_output(
        &mut self,
        lines: &[u8],
        phase: u8,
        encode_png: bool,
        render: bool,
    ) -> Result<Output> {
        if self.state.poisoned {
            return Err("CPU pipeline poisoned; preserve snapshot and explicitly recreate".into());
        }
        // State is public for explicit preparation/checkpointing. Reject any
        // caller damage before Update rather than slicing a shortened backing.
        self.state.host.validate()?;
        self.state.bfsp.validate(self.resources.plan)?;
        self.state.compound.validate()?;
        if self.state.dtgc.len() != dtgc::IMAGE_BYTES
            || self.state.sri.frame_count != self.state.host.frame_count
            || self.state.sri.bound_mask_correlation.to_bits()
                != self.state.host.bound_mask_correlation.to_bits()
        {
            return Err("Caller changed pipeline state inconsistently; attempt not started".into());
        }
        let before = self.state.host;
        let count = before.frame_count;
        let selected = f32::from_bits(
            self.resources.sri[1].plan().recipe["effective_mask_correlation_bits"]
                .as_u64()
                .unwrap() as u32,
        );
        self.state.attempts = self
            .state
            .attempts
            .checked_add(1)
            .ok_or("Attempt count overflow")?;
        let mut png = None;
        let mut rgba = None;
        let mut interp = None;
        let mut outside = None;
        let mut stages = Vec::new();
        let r = &self.resources;
        let state = &mut self.state;
        let attempt = lifecycle::run(&mut state.host, selected, false, |stage| {
            match stage {
                lifecycle::Stage::Bfsp => {
                    if lines.len() != r.plan.input_bytes() {
                        return Ok(-91);
                    }
                    state.bfsp.raw[..lines.len()].copy_from_slice(lines);
                    r.bfsp.process(r.plan, &mut state.bfsp, phase)?;
                    stages.push(json!({"operation":"BFSP/preprocess","reshape_sha256":archive::diagnostic_sha(&state.bfsp.reshaped_bytes())}));
                    state.dtgc = r.dtgc.process(&state.bfsp.reshaped_bytes(), &state.dtgc)?;
                    stages
                        .push(json!({"operation":"BFSP/DTGC","sha256":archive::diagnostic_sha(&state.dtgc)}));
                    let out = r.compound.process(&state.dtgc, &state.compound)?;
                    state.compound = out.state;
                    outside = Some(out.rdh_outside_native);
                    stages.push(json!({"operation":"BFSP/compound","output_sha256":archive::diagnostic_sha(&state.compound.output),
                        "rdh_sha256":archive::diagnostic_sha(&state.compound.rdh),"outside_trace_consumed":false}));
                }
                lifecycle::Stage::Sri => {
                    // Re-evaluate the numerical recipe from the saved PRE-Update
                    // scalar snapshot. This does NOT perform a second observable
                    // Update; lifecycle state already changed before BFSP.
                    let mut input = state.sri.clone();
                    input.frame_count = count;
                    input.bound_mask_correlation = before.bound_mask_correlation;
                    let out = if encode_png {
                        r.sri[count].process(&state.compound.output, &state.compound.rdh, &input)?
                    } else {
                        r.sri[count].process_live(
                            &state.compound.output,
                            &state.compound.rdh,
                            &input,
                        )?
                    };
                    stages.push(
                        json!({"operation":"SRI","stages":out.stages,"histogram":out.histogram,
                        "recipe":out.recipe,"scalar_adapter":"pre-Update-snapshot-v1"}),
                    );
                    state.sri = out.state;
                }
                lifecycle::Stage::Dsc => {
                    if !render {
                        return Ok(0);
                    }
                    let files = state.sri.files();
                    let input = files.iter().find(|(n, _)| n == "0548.u8").unwrap().1;
                    let out = r.dsc.process(input)?;
                    if encode_png {
                        png = Some(rgba_png::encode(
                            r.settings.dsc.width,
                            r.settings.dsc.height,
                            &out.output,
                        )?);
                    }
                    stages.push(json!({"operation":"DSC","rgba_sha256":archive::diagnostic_sha(&out.output)}));
                    rgba = Some(out.output);
                    interp = Some(out.interp);
                }
                lifecycle::Stage::Ne => return Err("NE outside General CPU domain".into()),
            }
            Ok(0)
        })?;
        // A failed BFSP attempt still advances host scalars; image state remains
        // exactly what the CPU stages actually completed, without rollback.
        state.sri.frame_count = state.host.frame_count;
        state.sri.bound_mask_correlation = state.host.bound_mask_correlation;
        state.poisoned = attempt.error.is_some();
        Ok(Output {
            attempt,
            png,
            rgba,
            interp,
            compound_outside: outside,
            stages,
        })
    }
}
