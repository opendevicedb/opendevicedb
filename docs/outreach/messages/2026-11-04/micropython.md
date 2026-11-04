# MicroPython — exact-board firmware discovery

- Published: 2026-11-04T20:10:13Z
- Channel: GitHub Discussion / Show and tell
- URL: https://github.com/orgs/micropython/discussions/19886
- Verification: author, category, title and exact body independently read back.
- Status: published; awaiting substantive feedback. No MicroPython importer, new board record, firmware build/flash or hardware test.

---

Hi everyone,

I'm Sebastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an independent [open-source catalogue](https://github.com/opendevicedb/opendevicedb) connecting device models to firmware, drivers and tools. I'm sharing it here because I'd like board lookups to help people discover MicroPython and reach the correct upstream download page.

For example, [Pico](https://micropython.org/download/RPI_PICO/) and [Pico W](https://micropython.org/download/RPI_PICO_W/) have separate board pages. A shared RP2040 chip wouldn't justify treating their firmware or wireless capabilities as interchangeable. Release and preview builds also need to stay distinct.

My proposed entries would preserve the port, exact board/variant, release context and official installation/documentation links. A board definition or supported MCU wouldn't become a claim that every attached peripheral works.

I'd welcome feedback on whether this discovery approach would help, and what a useful entry should retain. I would handle the downstream catalogue work. No MicroPython importer, new board record or hardware test has been implemented by this proposal.

Thanks,
Sebastien

Prepared with AI assistance.
