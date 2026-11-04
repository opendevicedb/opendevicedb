# probe-rs introduction

- Published: 2026-11-04T18:47:06Z
- Channel: GitHub Discussions / Show and tell
- Public post: https://github.com/probe-rs/probe-rs/discussions/4629
- Title: OpenDeviceDB: linking debug-probe models to probe-rs
- Verification: author, category, title and exact outgoing body independently read back.

---

Hi, I'm Sébastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an [open-source catalogue](https://github.com/opendevicedb/opendevicedb) connecting device models to open firmware, drivers and tools.

I'd like someone looking up their debug probe to discover probe-rs and its actual prerequisites. For example, an ST-Link V2 entry could link to your [setup documentation](https://probe.rs/docs/getting-started/probe-setup/#st-link), retaining its minimum firmware requirement and host-specific setup.

The probe model and the target MCU/board would need separate treatment: a recognised probe or an MCU target definition alone doesn't establish that a particular retail board can be debugged.

Would a small set of source-linked probe records be useful? I'd be happy to prepare them downstream, keeping your documentation authoritative. There is no dedicated probe-rs importer yet, and I haven't tested this hardware myself.

This introduction was prepared with AI assistance.
