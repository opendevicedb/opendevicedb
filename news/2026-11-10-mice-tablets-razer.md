---
title: "Mice, tablets and Razer peripherals: 529 more devices"
date: 2026-11-10T21:00:00Z
summary: "Three new sources, libratbag, OpenTabletDriver and OpenRazer, add 529 devices and enrich 180 existing records with USB IDs and Linux or cross-platform driver support. The directory now holds 30,940 entries across 37 imported sources."
tags: [data]
---

Gaming mice, graphics tablets and Razer peripherals often ship with Windows-only vendor
software. Open drivers already support many of them, and three of those projects are now
OpenDeviceDB sources. They add **529 new entries** and enrich **180 existing records**, all
with USB IDs, so the [Detect](/detect/) button can recognise them.

| Source | New entries | Examples |
| --- | ---: | --- |
| [libratbag](https://github.com/libratbag/libratbag) (Piper, ratbagctl) | 100 | [Logitech MX Master 3S](/devices/logitech/mx-master-3s/), [Glorious Model O](/devices/glorious/model-o/), [SteelSeries Rival 310](/devices/steelseries/rival-310/) · [all libratbag records](/devices/?source=libratbag) |
| [OpenTabletDriver](https://opentabletdriver.net/) | 304 | [Wacom CTH-460](/devices/wacom/cth-460/), [XP-Pen Deco 01 V2](/devices/xp-pen/deco-01-v2/), [Gaomon S620](/devices/gaomon/s620/) · [all OpenTabletDriver records](/devices/?source=opentabletdriver) |
| [OpenRazer](https://openrazer.github.io/) | 125 | [Razer DeathAdder V2 Pro](/devices/razer/deathadder-v2-pro/), [Razer Blade 15 (2018)](/devices/razer/blade-15-2018/) · [all OpenRazer records](/devices/?source=openrazer) |

How each source is read:

- **libratbag** configures mice on Linux through ratbagd and front ends such as Piper:
  resolutions, buttons, LEDs and profiles. Each record comes from one of its device files.
  When a file lists several models ("G102/G103/G203", "Rival 100/105"), each model gets its
  own record with the shared IDs. Generic chip profiles are left out.
- **OpenTabletDriver** is a user-mode tablet driver for Windows, Linux and macOS. Records
  repeat its own status for each tablet: 225 "Supported", 90 "Missing Features" and 44
  "Has Quirks", with its notes. OpenTabletDriver also matches tablets on report length and
  parser, so a USB ID alone is a hint, not proof.
- **OpenRazer** is a Linux kernel driver and daemon for Razer keyboards, mice, headsets,
  mousemats and Blade laptops. Wired, wireless and receiver IDs of one product are merged
  into one record; years and editions stay separate.

**These drivers work with the device's existing firmware.** They configure it over USB or
Bluetooth; they do not replace it. As always, these are documented support records rather
than new hardware tests by OpenDeviceDB, and supported features vary by model.

Coming next: lab instruments from [QCoDeS](https://github.com/microsoft/Qcodes), whose
import is [being reviewed](https://github.com/microsoft/Qcodes/discussions/8750) with its
community before merging.

**The directory now holds 30,940 entries across 37 imported sources.** Found a wrong model
or a missing variant? [Send a correction](/contribute/) with the exact model and an upstream
source.
