# Zephyr — board and toolchain discovery

- Published: 2026-11-04T20:20:04Z
- Channel: GitHub Discussion / Show and tell
- URL: https://github.com/zephyrproject-rtos/zephyr/discussions/124669
- Verification: author, category, title and exact body independently read back.
- Status: published; awaiting substantive feedback. No dedicated importer, new board record, compiler/firmware build or hardware test.
- Formatting: brief factual introduction; automatic coding-tool attribution trailer omitted under the project's published guidance.

---

I'm Sebastien, creator of [OpenDeviceDB](https://opendevicedb.org/), an independent [open-source catalogue](https://github.com/opendevicedb/opendevicedb) linking device models to firmware, drivers and tools. I would like board lookups to direct users to Zephyr's official documentation.

The [nRF5340 DK documentation](https://github.com/zephyrproject-rtos/zephyr/blob/244c4a8284cb62bda585a9ab6a76cd46f0a5b9d5/boards/nordic/nrf5340dk/doc/index.rst) gives a useful example. `nrf5340dk/nrf5340/cpuapp` and `nrf5340dk/nrf5340/cpunet` address different cores on one board. A downstream record should preserve board revision, SoC/core qualifiers, release context and documented feature limits. A build target alone would not establish that every peripheral works.

I'd welcome feedback on useful sources and fields for these references. I would handle the catalogue work. No Zephyr importer, new board record, firmware build or hardware test is implemented by this proposal.
