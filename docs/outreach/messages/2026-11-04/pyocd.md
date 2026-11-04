# pyOCD

- Published: 2026-11-04T20:50:58Z
- Channel: GitHub discussion, Show and tell
- URL: https://github.com/pyocd/pyOCD/discussions/2070
- Title: OpenDeviceDB: linking board models to pyOCD target documentation
- Source baseline: https://github.com/pyocd/pyOCD/tree/0ce0fbd201010d617d7a4e3582c39b8e8561e33d
- Community route: https://github.com/pyocd/pyOCD/blob/0ce0fbd201010d617d7a4e3582c39b8e8561e33d/README.md#community-resources
- Verification: public author, category, title and exact body independently read back.
- Status: published; substantive response and adoption unconfirmed.

Historical outgoing message, preserved as published. No importer, new target definition, pack installation, probe connection or hardware test is claimed.

---

Hi everyone,

I'm Sebastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an independent open-source directory connecting device models to firmware, drivers, tools and protocol research. [Project source](https://github.com/opendevicedb/opendevicedb).

I'd like someone looking up a board to find pyOCD's target documentation and the relevant CMSIS-Pack, keeping the board, exact MCU part, debug probe and required pack version separate. Generic `cortex_m` detection would not be presented as flash-programming support.

Your current README points new target work towards DFPs and pack management towards `cpackget`. The board-ID documentation also recommends CMSIS-DAP v2.1 board/target information for new firmware. Would CMSIS-Pack board/device descriptions be the right primary sources for downstream links, with `board_ids.py` retained as a legacy lookup rather than a complete board catalogue?

I would maintain the catalogue links on my side and keep your documentation authoritative. This is a proposal: no pyOCD importer or hardware test has been completed, and I'm not requesting a new built-in target.

Thanks,
Sebastien

Prepared with AI assistance.
