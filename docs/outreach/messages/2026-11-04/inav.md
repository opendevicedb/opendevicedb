# INAV — model and firmware-target discovery

- Published: 2026-11-04T19:48:39Z
- Channel: GitHub Discussion / Show and tell
- URL: https://github.com/iNavFlight/inav/discussions/12203
- Verification: author, category, title and exact body independently read back.
- Status: published; awaiting substantive feedback. No INAV importer, new record or hardware test.

---

Hi everyone,

I'm Sebastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an independent [open-source catalogue](https://github.com/opendevicedb/opendevicedb) connecting device models to firmware, drivers and tools.

I'd like someone looking up their flight controller to find the relevant INAV documentation, with the exact board variant, firmware target, release and Configurator requirements preserved. A target present in a development branch is not necessarily an officially released build.

For example, the [MATEKF405TE target definitions](https://github.com/iNavFlight/inav/blob/b006087bf26a12f3f7df478af4c6170d16b22755/src/main/target/MATEKF405TE/CMakeLists.txt) include separate MATEKF405TE and MATEKF405TE_SD targets. The [README's F411 notice](https://github.com/iNavFlight/inav/blob/b006087bf26a12f3f7df478af4c6170d16b22755/readme.md) also makes release limits important. Neither a shared MCU nor a similarly named board would justify a compatibility claim.

Would this kind of discovery entry be useful? Is there a preferred maintained source mapping retail board models/revisions to targets? I would handle the downstream catalogue work and link back to the official docs. No INAV importer, new record or flight-controller test has been implemented by this proposal.

Thanks,
Sebastien

Prepared with AI assistance.
