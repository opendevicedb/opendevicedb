# fwupd identifier proposal in OpenDeviceDB

- Published: 2026-11-04T16:10:24Z
- Channel: OpenDeviceDB issue
- Public evidence: https://github.com/opendevicedb/opendevicedb/issues/19
- Title: Index fwupd plugin identifiers with runtime, bootloader and support constraints

This is a downstream implementation proposal, not a new community contact or an implemented importer.

---

Following [hughsie's suggestion](https://github.com/fwupd/fwupd/discussions/11346#discussioncomment-19397020), investigate a downstream index of device identifiers from fwupd plugin `.quirk` files. A lookup should lead to the existing plugin and protocol documentation while preserving the limits of what the match means.

Reviewed upstream snapshot: [`a2c433bf8a0be61757d12bb1f1d05b9c83766865`](https://github.com/fwupd/fwupd/tree/a2c433bf8a0be61757d12bb1f1d05b9c83766865).

Concrete cases from the initial source review:

| Example | Source evidence | Consequence for an importer |
| --- | --- | --- |
| Logitech Unifying receiver | Runtime `HIDRAW\VEN_046D&DEV_C52B`; bootloader `USB\VID_046D&PID_AAAA` with `CounterpartGuid` pointing to the runtime instance. [Quirks](https://github.com/fwupd/fwupd/blob/a2c433bf8a0be61757d12bb1f1d05b9c83766865/plugins/logitech-hidpp/logitech-hidpp.quirk), [plugin documentation](https://github.com/fwupd/fwupd/blob/a2c433bf8a0be61757d12bb1f1d05b9c83766865/plugins/logitech-hidpp/README.md). | Retain bus/instance type and runtime/bootloader relationships. Do not turn HIDRAW, BLE or tunneled IDs into unconditional USB matches. |
| SteelSeries Aerox 3 Wireless | Receiver `1038:1838` / bootloader `1038:1839` is distinct from mouse `1038:183A` / bootloader `1038:183B`. Bluetooth and receiver-tunnel identifiers are also present. [Quirks](https://github.com/fwupd/fwupd/blob/a2c433bf8a0be61757d12bb1f1d05b9c83766865/plugins/steelseries/steelseries.quirk). | Preserve receiver versus peripheral and transport distinctions; a bootloader or receiver ID is not a new retail mouse model. |
| SteelSeries Rival 100 | `USB\VID_1038&PID_1702` is present in the quirks; the [plugin README](https://github.com/fwupd/fwupd/blob/a2c433bf8a0be61757d12bb1f1d05b9c83766865/plugins/steelseries/README.md) limits support to obtaining the version number and says vendor updates are unavailable. | A plugin match does not prove that a firmware update exists, that all functions are supported, or that the device firmware is open source. |
| RP2040 UF2 bootloader | `USB\VID_2E8A&PID_0003` links to a UF2 family; the same file also contains many chip-family entries. [Quirks](https://github.com/fwupd/fwupd/blob/a2c433bf8a0be61757d12bb1f1d05b9c83766865/plugins/uf2/uf2.quirk). | A shared bootloader/family ID must not be expanded into invented retail-device records. |

Proposed first scope:

- Index explicit identifiers with their original instance string, plugin, source permalink and revision, any explicit device name, and runtime/bootloader/receiver context. Keep uncertain physical-model mappings unresolved.
- Link plugin documentation and preserve applicable restrictions. Distinguish identifier discovery, host-side open software, firmware availability/licensing and actual hardware verification.
- Start with a small reviewed sample and negative cases for the examples above before enabling a bulk import. Preserve upstream attribution and licensing.

This is a research/implementation proposal. No fwupd importer, live device matching or LVFS integration has been implemented as part of this issue, and no firmware was downloaded or flashed.

Written with AI assistance.
