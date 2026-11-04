# betaflight-betaflight-15899

- Sent/published: 2026-10-25T07:52:39Z
- Channel: GitHub
- Public permalink: https://github.com/betaflight/betaflight/discussions/15899
- Subject: OpenDeviceDB lists every Betaflight board target, with its MCU and a link to its config
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi, and thank you for Betaflight. I'm sharing something built on betaflight/config, in case it's useful or you spot a problem.

[OpenDeviceDB](https://opendevicedb.org) is a free directory of devices that already work with open code or open firmware. The code is AGPL and the data is CC BY-SA. It brings the supported-device lists of 25 projects together in one search: Zigbee2MQTT, Z-Wave JS, Tasmota, ESPHome, OpenWrt, LineageOS, coreboot, QMK, SANE, Betaflight and more. Someone holding a device can look up its label and find which project already supports it, even if they had never heard of that project. Every record links back to the project it comes from.

From betaflight/config we list **603 flight controllers**. Each record has the target name exactly as the Betaflight App shows it, the MCU, the manufacturer from Manufacturers.md, and a link to the board's config: https://opendevicedb.org/devices/?source=betaflight (for example https://opendevicedb.org/devices/speedybee/speedybeef405v4/). The install section points to the firmware installation guide and the Betaflight App.

- Manufacturer names are shortened to the brand people know, e.g. "LangTian Technology (Shenzhen) Co. (SpeedyBee)" becomes SpeedyBee. If some names come out wrong, tell me.
- CUST, FOSS, COMM and LEGA targets are left out because they don't name a manufacturer.


---
Disclosure: an AI assistant helped me write this post. I maintain OpenDeviceDB and checked everything in it.
