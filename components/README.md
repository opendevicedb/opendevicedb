# Free reusable components

Components live in this repository independently of device records. You can
contribute processing, a UI, a port or fixtures without low-level device work.

See the [product specification](../knowledge/specifications/composable-applications.md)
and [pilot contracts and SDK guide](../knowledge/implementation/component-pilot.md).

Add a manifest at `<namespace>/<name>/<version>/component.json`, readable sources,
license/attribution, behavior documentation and reproducible fixtures. Sources
referenced before porting use `source-referenced` or `port-in-progress`; only
validated supported releases are executable. A published version is immutable:
new source, permissions or artifacts require a new version.

```sh
npm ci
npm run components:build
npm run components:check
npm run components:test
npm test -w @opendevicedb/mcp
```

The example processing module is assembled from WAT using pinned WABT. Other
compilers are welcome when their output satisfies a supported documented ABI.
Contributions requiring new contracts/host services should specify and test them
explicitly. The registry never runs build commands supplied by manifests.

Fixture results are separate from hardware validation. Do not include private
captures, serial numbers or credentials in a public contribution. All sources
and redistributed artifacts must respect their licenses and [POLICY.md](../POLICY.md).

## Ultrasound preview

The `ultrasound/preview-source` host service and `video/frame-viewer` UI compose a read-only image preview. See the [setup and frame contract](../knowledge/implementation/ultrasound-preview.md). Tests use synthetic images; physical probe acquisition is not validated by these fixtures.

## Browser acquisition

The [browser-only capture guide](../knowledge/implementation/browser-ultrasound-capture.md) describes the three-module USB acquisition → WASM decoder → frame display application. Build/check its Rust artifact with `npm run probe:build` / `npm run probe:check` (Rust 1.99.0, wasm32-wasip1). Resource files are loaded locally and must never be committed.

## Local recording replay

**Replay a convex probe recording** composes `ultrasound/recorded-data`,
`ultrasound/convex-open-image` and `video/frame-viewer`. Select a local `.bin`,
`.odb-capture` or `.odb-stream` file, then choose **Replay recording**. The original
image profile is built in; no configuration file, probe or native bridge is
required. Files remain in the browser. Images use a normalized, uncalibrated
sector; replay does not establish device identity or physical dimensions.

Streaming archives are processed incrementally with render acknowledgements;
legacy JSON captures are bounded to96MiB. Gaps, byte-count mismatches and declared
storage losses fail explicitly. Archived commands are never executed. **Stop
replay** or **Close** releases the decoder and displays; completion retains the
last image until then. Build/check this profile using
`node scripts/build-open-image-wasm.ts` / `node scripts/build-open-image-wasm.ts --check`.
The script also checks its pinned shared Rust processing sources.
