---
type: Architecture
title: Component registry and scalar application pilot
description: Implementation contracts, integration instructions and remaining work for the first composable application runtime.
status: draft
tags: [components, wasm, sdk, mcp, implementation]
generated:
  by: codex/gpt-6
  at: 2026-11-05T01:38:50Z
sources:
  - id: requirements
    resource: ../specifications/composable-applications.md
    title: Composable applications product specification
  - id: registry
    resource: ../../packages/components/src/index.ts
    title: Registry loader and static inspection
  - id: host-sdk
    resource: ../../packages/components/src/host.ts
    title: Shared host SDK
---

# Component registry and scalar application pilot

This is the first implementation of the [product specification](../specifications/composable-applications.md).
The running vertical slice covers discovery, a real WASM transform, an isolated web
component, customization, composition locking and MCP integration. It uses scalar
values to exercise contracts; it does not represent a spatial capture port.
The subsequent [ultrasound preview](ultrasound-preview.md) adds a PNG frame contract,
read-only local driver bridge and reusable video display.

## Repository layout and commands

```text
components/<namespace>/<name>/<version>/component.json
components/<namespace>/<name>/<version>/<source and artifacts>
compositions/<namespace>/<name>/composition.json
packages/components/schema/             normative pilot JSON Schemas
packages/components/src/browser.ts      types, graph validation, locks, static WASM inspection
packages/components/src/host.ts         shared session SDK
packages/components/src/index.ts        repository registry and verified source inspection
site/src/scripts/applications.ts        browser host, worker and isolated UI integration
```

```sh
npm ci
npm run components:build       # explicitly assemble WAT and update source/artifact locks
npm run components:check       # check reproducibility; never rewrite releases
npm run components:test
npm run dev                   # /components/ is the application and component catalogue
npm test -w @opendevicedb/mcp
```

Both applications reuse `examples/scale@1.0.0` and
`examples/number-display@1.0.0`. One reads recorded values, the other reads the
major revision already exposed by an explicitly selected WebUSB device object.
The latter performs no USB protocol transfers and provides no claim that a
product's control protocol is implemented or hardware-verified.

All component code is free software under its declared license. The supplied
examples are AGPL-3.0-or-later and use the repository's [license](../../LICENSE).
The build assembler is WABT 1.0.39, pinned in the workspace lockfile. Reused
upstream code must preserve its original licenses and corresponding sources.

## Versioned manifest and graph formats

`odb-component/1` declares identity, version, status, roles, license, authors,
source path/digest/build instructions, optional artifact path/digest, execution
ABI, targets, ports, parameters, permissions, documented behavior, fixtures and
evidence. Its [JSON Schema](../../packages/components/schema/component.schema.json)
is normative for this pilot. Referenced sources and artifacts are checked against
SHA-256; filesystem paths cannot leave the repository through traversal or symlinks.

An executable release must match a supported ABI. Referenced sources and ports in
progress can be catalogued without being offered as executable blocks. No build
command from a manifest is evaluated by the registry or MCP server.

`odb-composition/1` records exact node versions, parameters, connections and a
12-column application layout. Its [JSON Schema](../../packages/components/schema/composition.schema.json)
rejects unknown top-level fields, including attempted browser permissions or device
identities. Locks include the source manifest digest and artifact digest, so changing
permissions or source metadata invalidates a saved lock even if the binary is unchanged.

Validation checks schemas, unique node identities, exact component availability,
target compatibility, parameter types/ranges, port directions and exact contract
versions, required inputs, multiple producers, data cycles, layout bounds and locks.
Import only produces a draft. It never starts a session or silently replaces a lock.

## Scalar contract and ABI

The initial stream contract is `odb.scalar/1`:

```ts
interface ScalarSample {
  format: "odb.scalar/1";
  value: number | null;
  unit: string;
  timestamp: number;    // host wall-clock time in milliseconds since Unix epoch
  source: string;       // descriptive source, never a personal device identifier
  session: string;      // ephemeral runtime identity, excluded from shared compositions/reports
  label?: string;
}
```

Values must be finite. A null value means that no current measurement exists.
Transformations preserve the host envelope, including units, timestamp, source
and session. This pilot scale factor is dimensionless; changing units needs a
separate documented conversion contract.

The `odb.scalar-transform/1` WASM ABI has exactly one export:

```wat
(func (export "process") (param $value f64) (param $factor f64) (result f64))
```

It has no imports, memory, globals, tables, data or start function. The 256 KiB
pilot artifact limit and static type/import/export inspection are enforced before
instantiation. Sources may originate in WAT or a compiler whose output satisfies
this ABI. More complex compiled libraries need additional explicitly specified
ABIs; the scalar ABI does not claim to accept arbitrary existing native libraries.

