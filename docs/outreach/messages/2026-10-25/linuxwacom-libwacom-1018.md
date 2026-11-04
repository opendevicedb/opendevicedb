# linuxwacom-libwacom-1018

- Sent/published: 2026-10-25T08:03:25Z
- Channel: GitHub
- Public permalink: https://github.com/linuxwacom/libwacom/issues/1018
- Subject: FYI: libwacom's tablets are listed (with links back) on OpenDeviceDB
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi, and thank you for libwacom. This isn't a bug report, just a heads-up about something built on your `.tablet` files, and a place to tell me if I got anything wrong.

[OpenDeviceDB](https://opendevicedb.org) is a free directory of devices that already work with open code or open firmware. The code is AGPL and the data is CC BY-SA. It brings the supported-device lists of 25 projects together in one search, and every record links back to the project it comes from.

From `data/*.tablet` we list **323 pen tablets and pen displays** (Wacom, Huion, XP-Pen, GAOMON and others). Each record has its USB ids and a link to its `.tablet` file: https://opendevicedb.org/devices/?source=libwacom (for example https://opendevicedb.org/devices/wacom/intuos-pro-m-pth-660/). So someone who searches for a tablet's model or USB id finds that it works under Linux, and where that support comes from.

- Built-in digitizers (`IntegratedIn` containing `System`) are left out, because they aren't products you buy separately.
- Names are built from `Name` plus `ModelName`. If some come out odd, tell me and I'll fix the importer.

Feel free to close this. There is nothing to do on your side.

---
Disclosure: an AI assistant helped me write this issue. I maintain OpenDeviceDB and checked everything in it.
