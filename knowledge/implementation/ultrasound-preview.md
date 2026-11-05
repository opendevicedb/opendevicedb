---
type: Architecture
title: Read-only ultrasound preview and reusable PNG frame display
description: Browser frame streaming, local driver bridge, provenance and synthetic validation for the ultrasound preview application.
status: draft
tags: [components, ultrasound, video, sdk, implementation]
generated:
  by: codex/gpt-6
  at: 2026-11-05T02:15:00Z
sources:
  - id: requirements
    resource: ../specifications/composable-applications.md
    title: Composable applications specification
  - id: bridge
    resource: ../../scripts/ultrasound-bridge.ts
    title: Read-only loopback bridge
  - id: video-sdk
    resource: ../../packages/components/src/video.ts
    title: Video session SDK
---

# Read-only ultrasound preview

This is now an optional read-only utility. For actual acquisition inside the
browser, use [browser ultrasound capture](browser-ultrasound-capture.md).

The application composes `ultrasound/preview-source@1.0.0` with
`video/frame-viewer@1.0.0`. Its entry appears on the convex probe record and after
an unambiguous USB identification of `04b4:4611`. Generic USB descriptor examples
are collapsed separately. Identification does not establish acquisition support.

The viewer reads images produced by an existing local native driver. It does not
implement the probe protocol, load firmware, change settings or start acquisition.
No native driver or proprietary resources are distributed here. Real-time output
requires the driver to supply successive complete PNG frames; the browser polls
at a configurable interval (250 ms by default), with one frame in flight.

## Setup and compatible driver API

Run from this repository, substituting the actual driver port and page origin:

```sh
npm run ultrasound:bridge -- --upstream http://127.0.0.1:DRIVER_PORT --allow-origin https://opendevicedb.org
```

For local development use the exact page origin, for example
`http://127.0.0.1:4335`. Open the application, leave the bridge URL at
`http://127.0.0.1:4337`, then choose **Connect preview**. Acquisition remains managed
in the native driver. Browser local network permission may be required; the
implementation does not bypass browser permission controls.

The expected native preview API is:

- `GET /api/status`: object with integer `session`, positive integer or null `frame`,
  Boolean `replay_only`, and optional `profile` and `phase`.
- `GET /api/image/<session>/<frame>`: cached PNG for those exact numeric identifiers.

The bridge binds only `127.0.0.1`. It requires the exact Host and explicitly allowed
Origin. Only plain GET and its CORS preflight are accepted. It forwards only the
two preview routes, rejects redirects and bounds upstream requests and responses.
It projects status into a small public contract; configuration, private paths,
serial numbers and upstream error bodies are never forwarded. Image bytes stay
on the local browser/bridge/driver path; they are not uploaded to OpenDeviceDB.
Do not expose the bridge through a public proxy. The explicitly allowed site can
read frames while the bridge is running; stop the bridge to revoke that access.

## Contracts and lifecycle

`odb.video.frame/1` is a stream of PNG frames:

- `format`, `encoding: "image/png"`, transferable `data: ArrayBuffer`;
- `width`, `height` (1–2048 pixels each), maximum 8 MiB encoded size;
- `session`, `sequence`, `received_at`, `timebase: "host-receipt"`;
- `mode: "live" | "replay" | "snapshot"`, `profile`, `calibrated: false`.

Receipt time is not the ultrasound capture time. The host source declares
`odb.video-source/1` and the single `ultrasound.preview` permission. Its bridge URL
is runtime context, excluded from compositions and shared test reports.

`VideoSession` from `@opendevicedb/components/video` prepares one to four consumers
before polling. A renderer implements `update(frame): Promise<void>` and `close()`.
The browser transfers a separate frame buffer to each sandboxed consumer, waits
for its matching `odb-video-rendered/1` acknowledgement and enforces a render time
budget. Slow consumers cannot build an unbounded frame queue. Disconnecting or
closing the dialog aborts requests and releases iframes, ports and bitmaps.

The isolated UI has no network, USB, camera, microphone or parent-document access.
Host-side retrieval is implemented explicitly; contributor source is not evaluated
with host permissions. Sources, artifacts and compositions retain exact digests.

## Provenance and validation limits

Known probe profiles must match the selected application. A legacy recorded replay
with no profile can be displayed only as **Recorded replay · Probe not identified**.
An unidentified live source is rejected. A known mismatched replay is also rejected.
Completed acquisitions are labelled **Last acquired image**, not as an ongoing live
feed. A lack of new frames does not create an artificial video stream.

The preview is uncalibrated and performs no distance measurement or diagnostic
interpretation. Automated tests use synthetic metadata and images only. They test
PNG decoding, replay labels, cancellation, isolation, origin/route restrictions,
metadata projection and responsive layout. They do not establish physical probe
compatibility, acoustic safety, image geometry or clinical suitability.

The initial scalar applications are now labelled **technical examples**: simulated
numbers are not measurements, and USB `deviceVersionMajor` is the major part of
`bcdDevice`, not the supported USB standard version. Imports, exports and fixture
tests live under **Files and tests (advanced)**. Only relevant file inputs and tests
are shown for the current composition.
