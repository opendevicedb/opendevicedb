# morluto-rea-4722

- Sent/published: 2026-10-17T08:06:38Z
- Channel: GitHub
- Public permalink: https://github.com/morluto/rea/discussions/4722
- Subject: Avoiding duplicate device reverse engineering: an opt-in lookup before analysis (OpenDeviceDB)
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

**Problem.** REA made it cheap to point an agent at a device's firmware or companion app and recover its protocol. A side effect is that many people now re-derive the same protocols for the same devices — abandoned drones, cameras whose cloud shut down, robots that only talk to a vendor app — and the results stay on private disks. Existing community databases (OpenWrt, Zigbee2MQTT, Tasmota, ESPHome, thingino…) each cover one category and none records work in progress.

**What we built.** [OpenDeviceDB](https://opendevicedb.org) is an independent, open directory keyed by device model. It aggregates those databases (about 11,600 devices today, each linking back to its source) and adds what they don't track: who is working on a device, how far it goes (partial protocol → controllable → open firmware) and whether it was verified on real hardware. Agents reach it through an MCP server, [`@opendevicedb/mcp`](https://www.npmjs.com/package/@opendevicedb/mcp):

- `lookup_device` / `search_devices` — read-only, against the public static API;
- `claim_device` / `publish_findings` — write to a local checkout of the data repository; the contributor opens the pull request themselves.

Data is CC BY-SA 4.0, code AGPL-3.0. The [content policy](https://opendevicedb.org/policy/) excludes proprietary firmware images, keys, DRM or access-control bypass, and anything aimed at safety or compliance functions (Remote ID, geofencing, radio limits).

**Desired outcome.** When a REA user starts on a *physical device*, their agent checks whether the work already exists before spending hours on it, and can share the result afterwards. No change to REA's analysis capabilities is needed.

**Possible shapes, from least to most involvement — happy with any of them, or none:**

1. A line in REA's docs pointing device-focused users to OpenDeviceDB.
2. An optional agent skill (we wrote one, [`SKILL.md`](https://github.com/opendevicedb/opendevicedb/blob/main/packages/mcp/SKILL.md), CC0 so it can be copied into an MIT project) that says: before reverse engineering a device, call `lookup_device`; when done, offer `publish_findings`. Installed separately from REA, no new REA tool.
3. Something REA-native, if maintainers see value — but only after a scope decision.

**Boundaries, stated explicitly.**

- Network: a lookup sends only the vendor/model or an identifier (FCC ID, USB VID:PID, BLE name) to opendevicedb.org. No binaries, captures or target data leave the machine. Nothing happens unless the user installs the MCP server.
- Execution and mutation: none. The server reads JSON and, in local mode, writes a YAML file in a git checkout.
- Unknowns: we have not measured token cost for agents; the lookup result is a short JSON object plus a one-line recommendation.

Is this useful to REA users, and if so which shape — if any — would you prefer? Feedback on the record format is also welcome: [SPEC.md](https://github.com/opendevicedb/opendevicedb/blob/main/SPEC.md).

*Disclosure: OpenDeviceDB was built with AI assistance (Claude Code); I'm the human owner and will answer for it.*
