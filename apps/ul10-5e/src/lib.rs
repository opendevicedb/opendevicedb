//! Fixed-profile UL10-5E frame decoder for the phantom bench viewer.
mod linear;
mod linear_dsp;
mod linear_post;
mod linear_render;
use serde_json::{Value, json};
use std::{cell::RefCell, collections::BTreeMap};
type Result<T> = std::result::Result<T, String>;
const MARKER: [u8; 4] = [0, 0, 255, 127];
#[derive(Clone, Debug, PartialEq)]
pub struct Segment {
    pub offset: u64,
    pub kind: &'static str,
    pub bytes: Vec<u8>,
    pub metadata: Value,
    /// Counts are observations of parser conditions, never proven lost samples.
    pub diagnostics: BTreeMap<String, u64>,
}

struct Processor {
    assets: linear_dsp::Assets,
    envelope: linear_dsp::Processor,
    post: linear_post::Processor,
    render: linear_render::UniformMaskProcessor,
}
impl Processor {
    fn new() -> Result<Self> {
        let assets = linear_dsp::Assets::fixed();
        let envelope = linear_dsp::Processor::new(assets.clone())?;
        let post = linear_post::Processor::new(
            &assets,
            linear_post::Settings {
                gain: 50.,
                dynamic_range: 60.,
                tgc: [0.; 6],
            },
        )?;
        let table = linear_render::CorrelationTable {
            values: [0.5; 9],
            provenance: json!("fixed bench setting"),
        };
        let render = linear_render::UniformMaskProcessor::new(
            &assets,
            table,
            linear_render::Settings {
                width: 512,
                height: 512,
                correlation_index: 3,
            },
        )?;
        Ok(Self {
            assets,
            envelope,
            post,
            render,
        })
    }
    fn process(&mut self, frame: &[u8]) -> Result<Vec<u8>> {
        let env = self.envelope.process(frame)?;
        let post = self.post.process(&env.packed)?;
        let image = self.render.process(&post.b)?;
        let palette = include_bytes!("../profile/display-rgba.bin");
        Ok(image
            .raster
            .iter()
            .flat_map(|&v| {
                let i = usize::from(v) * 4;
                palette[i..i + 4].iter().copied()
            })
            .collect())
    }
}
struct Decoder {
    inspector: linear::Inspector,
    processor: Processor,
    next_offset: Option<u64>,
}
impl Decoder {
    fn new() -> Result<Self> {
        let processor = Processor::new()?;
        let policy = linear::Policy {
            alignment: linear::Alignment::RecoverAll,
            availability: linear::Availability::Minimal,
        };
        let inspector = linear::Inspector::new(
            processor.assets.configuration().framing(),
            policy,
            // A session may stream indefinitely. Per-read, frame and buffer bounds still apply.
            linear::Limits {
                max_input_bytes: u64::MAX,
                ..linear::Limits::default()
            },
        )?;
        Ok(Self {
            processor,
            inspector,
            next_offset: None,
        })
    }
    fn receive(&mut self, bytes: &[u8], present: bool) -> Result<Option<Vec<u8>>> {
        for s in self.inspector.push(bytes)? {
            if s.kind == "linear_frame" {
                if !present {
                    continue;
                }

                if self.next_offset.is_some_and(|offset| offset != s.offset) {
                    self.processor = Processor::new()?;
                }
                self.next_offset = Some(s.offset + s.bytes.len() as u64);
                return Ok(Some(self.processor.process(&s.bytes)?));
            }
        }
        Ok(None)
    }
}
thread_local! {
    static STATE:RefCell<Option<Decoder>>=const{RefCell::new(None)};
    static INPUT:RefCell<[u8;16384]>=const{RefCell::new([0;16384])};
    static OUTPUT:RefCell<Vec<u8>>=const{RefCell::new(Vec::new())};
}
fn fail(e: String) -> i32 {
    OUTPUT.with(|o| *o.borrow_mut() = e.into_bytes());
    -1
}
#[unsafe(no_mangle)]
pub extern "C" fn reset() -> i32 {
    match Decoder::new() {
        Ok(d) => {
            STATE.with(|s| s.replace(Some(d)));
            0
        }
        Err(e) => fail(e),
    }
}
#[unsafe(no_mangle)]
pub extern "C" fn input() -> *mut u8 {
    INPUT.with(|i| i.borrow_mut().as_mut_ptr())
}
#[unsafe(no_mangle)]
pub extern "C" fn output() -> *const u8 {
    OUTPUT.with(|i| i.borrow().as_ptr())
}
#[unsafe(no_mangle)]
pub extern "C" fn size() -> usize {
    OUTPUT.with(|i| i.borrow().len())
}
#[unsafe(no_mangle)]
pub extern "C" fn push(n: usize) -> i32 {
    ingest(n, true)
}
#[unsafe(no_mangle)]
pub extern "C" fn advance(n: usize) -> i32 {
    ingest(n, false)
}
fn ingest(n: usize, present: bool) -> i32 {
    if n > 16384 {
        return fail("USB block too large".into());
    }
    let res = STATE.with(|s| {
        INPUT.with(|i| {
            s.borrow_mut()
                .as_mut()
                .ok_or("Decoder not initialized".to_string())?
                .receive(&i.borrow()[..n], present)
        })
    });
    match res {
        Ok(None) => 0,
        Ok(Some(frame)) => {
            OUTPUT.with(|o| o.replace(frame));
            1
        }
        Err(e) => fail(e),
    }
}
