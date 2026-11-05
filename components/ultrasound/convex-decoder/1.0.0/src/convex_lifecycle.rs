// SPDX-License-Identifier: AGPL-3.0-or-later
//! B_mode attempted-call scheduling, separate from CPU numerical policies.
//! Update precedes BFSP and its counter survives a subsequent failure.
use crate::Result;
use serde_json::{Value, json};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stage {
    Bfsp,
    Sri,
    Ne,
    Dsc,
}
impl Stage {
    pub fn name(self) -> &'static str {
        match self {
            Self::Bfsp => "BFSP",
            Self::Sri => "SRI",
            Self::Ne => "NE",
            Self::Dsc => "DSC",
        }
    }
}
#[derive(Clone, Copy, Debug)]
pub struct State {
    pub frame_count: usize,
    pub dirty: bool,
    pub bound_mask_correlation: f32,
}
impl State {
    pub fn json(self) -> Value {
        json!({"frame_count":self.frame_count,"dirty":self.dirty,
            "bound_mask_correlation_bits":self.bound_mask_correlation.to_bits()})
    }
    pub fn validate(self) -> Result<()> {
        if self.frame_count > 2
            || !self.bound_mask_correlation.is_finite()
            || !(0. ..=1.).contains(&self.bound_mask_correlation)
        {
            return Err("Invalid convex lifecycle counter/mask".into());
        }
        Ok(())
    }
    /// Native software message only. No buffer clear and no acoustic command.
    pub fn software_freeze(&mut self) {
        self.frame_count = 0;
    }
}
pub struct Attempt {
    pub native_status_candidate: Option<i32>,
    pub error: Option<String>,
    pub report: Value,
}
/// The callback executes sub-stages, with native-style return codes for the
/// documentary oracle. A Rust arithmetic error is distinct: no native code is
/// invented for it. Production uses successful CPU kernels or a size rejection.
pub fn run(
    state: &mut State,
    selected_correlation: f32,
    ne: bool,
    mut process: impl FnMut(Stage) -> Result<i32>,
) -> Result<Attempt> {
    state.validate()?;
    if !selected_correlation.is_finite() || !(0. ..=1.).contains(&selected_correlation) {
        return Err("Invalid selected convex correlation; attempt not started".into());
    }
    let before = *state;
    let update = state.dirty || state.frame_count < 2;
    let mut calls = Vec::new();
    if update {
        // The CPU backend has no failing OpenCL binding API. Only successful
        // Update binding semantics are implemented here; original API errors
        // are documentary native-oracle cases, not emulated GPU effects.
        if state.frame_count < 2 {
            state.bound_mask_correlation = if state.frame_count == 0 {
                0.
            } else {
                selected_correlation
            };
            state.frame_count += 1;
        }
        calls.push(json!({"call":"Update","state_after":state.json(),
            "policy":"successful-CPU-binding-v1"}));
        // Neither original Process nor Update clears dirty.
    }
    let mut status = None;
    let mut error = None;
    for stage in [Stage::Bfsp, Stage::Sri, Stage::Ne, Stage::Dsc] {
        if stage == Stage::Ne && !ne {
            continue;
        }
        match process(stage) {
            Ok(code) => {
                calls.push(json!({"call":stage.name(),"return":code}));
                if code != 0 {
                    status = Some(match stage {
                        Stage::Bfsp if code == -91 => -91,
                        Stage::Bfsp => -92,
                        Stage::Sri => -93,
                        Stage::Ne => -95,
                        Stage::Dsc => -94,
                    });
                    break;
                }
            }
            Err(e) => {
                calls.push(json!({"call":stage.name(),"port_error":e}));
                error = Some(e);
                break;
            }
        }
    }
    if status.is_none() && error.is_none() {
        status = Some(if state.frame_count == 1 { -100 } else { 0 });
    }
    let report = json!({"before":before.json(),"after":state.json(),"update_attempted":update,
        "calls":calls,"native_status_candidate":status,"port_error":error,
        "publish_candidate":status==Some(0),"warmup":status==Some(-100),
        "hardware_status_or_ACK":false,"gpu_execution":false});
    Ok(Attempt {
        native_status_candidate: status,
        error,
        report,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_first_attempt_advances_and_later_success_is_not_warmup() {
        let mut s = State {
            frame_count: 0,
            dirty: true,
            bound_mask_correlation: 0.7,
        };
        let a = run(&mut s, 0.5, false, |_| Ok(-91)).unwrap();
        assert_eq!(a.native_status_candidate, Some(-91));
        assert_eq!(s.frame_count, 1);
        assert_eq!(s.bound_mask_correlation, 0.);
        assert!(s.dirty);
        assert_eq!(
            run(&mut s, 0.5, false, |_| Ok(0))
                .unwrap()
                .native_status_candidate,
            Some(0)
        );
        assert_eq!(s.bound_mask_correlation, 0.5);
    }
    #[test]
    fn warmup_computes_all_stages_and_freeze_preserves_binding_and_dirty() {
        let mut s = State {
            frame_count: 0,
            dirty: false,
            bound_mask_correlation: 0.8,
        };
        let mut calls = Vec::new();
        let a = run(&mut s, 0.5, false, |v| {
            calls.push(v);
            Ok(0)
        })
        .unwrap();
        assert_eq!(calls, [Stage::Bfsp, Stage::Sri, Stage::Dsc]);
        assert_eq!(a.native_status_candidate, Some(-100));
        s.frame_count = 2;
        s.bound_mask_correlation = 0.75;
        let a = run(&mut s, 0.1, false, |_| Ok(0)).unwrap();
        assert_eq!(a.report["update_attempted"], false);
        assert_eq!(s.bound_mask_correlation, 0.75);
        s.software_freeze();
        assert_eq!(s.frame_count, 0);
        assert!(!s.dirty);
        assert_eq!(s.bound_mask_correlation, 0.75);
    }
    #[test]
    fn returns_map_at_first_failed_stage_without_later_calls() {
        for (failed, code, mapped) in [
            (Stage::Bfsp, -9, -92),
            (Stage::Sri, -7, -93),
            (Stage::Ne, 3, -95),
            (Stage::Dsc, 9, -94),
        ] {
            let mut s = State {
                frame_count: 2,
                dirty: true,
                bound_mask_correlation: 0.6,
            };
            let mut calls = Vec::new();
            let a = run(&mut s, 0.1, true, |v| {
                calls.push(v);
                Ok(if v == failed { code } else { 0 })
            })
            .unwrap();
            assert_eq!(calls.last(), Some(&failed));
            assert_eq!(a.native_status_candidate, Some(mapped));
            assert_eq!(s.bound_mask_correlation, 0.6);
        }
    }
    #[test]
    fn port_error_is_not_a_fabricated_native_status_and_update_survives() {
        let mut s = State {
            frame_count: 0,
            dirty: true,
            bound_mask_correlation: 0.6,
        };
        let a = run(&mut s, 0.1, false, |_| Err("CPU failure".into())).unwrap();
        assert_eq!(s.frame_count, 1);
        assert!(a.native_status_candidate.is_none());
        assert_eq!(a.error.as_deref(), Some("CPU failure"));
    }
}
