# TinyUSB

- Published: 2026-11-04T21:10:10Z
- Channel: GitHub discussion, General
- URL: https://github.com/hathach/tinyusb/discussions/4431
- Title: OpenDeviceDB: source links from board models to TinyUSB examples
- Source baseline: https://github.com/hathach/tinyusb/tree/91cdc7bbb4d85a3ecb4c8c640297d9c401ff4390
- Community route: https://github.com/hathach/tinyusb/blob/91cdc7bbb4d85a3ecb4c8c640297d9c401ff4390/README.rst#getting-started
- Board reference: https://github.com/hathach/tinyusb/blob/91cdc7bbb4d85a3ecb4c8c640297d9c401ff4390/docs/reference/boards.rst
- Verification: public author, category, title and exact body independently read back.
- Status: published; substantive response and adoption unconfirmed.

Historical outgoing message, preserved as published. No TinyUSB checkout change, PR, importer, record, example build, SDK installation or hardware test completed for this proposal.

---

Hi everyone,

I'm Sebastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an independent open-source directory linking physical device models to firmware, drivers, tools and protocol research. [Project source](https://github.com/opendevicedb/opendevicedb).

I'd like a board lookup to help people find TinyUSB's relevant examples. Your board reference makes an important distinction: BSP code is for self-contained examples and testing, rather than the way TinyUSB is integrated into a larger project.

For downstream discovery, would you recommend the board-reference table plus `hw/bsp/FAMILY/boards/BOARD_NAME/` as the primary sources? I'd keep the BOARD name, release and host/device/controller-port requirements explicit, with links back to your getting-started guide.

I would maintain the catalogue links on my side. This is a source-selection proposal; no TinyUSB importer, new record, example build or hardware test has been completed.

Thanks,
Sebastien

Prepared with AI assistance.
