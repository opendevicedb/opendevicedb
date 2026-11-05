---
type: Architecture
title: Browser-only ultrasound acquisition and WASM reconstruction
description: Three composable modules that acquire UC5-2S USB data, reconstruct PNG frames in WebAssembly and display the image stream without a local driver server.
status: draft
tags: [components, wasm, webusb, ultrasound, implementation]
generated:
  by: codex/gpt-6
  at: 2026-11-05T03:30:00Z
sources:
  - id: requirements
    resource: ../specifications/composable-applications.md
    title: Composable applications specification
  - id: capture
    resource: ../../components/ultrasound/usb-capture/1.0.0/source.ts
    title: WebUSB acquisition source
  - id: decoder
    resource: ../../components/ultrasound/convex-decoder/1.0.0/src/lib.rs
    title: Rust browser decoder ABI
  - id: sdk
    resource: ../../packages/components/src/probe-session.ts
    title: Capture session SDK
---

# Browser-only ultrasound capture

For resource-free reconstruction of an existing recording, use
`ultrasound/convex-replay` with `ultrasound/convex-open-image@0.1.0`.
That original profile needs no configuration file and cannot configure or
activate hardware. Its sector is normalized and has no calibrated distance
scale. See the [profile and native/WASM build instructions](../../components/ultrasound/convex-open-image/0.1.0/README.md).
The acquisition path described below still requires separately supplied
resources; it is not an autonomous plug-and-scan release.

The owner requires USB acquisition and image reconstruction inside the browser,
without a localhost driver, HTTP image bridge or external decoding service. The
previous read-only preview remains an optional utility; it does not implement
this use case.

The application `ultrasound/convex-capture` composes exactly three modules:

| Component | Input | Output | Responsibility |
| --- | --- | --- | --- |
| `ultrasound/usb-capture@1.0.0` | Explicitly selected WebUSB device | `odb.usb.bytes/1` | Identify and configure UC5-2S, start acquisition, receive bytes, stop and close |
| `ultrasound/convex-decoder@1.0.0` | USB byte stream and local probe resources | `odb.video.frame/1` | Incremental framing and existing Rust reconstruction engine compiled to WASM |
| `video/frame-viewer@1.0.0` | PNG frame stream | Canvas image stream | Isolated reusable display |

Acquisition and rendering remain independent of the business processing module.
The first decoder keeps BFSP, DTGC, compound, SRI and DSC together to preserve the
existing processing order and state. Splitting each numerical stage is future
work, rather than a prerequisite for this usable composition.

## User journey

From the device record or an unambiguous USB match, open **Ultrasound live capture**.
Load the probe resource file, confirm the current phantom setup, set the capture
duration (1–30 seconds, initially one), and choose **Start capture**. If entered from
USB detection, the already selected device is reused. **Stop capture** stops the
source and releases the decoder and displays. A completed acquisition leaves its
last image visible. A new session requires another explicit start.

The page has no local server URL field for this application. No native driver,
phone, application-level backend or server process is used during acquisition or
reconstruction. WebUSB requires a supported secure browser context and permission
to access the selected USB interface. The browser uses its normal OS USB stack.

Resource files are loaded locally and never uploaded. They are separate inputs,
not another executable module. A local preparation tool can combine independently
held assets into a `.odb-probe` file:

```sh
npm run probe:pack -- --assets GENERAL --hv HV --sri SRI --maps MAPS \
  --settings SETTINGS.json --selection SELECTION.json \
  --parameters PARAMETERS.json --grouping GROUPING.json \
  --output /private/location/probe.odb-probe
```

The tool refuses an output inside this public repository. Runtime resources,
configuration payloads, acquired data and derived personal images must not be
published as component fixtures. Missing or unrecognized resources fail during
WASM preparation, before the USB interface is opened. No browser settings are
silently changed, and proprietary resource bytes are not embedded in the module.

## Decoder and reproducible build

The crate is an extraction of the owner's existing original Rust driver code,
with the same numerical processing and explicit memory policies. `source-origin.json`
records the original source digests. Vendor binaries and resources are excluded.
The manifest lists every Rust/module/metadata/build source with its digest; static
inspection returns the readable source set without executing WASM.

```sh
rustup toolchain install 1.99.0 --profile minimal
rustup target add wasm32-wasip1 --toolchain 1.99.0
npm run probe:build
npm run components:build
npm run probe:check
npm run components:test
cargo test --manifest-path components/ultrasound/convex-decoder/1.0.0/Cargo.toml --lib --locked
```

