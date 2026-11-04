# HackRF One firmware update method — draft proposal

- Created: 2026-11-04T19:36:10Z
- Channel: OpenDeviceDB draft pull request
- URL: https://github.com/opendevicedb/opendevicedb/pull/29
- Head: 6dfb132f828ab97f2ea3d62d482a9d7b78979e7b
- Status: open draft; unmerged and undeployed.
- Verification: exact PR body read back; catalogue validation and production route-title checks passed. [CI passed on this head](https://github.com/opendevicedb/opendevicedb/actions/runs/41898533635). No firmware downloaded/flashed or radio test.

---

The HackRF One firmware route currently renders “Upload HackRF firmware in the stock web interface”, although the linked [official guide](https://hackrf.readthedocs.io/en/latest/updating_firmware.html) uses `hackrf_spiflash` over USB for normal SPI-flash updates. `vendor-upload` specifically denotes a stock web interface in OpenDeviceDB's route labels and MCP help.

Change this one curated route to `other`, which renders “Install HackRF firmware”, and name the required host tool and USB cable. Clarify the normal-update notes while retaining the existing HackRF One `.bin` constraints, version matching and separate `.dfu` recovery distinction. The host-software route, firmware status, project links and update guide remain intact. No renderer/schema change, new flashing procedure or hardware verification is included.

Validation: `npm run validate` passed with 30 curated / 31,207 imported records and zero errors. Checked the production `routeTitle` before/after, retained route fields and unchanged host-software route; `git diff --check` passed. No firmware downloaded or flashed, no radio test. Draft remains unmerged and undeployed.
