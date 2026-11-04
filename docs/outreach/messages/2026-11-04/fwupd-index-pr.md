# fwupd declaration index — draft PR 25

- Date: 2026-11-04
- Channel: OpenDeviceDB draft pull request
- Public proposal: https://github.com/opendevicedb/opendevicedb/pull/25
- Title: feat: add experimental fwupd quirk declaration index
- Head: `3b0dcc5419c903122f218560248a5fbb5470d56d`
- Verification: author, draft/open state, head and exact proposal body read back.

Historical outgoing proposal, preserved as submitted. CI passed on the exact head after publication. This is a three-plugin research index; the draft is unmerged/undeployed and not connected to user-facing device lookup. No hardware test.

---

fwupd quirk identifiers include runtime/bootloader modes, receivers, tunneled peripherals and generic chip families. Treating each section as a retail device would produce false matches and support claims.

Add an experimental declaration index as the first implementation step for #19. Preserve original instance strings, namespaces, ordered properties, duplicate declarations and pinned source/documentation links. Provide exact instance lookup and a CLI that requires an immutable revision. Keep this dataset separate from normal device imports, site/MCP lookup and detection while physical-model mapping remains unresolved.

The checked-in sample contains all 104 sections from Logitech HID++, SteelSeries and UF2 at fwupd commit `17b23256a336478d6b5d71b714e7b4be7570a50f`. Documentation explains the Rival 100 version-reading restriction, receiver/peripheral distinctions, shared UF2 identity and the limits of raw quirk declarations. It links upstream licensing and sources without claiming to reproduce fwupd matching semantics.

Validation: 154 importer tests passed, including seven new regression tests; catalogue validation passed (30 curated and 31,207 imported records, zero errors). The CLI generated the sample from upstream, and an independent source comparison reproduced all sections and properties exactly. Invalid mutable revisions leave existing output untouched. No device enumeration, firmware download, flashing or hardware test was performed.

Refs #19; physical-model mapping and user-facing lookup remain further work. Prepared with AI assistance. This draft is unmerged and undeployed.
