// SPDX-License-Identifier: AGPL-3.0-or-later
//! Explicit values consumed by one image setting. Contains no transport commands.
use serde_json::{Value, json};
#[derive(Clone)]
pub struct ImageProfile {
    pub settings: Value,
    pub bfsp_coefficients: [f32; 8],
    pub bfsp_downsample: usize,
    pub dtgc_tgc: [f32; 1024],
    pub dtgc_depth: f32,
    pub dtgc_gain: f32,
    pub dtgc_dr: f32,
    pub compound_window: usize,
    pub compound_coef0: f32,
    pub compound_threshold_a: f32,
    pub compound_threshold_b: f32,
    pub temporal_correlation: f32,
    pub dsc_parameters: [u8; 40],
    pub display_map: [u8; 1024],
}
impl ImageProfile {
    /// Integer bit patterns avoid decimal or JSON float rounding in profile tools.
    pub fn json(&self) -> Value {
        json!({"schema":"convex-selected-image-profile-v1","settings":self.settings,
            "bfsp_coefficients_bits":self.bfsp_coefficients.map(f32::to_bits).to_vec(),"bfsp_downsample":self.bfsp_downsample,
            "dtgc_tgc_bits":self.dtgc_tgc.map(f32::to_bits).to_vec(),"dtgc_depth_bits":self.dtgc_depth.to_bits(),
            "dtgc_gain_bits":self.dtgc_gain.to_bits(),"dtgc_dr_bits":self.dtgc_dr.to_bits(),
            "compound_window":self.compound_window,"compound_coef0_bits":self.compound_coef0.to_bits(),
            "compound_threshold_a_bits":self.compound_threshold_a.to_bits(),"compound_threshold_b_bits":self.compound_threshold_b.to_bits(),
            "temporal_correlation_bits":self.temporal_correlation.to_bits(),"dsc_parameters":self.dsc_parameters.to_vec(),
            "display_map":self.display_map.to_vec()})
    }
}
