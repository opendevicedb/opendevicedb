# EdgeTX-edgetx-7945

- Sent/published: 2026-10-25T07:52:49Z
- Channel: GitHub
- Public permalink: https://github.com/EdgeTX/edgetx/discussions/7945
- Subject: OpenDeviceDB lists the radios EdgeTX supports, including older ones that stay on 2.11
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi, and thank you for EdgeTX. I'm sharing something built on fw.json, in case it's useful or you spot a problem.

[OpenDeviceDB](https://opendevicedb.org) is a free directory of devices that already work with open code or open firmware. The code is AGPL and the data is CC BY-SA. It brings the supported-device lists of 25 projects together in one search: Zigbee2MQTT, Z-Wave JS, Tasmota, ESPHome, OpenWrt, LineageOS, coreboot, QMK, SANE, Betaflight and more. Someone holding a device can look up its label and find which project already supports it, even if they had never heard of that project. Every record links back to the project it comes from.

From fw.json on main and in the latest 2.12 and 2.11 releases, we list **61 radios**. The install section points to the EdgeTX manual and EdgeTX Buddy: https://opendevicedb.org/devices/?source=edgetx (for example https://opendevicedb.org/devices/radiomaster/tx16s/).

- Radios that are in 2.11 but no longer in newer builds (X9D, QX7, X-Lite, T12, TX12, T8…) carry a note saying to use the latest 2.11 release. Is that the right advice?
- Radios only in main (TX16S MK3 at the moment) are marked as nightly-only until they reach a release.


---
Disclosure: an AI assistant helped me write this post. I maintain OpenDeviceDB and checked everything in it.
