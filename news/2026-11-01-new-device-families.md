---
title: "Six new device families: 949 additions"
date: 2026-11-01T18:04:41Z
summary: "OpenDeviceDB adds measurement instruments, UPS hardware, arcade controllers, security keys, telescope mounts and SDR radios. Three new importers and seven curated records bring the directory to 30,338 entries across 33 imported sources."
tags: [data]
---

An oscilloscope, a security key and a telescope mount have something in common:
finding the right open software often starts with identifying the exact hardware.
OpenDeviceDB now covers six more areas, with **949 new entries** and links to the
projects that document or support them.

| Family | Added entries | Examples and directory |
| --- | ---: | --- |
| UPS and power-management hardware | 771 | [Eaton 5E1100iUSB](/devices/eaton/5e1100iusb/) · [Network UPS Tools records](/devices/?source=nut) |
| Measurement instruments | 138 | [Hantek 6022BE](/devices/hantek/6022be/), [Rigol DS1054Z](/devices/rigol/ds1054z/) · [sigrok records](/devices/?source=sigrok) |
| Arcade controllers and interfaces | 33 | [Flatbox Rev 4](/devices/flatbox/rev-4/), [ARC Accessibility Controller](/devices/openstickcommunity/arc-accessibility-controller/) · [GP2040-CE records](/devices/?source=gp2040-ce) |
| Security keys | 2 | [Nitrokey 3A Mini](/devices/nitrokey/3a-mini/), [Nitrokey Passkey](/devices/nitrokey/passkey/) |
| Telescope mounts | 2 | [ZWO AM5](/devices/zwo/am5/), [Sky-Watcher Star Adventurer GTI](/devices/sky-watcher/star-adventurer-gti/) |
| Software-defined radios | 3 | [HackRF One](/devices/great-scott-gadgets/hackrf-one/), [Airspy Mini](/devices/airspy/mini/), [Airspy R2](/devices/airspy/r2/) |

Three new importers make the larger lists refreshable:

- [Network UPS Tools](https://networkupstools.org/stable-hcl.html) contributes
  **766 UPS entries and five power-distribution or transfer-switch entries**. Records
  keep the driver, connection details and required parameters. Wildcard model groups,
  generic family labels and entries explicitly described as experimental, untested
  or merely expected to work are excluded. NUT's support levels describe where the
  protocol information came from; they are not hardware-test scores.
- [sigrok](https://github.com/sigrokproject/libsigrok) contributes explicit model
  profiles from four drivers: serial-dmm, hantek-6xxx, fx2lafw and rigol-ds. This covers
  multimeters, oscilloscopes and logic analyzers. Model names come from the GPL-licensed
  driver tables; the wiki is linked for documentation. Series names are not expanded
  into invented model lists. This first import covers those four drivers, not every
  instrument supported by sigrok.
- [GP2040-CE](https://gp2040-ce.info/downloads/) contributes named controllers and
  arcade interfaces with matching firmware configurations. Hardware revisions remain
  separate. Generic microcontroller boards and configurations representing multiple
  unnamed products are excluded. Open firmware does not mean every controller's
  hardware design is open.

The other seven records were prepared individually from the official Nitrokey,
INDI, HackRF and Airspy documentation. They preserve model-specific requirements,
including the Star Adventurer GTI guide's instruction to disconnect Synscan App
before controlling the mount through INDI.

**Driver support and replacement firmware are different things.** NUT and INDI
communicate with the existing device firmware. Some sigrok devices instead load
runtime firmware into RAM; that is distinct from permanently flashing a device.
Each record links to the relevant setup or installation guide. These additions are
documented support records, not new physical hardware tests by OpenDeviceDB, and
they do not claim that every component is free software or that every feature works.

The imported snapshots retain their upstream licenses: GPL 2.0 or later for the NUT
table, GPL 3.0 or later for the libsigrok model tables, and MIT for the GP2040-CE
downloads metadata. Sources and licenses remain visible on the [sources page](/sources/).

**The directory now contains 30,338 entries across 33 imported sources.** The new
categories are available in directory filters, the JSON API and the repository's MCP
schema. SDR receivers use the existing radio category. Found a wrong model or a
missing revision? [Send a correction](/contribute/) with the exact reference and an
upstream source.