The checked artifact is built with Rust 1.99.0 and the locked Cargo dependencies.
CI rebuilds it and compares the resulting bytes. `components:check` validates all
source, artifact and composition locks without running manifest build commands.

The `odb.ultrasound.decode/1` ABI exports `odb_alloc`, `odb_free`, `odb_call`,
`odb_output_ptr`, `odb_output_len` and memory. Operations initialize from the
explicit configuration, consume raw bytes, interpret complete parameter messages,
bind the fixed configuration producers to the current message, and finish parsing.
PNG batches use little-endian count/sequence/length headers and bounded bytes.
Initialization and control planning return JSON. The caller copies output before
the next operation and releases each input allocation.

The host instantiates WASM in a dedicated worker with only the declared subset of
WASI imports. Resource bytes are passed directly to the Rust session in memory,
without a preopened WASI directory or mounted files. The worker gives the module
no host filesystem, USB or network access.
Artifact size is limited to 2 MiB, memory to 256 MiB and each operation to a host
time budget. All scalar ABI limits remain unchanged. Per-stage diagnostic image
hashing is omitted in the WASM hot path; resource hashes remain mandatory.

## USB lifecycle and failure handling

The source checks the selected VID:PID, interface endpoints and current UC5-2S
product identity before any OUT. It sends the established fixed bootstrap, binds
configuration to one complete current PID0 message, performs the legacy identity
recheck when required, queues all IN readers, then sends configuration and Start.
The same current-device identity and parameter-change/button guards are retained.
No arbitrary firmware/register upload interface is exposed. Control planning is
restricted by the host to the audited UC5-2S core release; a replacement processing
module cannot silently acquire command authority.

WebUSB cannot reproduce libusb's per-read timeout semantics. Startup queues DATA,
message and notification reads before Start; it does not claim a successful empty
DATA timeout as a readiness barrier. Deadline failures close the device to cancel
pending reads. The source never creates a second reader on an endpoint while its
previous read remains pending.

Every OUT outcome must be complete. No retry or further OUT, including Freeze, is
allowed after an uncertain write. Stop waits for any in-flight OUT result before
considering the single final Freeze, closes USB and joins/cancels readers. Closing
the dialog releases the worker, message channels and frame consumers. Neither a
successful host write nor closing USB attests physical acoustic stop.

This capture composition bounds the byte queue at 16 MiB, total acquisition
bytes at 64 MiB and emitted images at the explicit decoder budget. The USB
transport also supports an explicitly selected continuous host mode; the public
capture dialog keeps its bounded-duration policy. USB reads run independently of expensive
WASM work. Frame consumers acknowledge their transferred PNG before the next
image is displayed. If the decoder cannot keep up, the session stops explicitly;
it does not silently discard raw bytes or join data across a gap. Pending decoding
can continue after the acquisition timer while the page says it is finishing.

## Validation and current limits

Public automated tests use synthetic resources and mock USB transports. They
check resource rejection before USB open, bounded known command ordering,
unknown-OUT suppression, cancellation during device opening, consumer cleanup,
three-component layout, accessibility, source inspection and graph locks.

A separate local validation fed the already recorded convex raw acquisition into
the actual browser WASM worker through a mock WebUSB transport. It produced nine
512×512 displayable images, the expected 19 OUT attempts and no native-server
requests. This is a replay-based browser integration test, not a new physical USB
acquisition. The private data and images are excluded from the public test suite.

The nine images were compared with the existing Linux reconstruction: each had
27–34 differing color-channel bytes out of 1,048,576, with maximum difference one
level out of 255. They are not byte-identical. The small numerical difference is
retained as a backend difference, not erased or described as exact equivalence.
A local optimized WASM replay reconstructed the nine images in about 1.6 seconds;
this is a replay benchmark, not a measured device frame rate or live latency.

A fresh physical browser acquisition, sustained frame rate, image geometry,
calibration, GPU equivalence and acoustic/electrical validation remain separate.
The available captured image sequence validates reconstruction progress; it does
not establish calibrated or clinical imaging.

## Runtime references

The host follows the browser’s [WebUSB transferIn contract](https://developer.mozilla.org/en-US/docs/Web/API/USBDevice/transferIn) for bulk/interrupt reads and [controlTransferOut contract](https://developer.mozilla.org/en-US/docs/Web/API/USBDevice/controlTransferOut) for fixed vendor control requests. Rust targets [wasm32-wasip1](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-wasip1.html); the bundled [browser WASI shim](https://github.com/bjorn3/browser_wasi_shim) is restricted to the selected in-memory resource files.