The browser runs it in a dedicated worker. Each call has a three-second budget;
the host terminates a looping worker. Production waits for each sample to finish,
so there is at most one sample in flight and no unbounded processing queue.

`odb.scalar-source/1` selects a host-provided service. The two services implemented
here are `recorded-scalars` and `usb-descriptors`; contributor JavaScript cannot
register itself as a privileged host service. The file source receives only an
explicitly selected JSON array of 1–4096 finite numbers. File names and content
are not uploaded or put into a saved composition.

## UI isolation and lifecycle

`odb.scalar-ui/1` is a web component delivered as a JavaScript artifact. The browser
checks its digest and places it in an iframe with `sandbox="allow-scripts"`, no
same-origin access and no hardware permissions. Its document CSP blocks network,
frames, forms and external resources. The parent permits only blob frames, also
blocking self-navigation from a contributed frame to a network URL.

The host transfers one `MessagePort` with the initialization message
`odb-ui-connect/1`. Validated scalar envelopes then travel on that private channel.
The pilot exposes no UI-to-hardware command API. Shadow DOM alone is never treated
as a security boundary.

`ScalarSession` in `@opendevicedb/components/host` is the shared integration API.
It accepts a locked composition, a registry and explicit host implementations of
`prepareTransform` and `prepareInterface`, plus optional selected USB input or
recorded values. The SDK is currently consumed from this repository workspace;
it is not yet an independently published npm package.

Consumers prepare before the producer starts. Partial preparation failure, stop,
dialog close or USB disconnection releases workers, channels, frames and timers.
Pending results from an aborted session are ignored. A stopped session cannot be
restarted; the person must explicitly create/start a new one. Draft edits never
change the running composition.

## Device entry points

Device pages with declared USB identifiers offer the generic USB descriptor
application under a collapsed technical examples section, without suggesting
product-specific protocol support. USB analysis offers device-specific applications
when identification is unambiguous, with generic examples kept separately. That journey passes the exact selected device object
to the application in the same page, so a second chooser is not required and
devices sharing a VID:PID are not confused. Neither that object nor a serial
number is serialized into compositions or reports.

The main catalogue can launch applications without a device. Customize supports
replacing compatible blocks, adding/removing blocks, editing parameters, connecting
ports and setting interface grid geometry through keyboard-accessible controls.
The draft can be downloaded, imported or restored from the original publication.
Drag-and-drop editing and the full graph/layout workbench remain subsequent work.

## Static API and MCP integration

- `/api/components.json`: `odb-registry/1` containing registered component versions
  and published locked compositions.
- `/api/components/<namespace>/<name>/<version>/inspection.json`: sources,
  behavior, contracts, parameters, fixtures and static binary inspection.
- `/_components/<repository-relative-path>`: checked public sources/artifacts.

Astro serves these during development and writes the same files at static build
time. No dynamic application database or code execution service is required.

The MCP server adds `search_components`, `get_component`, `inspect_component`,
`validate_composition`, `resolve_composition`, `get_integration_guide` and
`prepare_app_export`. Local and remote backends share the registry API. Results
carry `odb-components-result/1`; all seven tools are read-only. Inspection compiles
the binary structure but never instantiates a module, calls a function or runs
a start function.

An agent integration flow is: discover, fetch an exact manifest, inspect sources,
validate/lock a composition, implement the documented host services, and run
the matching fixtures. The generated application need not retain an MCP or AI
connection. Host-specific services remain explicit rather than being inferred
from successful WASM compilation.

## Evidence and remaining implementation

Fixture testing in the browser executes the module's declared cases in a worker,
shows actual/expected values for review and permits a JSON report download.
Reports contain no device object, serial number, file name, browser identity,
private values or runtime session ID. They say `kind: fixture` and
`hardware_validation: not-performed`. Download is local and does not publish.

The following product requirements remain open and are not claimed as delivered:

- The complete visual editor with drag-and-drop layout, reusable nested
  subcompositions and typed public boundaries.
- Image/calibration/scene contracts, spatial capture porting and real camera/drone
  protocol adapters, including hardware-specific trials.
- A native desktop host and package builder producing installable applications;
  mobile/headless hosts beyond the scalar integration contract.
- Hardware report submission, static aggregation, disputes and evidence promotion.
- Richer WASM ABIs, dependency resolution and per-function hardware capabilities.

`prepare_app_export` therefore returns a preparation state with
`package_available: false` and explicit blockers. A downloaded composition is not
presented as a built desktop application. The [product acceptance criteria](../specifications/composable-applications.md#9-proposed-acceptance-criteria)
remain the roadmap; pilot fixtures and simulated USB tests are not real hardware
validation or proof that all criteria are complete.
