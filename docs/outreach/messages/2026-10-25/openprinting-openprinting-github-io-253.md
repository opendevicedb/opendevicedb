# OpenPrinting-openprinting.github.io-253

- Sent/published: 2026-10-25T07:52:30Z
- Channel: GitHub
- Public permalink: https://github.com/OpenPrinting/openprinting.github.io/discussions/253
- Subject: OpenDeviceDB lists the printers that need a specific free driver from foomatic-db, with links to OpenPrinting
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi, and thank you for OpenPrinting. I'm sharing something built on foomatic-db, in case it's useful or you spot a problem.

[OpenDeviceDB](https://opendevicedb.org) is a free directory of devices that already work with open code or open firmware. The code is AGPL and the data is CC BY-SA. It brings the supported-device lists of 25 projects together in one search: Zigbee2MQTT, Z-Wave JS, Tasmota, ESPHome, OpenWrt, LineageOS, coreboot, QMK, SANE, Betaflight and more. Someone holding a device can look up its label and find which project already supports it, even if they had never heard of that project. Every record links back to the project it comes from.

From `db/source/printer` and `db/source/driver` in foomatic-db, we list **1,109 printers**. Each record links to its OpenPrinting printer page and to its drivers' pages: https://opendevicedb.org/devices/?source=openprinting (for example https://opendevicedb.org/devices/hp/laserjet-1020/).

- We keep only printers rated "perfectly" or "mostly" that need a specific free driver (foo2zjs, splix and others). Printers that speak PostScript, PCL or PDF, or that only work with a generic driver, are left out, since nothing about them had to be reverse engineered. Is that a fair reading of the database?
- If foomatic-db is no longer the best source for this (Printer Applications, for instance), I'd be glad to know what to read instead.


---
Disclosure: an AI assistant helped me write this post. I maintain OpenDeviceDB and checked everything in it.
