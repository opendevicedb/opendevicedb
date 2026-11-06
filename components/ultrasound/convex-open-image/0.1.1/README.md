# Original UC5-2S reconstruction profile

Release0.1.1 adds a verified native recording host. The image-profile source
and shared Rust processing library are unchanged from0.1.0; this is a host
validation change, not a new acquisition or calibration result. Release0.1.0
remains immutable. Use the0.1.1 native host instead of the earlier example,
which does not verify receive-journal metadata and raw-file hashes.

An experimental, resource-free image profile implemented in Rust under
AGPL-3.0-or-later. Native Linux and browser WASM use the same `OpenSession`
and the shared `odb-convex-decoder` processing library. All processing inputs
are byte slices in memory. Hosts provide transport, storage and display.

This component reconstructs already acquired DATA streams. It does not
initialize or activate a probe. A complete autonomous acquisition profile
remains separate work; this release is not a plug-and-scan application.

## Generated profile

The symmetric 16-tap filter is the binomial polynomial
`(1 + z^-1)^15 / 2^15`, generated using integer recurrence. Display defaults
are -8 dB gain, 48 dB dynamic range, flat gain versus sample index,
temporal persistence 0.25 and generated identity grayscale. Adaptive compound
mixing and spatial enhancement are disabled. These are original display
choices, not calibrated tissue or transducer parameters.

Rendering uses a chosen normalized 60-degree sector with unit radius and
512 × 512 opaque RGBA pixels. This is not a measurement of the probe's angle
or depth. The decoder accepts the observed mode0/P896/N32 DATA format,
1800-word lines and four u16 lanes; no physical sampling rate is inferred.
There is no claim of equivalence to another image profile or metric calibration.

## Build and native use

From the repository root, with Rust 1.99.0 and its `wasm32-wasip1` target installed:

```sh
node scripts/build-open-image-wasm.ts --version 0.1.1
node scripts/build-open-image-wasm.ts --version 0.1.1 --check
npm run components:build
cargo test --locked --manifest-path components/ultrasound/convex-open-image/0.1.1/Cargo.toml
```

The optional `replay_open` native binary accepts a recorded capture directory
and a new output directory. It accepts the observed `probe-receive-v1` and
sealed `probe-receive-memory-v1` convex DATA86/16,384-byte journal profiles.
It verifies the declared profile, terminal state, reservation/seal, ordinals,
fixed raw filenames, per-read status/code/size/SHA256 and byte total. Empty
and partial timeout prefixes are preserved exactly. Unknown, failed, in-flight
or discontinuous receive outcomes are rejected rather than concatenated.
An explicit final per-read cancellation before I/O, with no result fields,
terminates the verified prefix without inventing a gap or consuming an orphan
file. It is distinct from cancellation after a transfer with an unknown result.
Their original archives are not modified; use a tool with an explicit gap
policy to investigate such evidence.

Before creating output or evaluating images, the host snapshots all validated
DATA into owned memory. Later source-file changes cannot alter those bytes.
The journal is limited to16MiB, at most10,000reads, and163,840,000DATA bytes;
these are host bounds, not sampling or image-quality claims. Metadata and DSP
memory are additional. Files must be regular; symlinks/devices are rejected.
After validation it writes PNGs and hashes, `profile.json`, and `replay.json`
with source hashes/counts and processing/completed/failed state. A failed
evaluation can retain partial outputs but does not gain a completed marker.
The output directory must be new. No configuration, bootstrap response or
device access is needed; archived commands are never executed.

```sh
cargo build --release --locked --manifest-path components/ultrasound/convex-open-image/0.1.1/Cargo.toml --bin replay_open
components/ultrasound/convex-open-image/0.1.1/target/release/replay_open CAPTURE NEW_OUTPUT
```

The snapshot verifies declared host DATA only. It does not authenticate a
device, establish a complete or loss-free physical capture, or calibrate an
image. A prepared empty journal can yield zero images without implying an
acquisition. Browser `.bin`/`.odb-capture`/`.odb-stream` loading remains a
separate host path; its USB capabilities and acquisition dependencies do not
change in this release.
Both WASM builds pin Rust 1.99.0 and normalize repository and Cargo-cache paths.
The locked Rust compiler adapter also normalizes Cargo's metadata for the two
local crates, retaining their names, versions, targets and enabled features.
Other dependency identities and all numerical compiler options are preserved.
Its source hash selects a separate build cache so an adapter change cannot reuse
an older compilation. This avoids host-dependent function ordering in the WASM.
CI tests the shared library and original profile and rebuilds both artifacts.
Binary identity is
checked with the same locked dependencies and Rust toolchain; it is not a claim
of identical output across different compiler versions.

Native library callers use `OpenSession::new(Display::default())`,
`push(&[u8])`, `advance(&[u8])` and `finish()`. `Display` accepts bounded finite
gain, dynamic range, sample-index gain slope and persistence settings.

## Browser use

```ts
const decoder = await createProbeDecoder(wasmBytes, undefined, {
  purpose: "reconstruction",
  continuous: true,
});
const frames = decoder.pushRgba(recordedDataBytes);
// Feed remaining bytes in order, then call decoder.finishRgba().
```

Initialization requires explicit reconstruction purpose. Acquisition/default
initialization and hardware command binding fail. ABI operations 2/5 return
PNG batches, 9/10 RGBA batches, 11 encodes an RGBA snapshot and 12 advances
processing histories without rasterizing. No resource file, mounted directory,
network access or USB import is required. Maximum WASM memory is 256 MiB.
The `ultrasound/convex-replay` application selects reconstruction explicitly and
reads local `.bin`, `.odb-capture` and `.odb-stream` files. The recording source
does not expose USB or execute archived journal commands. Continuous JSONL
recordings are read incrementally; legacy JSON containers are limited to96MiB.
Shared processing sources are pinned in `shared-sources.json` and checked before
building the WASM. The registry also pins this lock file with the component.

## Validation scope

Two preserved phantom acquisitions provide 45 complete reference frames.
Replay counts remain 9 and 36; native/WASM RGB differences are bounded by
2 intensity levels out of 255. Image appearance intentionally differs from
the earlier reference profile. Those measurements validate reconstruction
continuity and cross-target consistency, not acoustic safety, calibration or
diagnostic performance. No new physical capture was required.
