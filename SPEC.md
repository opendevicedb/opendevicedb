# OpenDeviceDB — specification (prototype v0)

## Problem

Since AI agents (REA, Claude Code, Codex…) made reverse engineering cheap, thousands of
people re-derive the same protocols for the same devices: an abandoned drone, a camera
whose cloud was shut down, a vacuum robot that only talks to its vendor app. The results
stay on private disks. Existing community databases (OpenWrt ToH, Zigbee2MQTT,
Gadgetbridge, Tasmota, ESPHome, OpenIPC…) each answer *"which free firmware runs on this
model"* for one category. None answers, across categories:

- has this device's protocol already been reverse engineered, and where is the result?
- is someone working on it right now?
- how far does it go (documented protocol, SDK, full free firmware) and was it verified?

## Goal

One open directory, keyed by device model, that:

1. **agents query by themselves** before starting a reverse-engineering job (MCP tool),
   and publish to when they finish;
2. **humans browse** as a website: directory, device pages, news, how to contribute;
3. **aggregates** the existing category databases instead of competing with them, so
   coverage is broad from day one and every record links back to its source project.

## Principles

- **P1 — Files in git are the database.** One YAML file per curated device under
  `data/devices/<vendor>/<model>.yaml`, validated by `schema/device.schema.json`,
  changed by pull request. No server-side database; the site and the API are static
  builds of the repository.
- **P2 — Aggregate, don't duplicate.** Importers snapshot external databases into
  `data/imported/<source>.json` (slim records + link back). Curated files override
  and enrich imported records for the same device id.
  Devices that only speak a standard, published protocol (MTP, eSCL/AirScan, PostScript/PCL)
  are left out of imports: nothing about them needed reverse engineering.
- **P3 — Claims prevent duplicate work.** A `claims` entry says "someone is working on
  this, scope X, until date Y, contact Z". Claims expire; an expired claim is ignored.
- **P4 — AI output is not trusted by default.** Every interface carries a `confidence`
  and every record a `verification` list. The "verified" badge requires a replayable
  test (`hardware-replay`) run on a real device with a stated firmware version.
- **P5 — Legally boring.** We host protocol descriptions, original code and links.
  We never host proprietary firmware images, keys, or copyrighted vendor code.
  We exclude anything whose purpose is to defeat a regulatory safety function
  (drone Remote ID, geofencing, radio power limits, emissions controls…). See `POLICY.md`.
- **P6 — Independent and open.** Code AGPL-3.0-or-later (a hosted fork must publish its changes), data CC-BY-SA-4.0. The agent skill file (`packages/mcp/SKILL.md`) is CC0 so other tools (e.g. REA, MIT) can embed it. No vendor affiliation.

## Device record (summary — the JSON Schema is normative)

| field | meaning |
|---|---|
| `id` | `<vendor-slug>/<model-slug>`, lowercase, `[a-z0-9-]` |
| `vendor`, `model`, `aliases` | display names |
| `category` | enum, see schema |
| `identifiers` | `fcc_id`, `usb` (`vid:pid`), `ble_names`, `chips`, `sku` — used for lookup |
| `status` | `unknown` → `in-progress` → `partial-protocol` → `controllable` → `open-firmware` |
| `summary` | one paragraph, plain text |
| `interfaces[]` | per transport: `name`, `transport`, `status`, `confidence`, `spec` (url) |
| `projects[]` | existing work: `name`, `url`, `kind`, `license` |
| `claims[]` | `who`, `contact`, `scope`, `since`, `expires` |
| `verification[]` | `method`, `by`, `date`, `firmware`, `notes` |
| `provenance` | `sources[]`, `ai_assisted`, `tools[]` |
| `updated` | ISO date |

Status meaning:

- `unknown` — the device is listed, nothing public is known.
- `in-progress` — at least one live claim, no usable result yet.
- `partial-protocol` — part of the protocol is documented (e.g. telemetry, not control).
- `controllable` — the device can be fully driven by open code over its stock firmware.
- `open-firmware` — a free replacement firmware exists.

## Repository layout

```
schema/device.schema.json     normative record schema
data/devices/**.yaml          curated records (hand- or agent-written, PR reviewed)
data/imported/<source>.json   importer snapshots {source, fetched_at, records[]}
news/YYYY-MM-DD-slug.md       news posts (frontmatter: title, date, summary, tags)
packages/core                 load + validate + merge + search (TypeScript, used by all)
packages/importers            one module per external source, `npm run import -- <source>`
packages/mcp                  MCP server for agents (lookup, search, claim, publish)
site/                         Astro static site: directory, device pages, news, API json
```

## Static API (built by the site)

