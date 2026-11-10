# merbanan-rtl_433-3738

- Sent/published: 2026-10-25T07:52:20Z
- Channel: GitHub
- Public permalink: https://github.com/merbanan/rtl_433/discussions/3738
- Subject: OpenDeviceDB: the sensors rtl_433 decodes, searchable by model, each linking to its decoder
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi, and thank you for rtl_433. I'm sharing something built on your decoders, in case it's useful or you spot a problem.

[OpenDeviceDB](https://opendevicedb.org) is a free directory of devices that already work with open code or open firmware. The code is AGPL and the data is CC BY-SA. It brings the supported-device lists of 25 projects together in one search: Zigbee2MQTT, Z-Wave JS, Tasmota, ESPHome, OpenWrt, LineageOS, coreboot, QMK, SANE, Betaflight and more. Someone holding a device can look up its label and find which project already supports it, even if they had never heard of that project. Every record links back to the project it comes from.

From the decoder names in `src/devices/*.c` we list **470 sensors and remotes**, split into vendor and model. Each one links to the decoder file that handles it: https://opendevicedb.org/devices/?source=rtl_433 (for example https://opendevicedb.org/devices/acurite/00275rm/). Someone who searches for the model printed on a weather station finds that rtl_433 already reads it.

- Decoder names are free text, so the split into vendor and model is heuristic. If you see bad splits, tell me and I'll fix the importer.
- Protocol families (ERT, Wireless M-Bus, KeeLoq, "Generic …") are left out on purpose, because they aren't devices.


---
Disclosure: an AI assistant helped me write this post. I maintain OpenDeviceDB and checked everything in it.
