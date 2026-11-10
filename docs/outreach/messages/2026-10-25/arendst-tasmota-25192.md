# arendst-Tasmota-25192

- Sent/published: 2026-10-25T07:52:11Z
- Channel: GitHub
- Public permalink: https://github.com/arendst/Tasmota/discussions/25192
- Subject: OpenDeviceDB lists the 2,824 devices from the Tasmota templates repository, each linking back to its template
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi, and thank you for Tasmota (and to blakadder for the templates site). I'm sharing something built on the templates, in case it's useful or you spot a problem.

[OpenDeviceDB](https://opendevicedb.org) is a free directory of devices that already work with open code or open firmware. The code is AGPL and the data is CC BY-SA. It brings the supported-device lists of 25 projects together in one search: Zigbee2MQTT, Z-Wave JS, Tasmota, ESPHome, OpenWrt, LineageOS, coreboot, QMK, SANE, Betaflight and more. Someone holding a device can look up its label and find which project already supports it, even if they had never heard of that project. Every record links back to the project it comes from.

The [Tasmota device templates](https://templates.blakadder.com/) give us **2,824 devices**. Each record links to its template page, and the install section points to the official flashing guides: https://opendevicedb.org/devices/?source=tasmota (for example https://opendevicedb.org/devices/sonoff/basic/).

- We say plainly that Tasmota is free while the ESP Wi-Fi libraries it links stay closed. Please correct me if that's misleading.
- Data fixes belong in the templates repository. If anything looks wrong on our side, tell me and I'll fix the importer.


---
Disclosure: an AI assistant helped me write this post. I maintain OpenDeviceDB and checked everything in it.
