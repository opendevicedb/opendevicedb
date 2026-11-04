# grblHAL — controller discovery

- Published: 2026-11-04T20:25:44Z
- Channel: GitHub Discussion / Show and tell
- URL: https://github.com/grblHAL/core/discussions/1046
- Verification: author, category, title and exact body independently read back.
- Status: published; awaiting substantive feedback. No grblHAL importer, new controller record, firmware build or machine test.

---

Hi, I'm Sebastien, creator of [OpenDeviceDB](https://opendevicedb.org/), an independent [open-source catalogue](https://github.com/opendevicedb/opendevicedb) linking device models to firmware, drivers and tools. I'd like controller lookups to help people discover grblHAL and reach the correct upstream documentation.

Your [controller table](https://github.com/grblHAL/grblhal_docs/blob/b9bbf830540d36760791638551ad77cff74796f3/content/markdown/01-Getting-Started/03-controller-support.md) is a useful starting point. For example, Nucleo F411RE appears with different shields and board selections. Matching only the MCU or development-board name would lose that distinction.

A discovery entry would retain the controller revision, shield where required, hardware driver, firmware/build context and optional-plugin limits. Controller support would not become a claim about every machine using that controller.

I'd welcome feedback on useful fields and source links. I would handle the catalogue work. No grblHAL importer, new controller record, firmware build or machine test is implemented by this proposal.

Prepared with AI assistance.
