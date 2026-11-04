# Fujihack research-scope correction proposal

- Published: 2026-11-04T16:38:43Z
- Channel: OpenDeviceDB draft pull request
- Public evidence: https://github.com/opendevicedb/opendevicedb/pull/21
- Title: Separate Fujihack research headers from documented debugger ports
- Commit: b18b483e4d109a623f499419efed4c9517e55fcd

This is a tested downstream correction proposed for review, not a merged change or a new community contact.

---

A Fujihack model header contains research definitions, but does not establish that the USB debugger works for that model and firmware. The importer currently gives every header-backed record an installation route and describes it as a debugger port.

Keep all ten camera records as partial-protocol research entries. Offer the experimental installation route only for the two model/firmware pairs documented upstream: X-A2 1.30 and XF1 1.01. For example, the X-T2 4.40 record retains its research link but no longer advertises an unverified debugger installation. Future or alternate firmware versions require explicit support evidence before acquiring a route.

Sources: [upstream README snapshot](https://github.com/fujihack/fujihack/blob/754acff9aa0322df19446cf7eca699b221c3330d/README.md), [official hacked-model list](https://fujihack.org/#hacked-models), and the corresponding model headers. Regenerate `data/imported/fujihack.json` and add regression coverage for header-only entries, documented ports and undocumented firmware versions. These are upstream documentation assertions; no new hardware tests were performed.

Validation: `npm run import -- fujihack` (10 records, zero invalid); `npm run validate` (30 curated and 31,207 imported records, zero errors); core, importer, MCP and script tests (211 tests passed); `git diff --check`.
