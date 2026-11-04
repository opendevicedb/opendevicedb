# themactep-thingino-firmware-1865

- Sent/published: 2026-10-25T07:53:08Z
- Channel: GitHub
- Public permalink: https://github.com/themactep/thingino-firmware/discussions/1865
- Subject: OpenDeviceDB lists the cameras thingino supports, with links to their build profiles
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi, and thank you for thingino. I'm sharing something built on your camera profiles, in case it's useful or you spot a problem.

[OpenDeviceDB](https://opendevicedb.org) is a free directory of devices that already work with open code or open firmware. The code is AGPL and the data is CC BY-SA. It brings the supported-device lists of 25 projects together in one search: Zigbee2MQTT, Z-Wave JS, Tasmota, ESPHome, OpenWrt, LineageOS, coreboot, QMK, SANE, Betaflight and more. Someone holding a device can look up its label and find which project already supports it, even if they had never heard of that project. Every record links back to the project it comes from.

From `configs/cameras/*/*_defconfig` (the `# NAME:` line) we list **124 cameras**. Hardware variants of one camera are merged into a single record, and each record links to its profiles and to the installation guide: https://opendevicedb.org/devices/?source=thingino (for example https://opendevicedb.org/devices/wyze/cam-pan-v2/).

- If some names or merges come out wrong, or there is a better list to read, tell me.


---
Disclosure: an AI assistant helped me write this post. I maintain OpenDeviceDB and checked everything in it.
