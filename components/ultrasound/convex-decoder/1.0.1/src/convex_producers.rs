// SPDX-License-Identifier: AGPL-3.0-or-later
//! Pure selected TX16/ADC8, non-PA, fundamental B producers. No transport.
//! Host sequential binary32 is declared; native ARM numerical identity is unproven.
use crate::{
    Result,
    convex_parameters::{self as p, FundamentalWave},
};
use serde_json::{Value, json};
const SPEED: f32 = f32::from_bits(0x3fc5_1eb8);

pub(crate) fn integer(value: f64, name: &str) -> Result<i32> {
    let v = value.trunc();
    if !v.is_finite() || v < i32::MIN as f64 || v > i32::MAX as f64 {
        return Err(format!("{name}: nonfinite or signed32 conversion overflow"));
    }
    Ok(v as i32)
}
fn round_tx(value: f32) -> Result<i32> {
    integer(
        value as f64 + if value >= 0. { 0.5 } else { -0.5 },
        "TX rounding",
    )
}
pub(crate) fn half(lo: i64, hi: i64) -> Result<u32> {
    if !(0..=65535).contains(&lo) || !(0..=65535).contains(&hi) {
        return Err("Register half-word overflow".into());
    }
    Ok(lo as u32 | (hi as u32) << 16)
}
pub(crate) fn unsigned(v: i64) -> Result<u32> {
    u32::try_from(v).map_err(|_| "Unsigned register overflow".into())
}
pub(crate) fn words(values: impl IntoIterator<Item = u32>) -> Vec<u8> {
    values.into_iter().flat_map(u32::to_le_bytes).collect()
}
#[derive(Clone, Copy)]
pub(crate) struct Geometry {
    pub pitch: f32,
    pub radius: f32,
    pub offset: f32,
    pub clock: f32,
    pub ctrl_min: i32,
    pub hv_index: u8,
}
impl Geometry {
    pub fn parse(raw: &[u8]) -> Result<Self> {
        let probe = p::Probe::parse(raw)?;
        let g = Self {
            pitch: f32::from_bits(p::word(raw, 0)),
            radius: f32::from_bits(p::word(raw, 4)),
            offset: f32::from_bits(p::word(raw, 8)),
            clock: probe.clock_setting,
            ctrl_min: p::word(raw, 0x24) as i32,
            hv_index: (p::word(raw, 0x3c) & 255) as u8,
        };
        if [g.pitch, g.radius, g.offset].iter().any(|v| !v.is_finite())
            || g.pitch <= 0.
            || g.radius <= 0.
            || g.offset < 0.
            || g.ctrl_min <= 0
            || p::word(raw, 0x14) != 2
            || g.hv_index != 0
        {
            return Err(
                "Require finite positive convex geometry, reduction2, ctrlMin>0 and selected HV0"
                    .into(),
            );
        }
        Ok(g)
    }
}
pub(crate) struct TxSelection {
    pub lo: f32,
    pub hi: f32,
    pub aperture: u32,
    pub waveform: usize,
}
pub(crate) fn select_tx(
    raw: &[u8],
    g: Geometry,
    depth: usize,
    frequency: usize,
    focus: usize,
) -> Result<TxSelection> {
    p::exact(raw, 1024, "B_TxControl.bin")?;
    if depth > 7 || frequency > 2 || focus > 6 {
        return Err("TX selector out of bounds".into());
    }
    let base = 0x40 + 44 * depth;
    let at = |i| p::word(raw, base + 4 * i) as i32;
    let (lo, hi) = if focus == 6 {
        (at(6), at(7))
    } else {
        (at(focus), at(focus))
    };
    if lo < 0 || hi < lo {
        return Err("Negative/reversed TX focal interval".into());
    }
    // Aperture selection compares Fend for focus6, before adding Probe.offset.
    let compare = hi as f32;
    let threshold = |i| p::word(raw, 0x1a0 + 16 * i + 4 * (3 - frequency)) as i32;
    let mut bank = 7;
    for i in 0..7 {
        let a = threshold(i);
        let b = threshold(i + 1);
        if a < 0 || b < 0 {
            return Err("Negative TX aperture threshold".into());
        }
        if compare <= a as f32 {
            bank = i;
            break;
        }
        if a != 0 && compare <= b as f32 {
            bank = i + 1;
            break;
        }
    }
    let aperture = p::word(raw, 0x1a0 + 16 * bank);
    let waveform = usize::try_from(at(10 - frequency)).map_err(|_| "Negative waveform selector")?;
    if aperture > 32 || waveform > 15 {
        return Err("Aperture/waveform outside selected TX16 branch".into());
    }
    Ok(TxSelection {
        lo: lo as f32 + g.offset,
        hi: hi as f32 + g.offset,
        aperture,
        waveform,
    })
}
pub(crate) struct Tx {
    pub payload: Vec<u8>,
    pub gates: [(u32, u32); 3],
    pub report: Value,
}
fn aperture_mask(a: u32) -> Result<u32> {
    match a {
        0 => Ok(0),
        32 => Ok(u32::MAX),
        1..=31 => Ok(((1u32 << a) - 1) << ((32 - a).div_ceil(2))),
        _ => Err("Aperture must be0..32".into()),
    }
}
pub(crate) fn tx(raw: &[u8], g: Geometry, s: &TxSelection, wave: FundamentalWave) -> Result<Tx> {
    let mut q = [0i32; 16];
    for (i, out) in q.iter_mut().enumerate() {
        let pos = i as f32 - 7.5;
        let f =
            s.lo.max(s.hi / (s.aperture as f32 * 0.5).max(1.) * ((pos.abs() + 1.).trunc()));
        let r = g.radius + f;
        let distance = (g.radius * g.radius + r * r
            - ((pos * g.pitch) / g.radius).cos() * (g.radius + g.radius) * r)
            .sqrt();
        let x = ((f - distance) * g.clock) / SPEED;
        // Assembly confirms f64 +/-0.5 after binary32 geometry, unlike RX.
        *out = round_tx(x)?;
    }
    let qmin = *q.iter().min().unwrap() as i64;
    let qmax = *q.iter().max().unwrap() as i64;
    let w = i32::try_from(wave.delay_setting()).map_err(|_| "TX delay setting exceeds signed32")?
        as i64;
    let h = w / 2;
    let t = (h + 3 - qmin.min(0)) / 4 + 1;
    let mask = aperture_mask(s.aperture)?;
    let mut payload = Vec::with_capacity(32);
    let mut delays = Vec::new();
    for (i, v) in q.iter().enumerate() {
        let d = 4 * t - h + *v as i64;
        if !(0..=32767).contains(&d) {
            return Err("TX delay exceeds15bits".into());
        }
        delays.push(d);
        let encoded = d as u16 | (((mask >> (23 - i)) & 1) as u16) << 15;
        payload.extend_from_slice(&encoded.to_le_bytes());
    }
    let a = p::word(raw, 0) as i32 as i64;
    let b = p::word(raw, 4) as i32 as i64;
    let c = p::word(raw, 8) as i32 as i64;
    let v = t + (qmax + h + 3) / 4 + 1;
    let gates = [
        (0x60012, half(a, b)?),
        (0x60014, half(b, v)?),
        (0x60016, half(b + t, b + t + c)?),
    ];
    Ok(Tx {
        payload,
        gates,
        report: json!({"delay_min":delays.iter().min(),"delay_max":delays.iter().max(),
        "raw_q_min":qmin,"raw_q_max":qmax,"t":t,"aperture_setting":s.aperture,
        "focal_interval_setting":[s.lo,s.hi],"physical_units_validated":false}),
    })
}
pub(crate) fn rx(g: Geometry) -> Result<Vec<u8>> {
    let mut tables = [[[0u32; 2]; 24]; 8];
    for (i, table) in tables.iter_mut().enumerate() {
        let spacing = if i < 4 { 0.5 } else { 1. };
        let group = [1.5, 0.5, -0.5, -1.5][i % 4];
        for (j, pair) in table.iter_mut().enumerate() {
            let theta = ((j as f32 - 11.5 + group * spacing) * g.pitch) / g.radius;
            let a = (g.radius + g.radius) * (1. - theta.cos());
            let z = a * g.radius;
            let v = ((g.clock + g.clock) * a) / SPEED;
            let c1 = integer((v + if v >= 0. { 0.5 } else { -0.5 }) as f64, "RX C1")?;
            let c1 = i16::try_from(c1).map_err(|_| "RX C1 exceeds signed16")?;
            let ratio = g.clock / SPEED;
            let c2 = integer(((ratio * ratio) * z + 0.5) as f64, "RX C2")?;
            *pair = [c1 as i32 as u32, c2 as u32];
        }
    }
    let mut result = Vec::with_capacity(1024);
    for pos in (8..16).chain(16..20).chain(4..8).chain(0..4).chain(20..24) {
        for table in &tables[..4] {
            result.extend(words(table[pos]));
        }
    }
    for pos in 8..16 {
        for table in &tables[4..] {
            result.extend(words(table[pos]));
        }
    }
    Ok(result)
}
pub(crate) struct Filters {
    pub iq: Vec<u8>,
    pub lpf: Vec<u8>,
    pub up4: Vec<u8>,
    pub registers: Vec<(u32, u32)>,
    pub iq_m: i32,
}
pub(crate) fn filters(
    dynamic: &[u8],
    lpf1: &[u8],
    up4: &[u8],
    depth: usize,
    frequency: usize,
) -> Result<Filters> {
    p::exact(dynamic, 43084, "B_DynamicFilter.bin")?;
    p::exact(lpf1, 256, "B_LPF.bin")?;
    p::exact(up4, 364, "A_Up4Coef.bin")?;
    if depth > 7 || frequency > 2 {
        return Err("Filter selection out of bounds".into());
    }
    let iq_m = p::word(dynamic, 0) as i32;
    if iq_m <= 0 {
        return Err("IQ_M must be positive".into());
    }
    let n = p::word(dynamic, 0xa834 + 4 * frequency);
    if n > 255 {
        return Err("B_n exceeds byte".into());
    }
    let mut registers = vec![
        (0x5003e, p::word(dynamic, 4 + 16 * frequency)),
        (0x5003f, p::word(dynamic, 12 + 16 * frequency)),
        (0x50046, n),
        (0x50061, iq_m as u32),
    ];
    for i in 0..4 {
        registers.push((0x5003a + i as u32, p::word(lpf1, 16 * depth + 4 * i)));
    }
    let mut selectors = [0usize; 11];
    for (i, out) in selectors.iter_mut().enumerate() {
        *out = p::word(up4, 320 + 4 * i) as usize;
        if *out > 9 {
            return Err("Up4 selector exceeds ten banks".into());
        }
    }
    let mut coefficients = Vec::with_capacity(128);
    // Fresh C/D sentinel frequencies are replaced by0 in SendDepth.
    for i in [2 - frequency, 7, 9, 10] {
        let off = 32 * selectors[i];
        coefficients.extend_from_slice(&up4[off..off + 32]);
    }
    Ok(Filters {
        iq: dynamic[0x34 + 0x800 * frequency..0x34 + 0x800 * frequency + 2048].to_vec(),
        lpf: dynamic[0x3034 + 0x1400 * frequency..0x3034 + 0x1400 * frequency + 5120].to_vec(),
        up4: coefficients,
        registers,
        iq_m,
    })
}
pub(crate) struct Scan {
    pub payload: Vec<u8>,
    pub registers: [(u32, u32); 3],
    pub report: Value,
}
pub(crate) fn scan(
    g: Geometry,
    prf: p::SelectedPrf,
    bf: &[u8],
    logic: u32,
    low_power: u8,
    disabled: bool,
) -> Result<Scan> {
    p::exact(bf, 44, "A_BF.bin")?;
    let f = prf.fields;
    if p::word(bf, 4) != 4
        || p::word(bf, 12) != 128
        || p::word(bf, 16) != 64
        || f[6] != 24
        || f[9] != 2
        || low_power > 3
    {
        return Err("Scan branch requires waveBeams4/dense128/sparse64, synthetic3/beamAdd2 and lowPower0..3".into());
    }
    if f[0] <= 0 || f[4] <= 0 {
        return Err("Frame/line rate must be positive".into());
    }
    let budget = integer(
        (((g.clock * 1_000_000.) * 0.25) / f[0] as f32) as f64,
        "Scan budget",
    )? as i64;
    let min_prf = (f[4] / 4) as i64;
    let ctrl = g.ctrl_min as i64;
    let series = (logic >> 9) & 31;
    let low_power_branch = !disabled
        && low_power != 2
        && (low_power == 1 || (5..=21).contains(&series) || series == 29);
    let (b, control) = if low_power_branch {
        (min_prf, ctrl.max(budget - 96 * min_prf))
    } else {
        (min_prf.max((budget - ctrl) / 96), ctrl)
    };
    let mut nodes = Vec::with_capacity(194);
    for pass in 0..2u32 {
        nodes.push((nodes.len() as u32) << 20 | 0x34000 | if pass == 1 { 0x2000 } else { 0 });
        for q in 0..32u32 {
            let last = pass == 1 && q == 31;
            let element = if last { 62 } else { 2 * q + pass };
            let completion = if last { 1 } else { 3 };
            for k in (1..=3u32).rev() {
                nodes.push(
                    (nodes.len() as u32) << 20
                        | u32::from(k == 1) << 16
                        | completion << 12
                        | k << 8
                        | element,
                );
            }
        }
    }
    Ok(Scan {
        payload: words(nodes),
        registers: [
            (0x60011, unsigned(b)?),
            (0x60055, unsigned(control)?),
            (0x60010, 193),
        ],
        report: json!({"nodes":194,"passes":2,"first_pass_nodes":97,"assigned_control_event_count":1,
            "period_denominator":96,"budget_setting":budget,"low_power_branch":low_power_branch,
            "logic_compile_version":logic,"product_series":series,"logic_type":(logic>>14)&3,
            "logic_origin":"explicit unverified declaration; not USB firmware1.32","physical_calibration":null}),
    })
}
pub(crate) fn hv(raw: &[u8]) -> Result<Vec<u8>> {
    if raw.is_empty() || raw.len() > 4096 * 11 {
        return Err("HV file outside word bound".into());
    }
    let count = raw.len().div_ceil(11);
    let mut payload = Vec::with_capacity(count * 4);
    for (i, record) in raw.chunks(11).enumerate() {
        let last = i + 1 == count;
        if record.len() < 9
            || record[..8].iter().any(|b| !b.is_ascii_hexdigit())
            || !matches!(record[8], b',' | b';')
            || (!last && &record[9..] != b"\r\n")
            || (last && !matches!(&record[9..], b"" | b"\r\n"))
        {
            return Err(
                "HV requires eight hex digits, separator and exact11-byte stride (last9/11)".into(),
            );
        }
        let value = u32::from_str_radix(std::str::from_utf8(&record[..8]).unwrap(), 16)
            .map_err(|e| e.to_string())?;
        payload.extend_from_slice(&value.to_le_bytes());
    }
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn put(b: &mut [u8], offset: usize, v: u32) {
        b[offset..offset + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn geometry() -> Geometry {
        Geometry {
            pitch: 0.,
            radius: 50.,
            offset: 0.,
            clock: 100.,
            ctrl_min: 64,
            hv_index: 0,
        }
    }
    #[test]
    fn derived_aperture_mask_is_centered_with_exact_bit_counts_for_all33_cases() {
        for a in 0..=32 {
            let m = aperture_mask(a).unwrap();
            assert_eq!(m.count_ones(), a);
            if a > 0 {
                assert_eq!(m.trailing_zeros(), (32 - a).div_ceil(2));
                assert_eq!(m.leading_zeros(), (32 - a) / 2);
            }
        }
        assert!(aperture_mask(33).is_err());
    }
    #[test]
    fn tx_on_axis_analytic_case_and_f64_rounding_preserve_gate_and_channel_packing() {
        // Zero pitch is a mathematical test of the pure helper, not a supported
        // hardware input (Geometry::parse requires positive pitch).
        let mut raw = vec![0; 1024];
        for (i, v) in [1, 2, 3].into_iter().enumerate() {
            put(&mut raw, 4 * i, v);
        }
        let mut w = vec![0; 660];
        put(&mut w, 2 * 33 * 4, 8);
        let wave = p::TxWave8::parse(&w).unwrap().fundamental(0).unwrap();
        let s = TxSelection {
            lo: 100.,
            hi: 100.,
            aperture: 16,
            waveform: 0,
        };
        let out = tx(&raw, geometry(), &s, wave).unwrap();
        assert_eq!(out.payload, [4, 128].repeat(16));
        assert_eq!(
            out.gates,
            [
                (0x60012, 0x00020001),
                (0x60014, 0x00040002),
                (0x60016, 0x00070004)
            ]
        );
        assert_eq!(round_tx(8_388_609.).unwrap(), 8_388_609);
        assert_eq!(round_tx(-8_388_609.).unwrap(), -8_388_609);
        assert_eq!(round_tx(1.5).unwrap(), 2);
        assert_eq!(round_tx(-1.5).unwrap(), -2);
        assert!(round_tx(f32::NAN).is_err());
        assert!(round_tx(f32::INFINITY).is_err());
        assert!(round_tx(2_147_483_648.).is_err());
        assert!(half(-1, 0).is_err());
        assert!(half(0, 65536).is_err());
    }
    #[test]
    fn focal_selection_uses_end_for_focus6_aperture_and_reversed_frequency_banks() {
        let mut raw = vec![0; 1024];
        for i in 0..8 {
            for j in 0..8 {
                put(
                    &mut raw,
                    0x40 + 44 * i + 4 * j,
                    if j == 6 {
                        5
                    } else if j == 7 {
                        65
                    } else {
                        15
                    },
                );
            }
            for j in 0..3 {
                put(&mut raw, 0x40 + 44 * i + 32 + 4 * j, (j + 7) as u32);
            }
            put(&mut raw, 0x1a0 + 16 * i, (i + 1) as u32);
            for j in 1..4 {
                put(&mut raw, 0x1a0 + 16 * i + 4 * j, (20 * (i + 1)) as u32);
            }
        }
        let mut g = geometry();
        g.offset = 10.;
        let a = select_tx(&raw, g, 7, 2, 6).unwrap();
        assert_eq!((a.lo, a.hi, a.aperture, a.waveform), (15., 75., 4, 7));
        let b = select_tx(&raw, g, 0, 0, 0).unwrap();
        assert_eq!((b.lo, b.hi, b.aperture, b.waveform), (25., 25., 1, 9));
        for (d, f, k) in [(8, 0, 0), (0, 3, 0), (0, 0, 7)] {
            assert!(select_tx(&raw, g, d, f, k).is_err());
        }
        put(&mut raw, 0x40 + 40, 16);
        assert!(select_tx(&raw, g, 0, 0, 0).is_err());
    }
    #[test]
    fn rx_has_exact_b_and_c_region_sizes_zero_axis_and_overflow_rejection() {
        let out = rx(geometry()).unwrap();
        assert_eq!(out.len(), 1024);
        assert!(out.iter().all(|v| *v == 0));
        let mut g = geometry();
        g.pitch = 0.5;
        let out = rx(g).unwrap();
        assert!(out.iter().any(|v| *v != 0));
        // C-group +0.5 at j11 and -0.5 at j12 both have theta0.
        assert_eq!(&out[768 + (3 * 4 + 1) * 8..768 + (3 * 4 + 2) * 8], &[0; 8]);
        assert_eq!(&out[768 + (4 * 4 + 2) * 8..768 + (4 * 4 + 3) * 8], &[0; 8]);
        g.clock = f32::MAX;
        assert!(rx(g).is_err());
    }
    #[test]
    fn filter_slices_and_all_up4_selectors_are_bounded_without_pointer_aliasing() {
        let mut dynamic = vec![0; 43084];
        put(&mut dynamic, 0, 2);
        for freq in 0..3 {
            put(&mut dynamic, 4 + 16 * freq, 10 + freq as u32);
            put(&mut dynamic, 12 + 16 * freq, 20 + freq as u32);
            put(&mut dynamic, 0xa834 + 4 * freq, 3 + freq as u32);
            dynamic[0x34 + 0x800 * freq..0x34 + 0x800 * freq + 2048].fill(freq as u8 + 30);
            dynamic[0x3034 + 0x1400 * freq..0x3034 + 0x1400 * freq + 5120].fill(freq as u8 + 40);
        }
        let mut up = vec![0; 364];
        for i in 0..10 {
            up[i * 32..i * 32 + 32].fill(i as u8);
        }
        for i in 0..11 {
            put(&mut up, 320 + 4 * i, (i % 10) as u32);
        }
        let mut lpf = vec![0; 256];
        for i in 0..8 {
            lpf[i * 16..i * 16 + 16].fill(i as u8);
        }
        for freq in 0..3 {
            let out = filters(&dynamic, &lpf, &up, 7, freq).unwrap();
            assert_eq!(out.iq, vec![freq as u8 + 30; 2048]);
            assert_eq!(out.lpf, vec![freq as u8 + 40; 5120]);
            assert_eq!(
                out.up4,
                [
                    vec![(2 - freq) as u8; 32],
                    vec![7; 32],
                    vec![9; 32],
                    vec![0; 32]
                ]
                .concat()
            );
            assert!(out.registers.contains(&(0x5003a, 0x07070707)));
        }
        for i in 0..11 {
            let mut bad = up.clone();
            put(&mut bad, 320 + 4 * i, 10);
            assert!(filters(&dynamic, &lpf, &bad, 0, 0).is_err());
        }
        put(&mut dynamic, 0, 0);
        assert!(filters(&dynamic, &lpf, &up, 0, 0).is_err());
    }
    #[test]
    fn scan_nodes_and_period_use_first_pass_minus_assigned_single_control_event() {
        let mut bf = vec![0; 44];
        for (o, v) in [(4, 4), (12, 128), (16, 64)] {
            put(&mut bf, o, v);
        }
        let mut fields = [0; 13];
        fields[0] = 100;
        fields[4] = 4000;
        fields[6] = 24;
        fields[9] = 2;
        let prf = p::SelectedPrf {
            display_setting: 0,
            fields,
        };
        let base = scan(geometry(), prf, &bf, 0, 0, false).unwrap();
        assert_eq!(
            base.registers,
            [(0x60011, 2603), (0x60055, 64), (0x60010, 193)]
        );
        let n: Vec<_> = base
            .payload
            .as_chunks::<4>()
            .0
            .iter()
            .map(|v| u32::from_le_bytes(*v))
            .collect();
        assert_eq!(n.len(), 194);
        assert_eq!(n[0], 0x34000);
        assert_eq!(n[97], 97 << 20 | 0x36000);
        assert_eq!(n[1], 1 << 20 | 0x3300);
        assert_eq!(n[193], 193 << 20 | 0x1113e);
        for (i, v) in n.iter().enumerate() {
            assert_eq!(v >> 20, i as u32);
        }
        for (logic, low, disabled, special) in [
            (5 << 9, 0, false, true),
            (0, 1, false, true),
            (5 << 9, 2, false, false),
            (5 << 9, 3, false, true),
            (5 << 9, 1, true, false),
            (22 << 9, 0, false, false),
            (29 << 9, 0, false, true),
        ] {
            let out = scan(geometry(), prf, &bf, logic, low, disabled).unwrap();
            assert_eq!(out.report["low_power_branch"], special);
            if special {
                assert_eq!(&out.registers[..2], &[(0x60011, 1000), (0x60055, 154000)]);
            }
        }
    }
    #[test]
    fn hv_stride_count_and_literal_word_order_reject_native_allocation_quirks() {
        assert_eq!(
            hv(b"01234567,\r\n89ABCDEF;").unwrap(),
            words([0x01234567, 0x89abcdef])
        );
        assert_eq!(hv(b"01234567;\r\n").unwrap(), words([0x01234567]));
        for b in [
            &b""[..],
            b"1234567;",
            b"12345678\n",
            b"1234567Z;",
            b"12345678;\n",
            b"12345678;\r\nextra",
            b"12345678,  00000000;",
        ] {
            assert!(hv(b).is_err(), "{b:?}");
        }
        assert!(hv(&vec![b'0'; 4096 * 11 + 1]).is_err());
    }
}
