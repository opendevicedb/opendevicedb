use odb_convex_decoder::{ImageProfile, Result};
use serde_json::Value;
include!("../profile/packets.rs");

macro_rules! image {
    ($depth:literal) => {
        include_bytes!(concat!("../profile/image-", $depth, ".json")).as_slice()
    };
}
const IMAGES: [&[u8]; 8] = [
    image!(0),
    image!(1),
    image!(2),
    image!(3),
    image!(4),
    image!(5),
    image!(6),
    image!(7),
];

pub fn image(depth: u8) -> Result<ImageProfile> {
    let data = IMAGES.get(usize::from(depth)).ok_or("Unknown profile")?;
    let value: Value = serde_json::from_slice(data).map_err(|e| e.to_string())?;
    fn bytes<const N: usize>(v: &Value) -> Result<[u8; N]> {
        let values: Vec<u8> = serde_json::from_value(v.clone()).map_err(|e| e.to_string())?;
        values
            .try_into()
            .map_err(|_| "Invalid byte table length".into())
    }
    fn floats<const N: usize>(v: &Value) -> Result<[f32; N]> {
        let values: Vec<u32> = serde_json::from_value(v.clone()).map_err(|e| e.to_string())?;
        let bits: [u32; N] = values
            .try_into()
            .map_err(|_| "Invalid float table length")?;
        Ok(bits.map(f32::from_bits))
    }
    let scalar = |key: &str| {
        serde_json::from_value::<u32>(value[key].clone())
            .map(f32::from_bits)
            .map_err(|e| e.to_string())
    };
    let count =
        |key: &str| serde_json::from_value::<usize>(value[key].clone()).map_err(|e| e.to_string());
    Ok(ImageProfile {
        settings: value["settings"].clone(),
        bfsp_coefficients: floats(&value["bfsp_coefficients_bits"])?,
        bfsp_downsample: count("bfsp_downsample")?,
        dtgc_tgc: floats(&value["dtgc_tgc_bits"])?,
        dtgc_depth: scalar("dtgc_depth_bits")?,
        dtgc_gain: scalar("dtgc_gain_bits")?,
        dtgc_dr: scalar("dtgc_dr_bits")?,
        compound_window: count("compound_window")?,
        compound_coef0: scalar("compound_coef0_bits")?,
        compound_threshold_a: scalar("compound_threshold_a_bits")?,
        compound_threshold_b: scalar("compound_threshold_b_bits")?,
        temporal_correlation: scalar("temporal_correlation_bits")?,
        dsc_parameters: bytes(&value["dsc_parameters"])?,
        display_map: bytes(&value["display_map"])?,
    })
}
