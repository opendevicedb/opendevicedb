# BuildCores OpenDB — source-linked catalogue discovery

- Published: 2026-11-04T19:58:40Z
- Channel: GitHub Discussion / Show and tell
- URL: https://github.com/buildcores/buildcores-open-db/discussions/443
- Verification: author, category, title and exact body independently read back.
- Status: published; awaiting substantive feedback. No BuildCores importer, data merge or licensing commitment.

---

Hi everyone,

I'm Sebastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an independent [open-source catalogue](https://github.com/opendevicedb/opendevicedb) connecting device models to firmware, drivers and tools.

I noticed your README's plans for manufacturer URLs, manuals and motherboard BIOS/CPU-support sources. Our catalogues seem complementary: component specifications and product identity on your side, discovering open software for a device on ours.

Would source-linked references between the projects be useful? I'd start with a small, explicitly matched set of models rather than match names across entire product families. Your stable `opendb_id`, versioned identity snapshot and manufacturer/series/variant fields are distinct from firmware targets or USB/PCI identifiers; I'd preserve those distinctions.

I'd welcome feedback on useful starting categories and a preferred stable product-link format. I would handle the OpenDeviceDB work. No BuildCores importer or data merge exists; I read your CC BY-NC-SA licensing notice and wouldn't assume its data can simply be relicensed into another catalogue.

Thanks,
Sebastien

Prepared with AI assistance.
