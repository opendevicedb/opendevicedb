# Original UC5-2S reconstruction profile

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
node scripts/build-open-image-wasm.ts
node scripts/build-open-image-wasm.ts --check
npm run components:build
cargo test --locked --manifest-path components/ultrasound/convex-open-image/0.1.0/Cargo.toml
```

The optional `replay_open` native binary accepts a recorded capture directory
and a new output directory. It reads `receive/data/manifest.json` and the
referenced raw reads, then writes PNGs and their hashes. No configuration,
bootstrap responses or device access are needed for reconstruction.
Both WASM builds pin Rust 1.99.0 and normalize repository and Cargo-cache paths.
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