- `/api/index.json` — `[{id, vendor, model, category, status, sources[], identifiers}]`
- `/api/devices/<vendor>/<model>.json` — full merged record
- `/api/wanted.json` — open device requests, grouped by id (see "Requests")

The MCP server reads this API remotely (`ODB_API_URL`) or the local repository
(`ODB_REPO`), so it works before and after the site is online.

## Requests ("wanted")

Someone who cannot find a device, or finds nothing usable, says they want it. A request is a
GitHub issue opened from `.github/ISSUE_TEMPLATE/wanted.yml` (label `wanted`: vendor, model,
category, identifiers, goal, policy checkbox). No server: the site reads open issues at build
time (`core/wanted.ts`).

- **Interest** = the author + every 👍 on the issue. Requests for the same id (`makeId(vendor,
  model)`) add up; the oldest is the one to vote on.
- **Visible** in directory search (badge "👍 N want it"; requests for devices not in the
  directory are searchable entries linking to the issue), on device pages while the status is
  below `partial-protocol`, on `/wanted/` (ranked) and in `/api/wanted.json`:
  `[{id, vendor, model, category?, identifiers[], votes, url, issues[], opened}]`.
- **Triage** (`scripts/wanted-triage.ts`, workflow `wanted.yml`): duplicates are pointed to the
  first request and closed; a goal the policy screen flags is labelled `policy` for a human;
  each request gets one comment recording what the registry held (`<!-- odb-triage id rank -->`).
  A request closes itself, with a link, when its device (same id or a shared identifier, never a
  fuzzy match) reaches `partial-protocol` or better *after* it was seen; a request for a device
  that was already usable stays open as interest in more.
- **Agents** never post: `request_device` and `lookup_device` return the existing request or a
  pre-filled issue link, and the person reviews and submits it.

Limits: a GitHub account is needed to request or vote; counts refresh every 6 hours and on
issue events.

## MCP tools (v0)

| tool | effect |
|---|---|
| `search_devices(query, category?, status?)` | ranked matches by name, alias, identifiers |
| `lookup_device(vendor?, model?, fcc_id?, usb?, ble_name?)` | best match + full record + live claims; says explicitly "nothing known" when so |
| `claim_device(id or vendor+model, who, contact, scope, days)` | adds a claim (creates a stub record if needed) |
| `publish_findings(id, record_patch)` | merges findings into the record, validates, writes it |
| `request_device(vendor, model, identifiers?, goal?)` | existing request to 👍, or a pre-filled request link; never posts |
| `list_sources()` | imported sources with record counts and snapshot dates |

In v0 writes go to the local repository checkout; the contributor opens the PR
(`gh pr create`). v1 will open the PR itself.

## Out of scope for v0

Accounts, comments, a write API, hosting of binaries, automatic verification.

## Roadmap (ideas, to be specified before any code)

- **R1 — Guided installer.** Built on 2026-10-17, see the section below.
- **R2 — Preserving open binaries (BitTorrent).** Keep open builds available when a
  project's download server disappears. Limits from P5: only binaries whose licence allows
  redistribution, never vendor images; GPL binaries travel with their corresponding source;
  each record stores the hash (and upstream signature when there is one) checked against
  upstream at capture time, plus the magnet link. Existing archives come first (Internet
  Archive for binaries, Software Heritage for source). Needs a legal review before
  anything is seeded. (Owner, 2026-10-17.)
- **R3 — Composable device applications.** Draft specification dated 2026-11-05:
  [English specification (OKF)](knowledge/specifications/composable-applications.md)
  and [French discussion](docs/specs/composable-applications.fr.md). Independent
  free WASM modules, device adapters and web UI components are assembled visually
  into reusable applications, with community-contributed WASM ports and hardware
  testing. Components, contracts, compositions and tests initially stay in this
  repository, independently of device records. Processing and UI components can
  also be discovered and used without a connected device or an associated record.
  Both device pages and connected USB device analysis expose compatible
  functions, applications and components directly. Ready-to-use applications are
  the default entry point; visual composition is a customization mode. The proposal
  includes desktop app export and MCP-based component discovery/integration for
  apps built by AI agents. Formats, runtime,
  isolation and delivery choices are proposed, not implemented or finalized.
  Components expose inspectable contracts, behavior, matching sources and tests;
  direct WASM/WAT authoring is supported as a proposed path alongside compiled ports.
  The [first implementation pilot](knowledge/implementation/component-pilot.md)
  supplies a registry, locked scalar compositions, a browser host and read-only
  MCP integration. Desktop package generation, full visual composition and spatial
  capture remain outstanding requirements.

## Freedom: what stays non-free or cloud-bound (2026-10-25)

**Why.** "Runs a free OS" is not "fully free". FSFE (Upcycling Android) asked for clear
information on remaining proprietary components and cloud dependencies; we promised it.

