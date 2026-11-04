# zwave-js-zwave-js-9405

- Sent/published: 2026-10-25T07:52:59Z
- Channel: GitHub
- Public permalink: https://github.com/zwave-js/zwave-js/discussions/9405
- Subject: OpenDeviceDB: the Z-Wave JS device database, searchable by product id next to 24 other open projects
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi, and thank you for Z-Wave JS. I'm sharing something built on your device config database, in case it's useful or you spot a problem.

[OpenDeviceDB](https://opendevicedb.org) is a free directory of devices that already work with open code or open firmware. The code is AGPL and the data is CC BY-SA. It brings the supported-device lists of 25 projects together in one search: Zigbee2MQTT, Z-Wave JS, Tasmota, ESPHome, OpenWrt, LineageOS, coreboot, QMK, SANE, Betaflight and more. Someone holding a device can look up its label and find which project already supports it, even if they had never heard of that project. Every record links back to the project it comes from.

From `packages/config/config/devices` we list **2,324 devices**. Each record carries its manufacturer, product type and product id, so it can be found by those ids, and it links to its config file: https://opendevicedb.org/devices/?source=zwave-js

- Labels with conditionals or "A / B" variants are split into separate records. If some come out wrong, tell me and I'll fix the importer.
- Would you rather we linked to devices.zwave-js.io than to the config file on GitHub?


---
Disclosure: an AI assistant helped me write this post. I maintain OpenDeviceDB and checked everything in it.
