# OpenDeviceDB

[![Website](https://img.shields.io/badge/website-opendevicedb.org-1f4fc4)](https://opendevicedb.org)
[![npm](https://img.shields.io/npm/v/@opendevicedb/mcp?label=MCP%20server)](https://www.npmjs.com/package/@opendevicedb/mcp)
[![Code: AGPL-3.0](https://img.shields.io/badge/code-AGPL--3.0-blue)](LICENSE)
[![Data: CC BY-SA 4.0](https://img.shields.io/badge/data-CC%20BY--SA%204.0-green)](LICENSE-DATA.md)

English | [简体中文](README.zh-CN.md)

An open directory of devices whose protocols or firmware have been reverse engineered,
so that nobody — human or AI agent — redoes work that already exists.

- **Humans**: browse the directory, device pages and news on the website (`site/`).
- **Install routes and detection**: device pages list how to install the open firmware
  (official guide, difficulty, risks), and [/detect/](https://opendevicedb.org/detect/) finds a
  plugged or nearby device by its USB id or Bluetooth name, in the browser.
- **Freedom**: each project says what stays non-free (vendor blobs, modem, Wi-Fi…) and whether the
  vendor cloud is still needed; the directory filters devices that work with no cloud.
- **Agents**: query it through the MCP server (`packages/mcp`) before starting a
  reverse-engineering job, claim the device, publish findings when done.
- **Existing databases** (34 today: OpenWrt, Zigbee2MQTT, Z-Wave JS, Tasmota, ESPHome,
  tuya-local, OpenRGB, libgphoto2, LineageOS, postmarketOS/Nura, coreboot, rtl_433,
  Gadgetbridge, Klipper, Marlin, Rockbox, Valetudo, thingino, tuya-cloudcutter, QMK, SANE,
  OpenPrinting, libwacom, Betaflight, EdgeTX, and for cameras CHDK, Magic Lantern, OpenMemories,
  pktriggercord, Fujihack, plus AsteroidOS watches, Network UPS Tools, sigrok measurement
  instruments and GP2040-CE controllers…) are aggregated by importers
  (`packages/importers`), with a link back to each source.

If it is useful to you, a ⭐ helps people with the same devices find it.

Contributions don't have to be complete: a single verified fact about a protocol (a BLE
characteristic, a checksum, UART pins) helps the next person or agent go faster. See
[Contribute](https://opendevicedb.org/contribute/#partial).

See [SPEC.md](SPEC.md) for the design and [POLICY.md](POLICY.md) for what we accept.

An [experimental fwupd declaration index](docs/fwupd-index.md) preserves plugin
identifiers and their source context for future device mapping. It is separate
from the device catalogue.

```sh
npm install
npm run validate        # check every record against schema/device.schema.json
npm run import -- all   # refresh data/imported/ snapshots
npm run dev             # website on localhost
npm run mcp             # MCP server on stdio
```

Code: AGPL-3.0-or-later (see LICENSE). Data: CC BY-SA 4.0 (see LICENSE-DATA.md).