**Data.** Each entry in `projects` may carry a `freedom` object, describing the device *once
that project is in use*:

| field | meaning |
|---|---|
| `nonfree` | components that still need proprietary code: `vendor-blobs` (files extracted from the stock firmware, e.g. LineageOS), `device-firmware` (the stock firmware stays, the project only talks to it), `modem`, `gpu`, `wifi`, `bluetooth`, `camera`, `sensors`, `bootloader`, `other`. `[]` means nothing non-free is known to remain; absent means unknown. |
| `cloud` | `none` (works fully locally), `setup-only` (a vendor account is needed once, e.g. to obtain a local key), `optional`, `required`, `unknown` |
| `notes` | one sentence, plain text |

Values come from the project's own documentation, never guessed. Importers set only what is
true for every device of that source (e.g. Zigbee2MQTT: `device-firmware`, cloud `none`);
curated records refine per device. `IndexEntry` gains `cloud` (the best value across
projects, `none` first) so the directory can filter "works without the cloud".

**Site.** On the device page, each project shows "Still non-free: …" and "Cloud: …", with a
short legend; the directory gets a "No cloud" filter. Same data in the JSON API and in the MCP
`lookup_device` answer.

## R1 — Guided installer (agreed and built 2026-10-17)

**Goal.** On a device page, someone who does not code sees in 30 seconds whether there is a
way to put open firmware or software on it, what it takes, what can go wrong, and which
official guide or installer to follow. We link to each project's own tools; nothing is
flashed from opendevicedb.org.

**Data: `install` routes.** A record gains an `install` list; a device can have several
routes (e.g. cloudcutter over the air, or serial flashing). Each route:

| field | meaning |
|---|---|
| `project` | name of the project in `projects` this route installs |
| `method` | `web-serial` (browser installer), `ota-exploit` (e.g. cloudcutter), `vendor-upload` (stock web UI accepts the image, e.g. OpenWrt factory image), `usb-bootloader` (fastboot/DFU, phones), `sd-card` (3D printers), `serial` (UART, device opened), `spi-programmer`, `pairing` (no flashing: Zigbee/Z-Wave/BLE pairing) |
| `guide` | URL of the official step-by-step guide (required) |
| `installer` | URL of the official installer tool, when one exists (web.esphome.io, Tasmota web installer, OpenWrt Firmware Selector…) |
| `difficulty` | `easy` (no tools, device stays closed), `medium` (cable or command line), `hard` (opening, soldering, programmer) |
| `tools` | what to buy or have (e.g. "USB-serial adapter, 3.3 V") |
| `opens_device`, `mains_powered` | safety flags |
| `brick_risk` | `low` / `medium` / `high` |
| `reversible` | `yes` / `no` / `partial`, with `revert` = URL of the back-to-stock guide |
| `firmware_constraints` | e.g. "Tuya firmware patched after 2.x: does not work" |

**Sources.** Both, in parallel: importers fill routes they can derive deterministically
(LineageOS and postmarketOS per-device install pages, cloudcutter, OpenWrt, Klipper/Marlin
SD-card flashing, Zigbee2MQTT/Z-Wave JS pairing, Tasmota/ESPHome web installers where the
source says the device is flashable without opening); curated YAML adds or corrects routes
for popular and most-requested devices.

**Site.** A "Get started" block on the device page: one card per route (difficulty, time,
tools, risk, reversible), a checklist (back up first, battery charged, exact model and
firmware version checked), and a button to the official guide or installer. Mains-powered
devices that must be opened get a warning and a plain link, never a guided flow. Same data
in `/api/devices/<id>.json`, and `lookup_device` returns it so an agent can walk a user
through it.

**Install reports.** A GitHub issue form `install-report.yml` (device id, route, firmware
version before, project version, result `worked` / `failed` / `partly`, notes), label
`install-report`. Like requests, the site fetches them at build time and shows per route
"N worked, M failed (latest: firmware X)". Maintainers can turn a report into a `manual`
verification entry; reports never change a record automatically.

**Device detection (v1).** A "Detect my device" button, run entirely in the browser
(nothing is sent anywhere; the lookup uses the static index):
- WebUSB: reads the USB vid:pid of a plugged device (phones in fastboot/ADB mode, cameras,
  RGB peripherals, printers' boards) and matches `identifiers.usb`;
- Web Bluetooth: reads the advertised BLE name (watches, bands, lights) and matches
  `identifiers.ble_names`;
- WebSerial: only identifies the USB-serial adapter, not the device: the page says so and
  asks for the label instead.
Chrome/Edge only; other browsers, routers and network devices fall back to the existing
label search (model, FCC ID, sku). When several records match, the page lists them.

**Out of R1.** Flashing from our pages, a desktop installer app, hosting binaries (R2).
