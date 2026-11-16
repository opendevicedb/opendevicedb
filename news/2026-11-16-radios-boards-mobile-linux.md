---
title: "LoRa radios, development boards and mobile Linux: 1,170 more devices"
date: 2026-11-16T03:35:00Z
summary: "Meshtastic, Armbian, CircuitPython, Ubuntu Touch and Droidian add 1,170 devices and enrich 148 existing records. OpenDeviceDB now holds 32,110 unique entries across 42 imported sources, with upstream support levels and installation prerequisites preserved."
tags: [data]
---

Five additional sources bring LoRa mesh radios, ARM computers, microcontroller boards
and mobile Linux adaptations into one search. The directory now holds **32,110 unique
entries across 42 imported sources**: **1,170 new devices**, plus additional project
references for **148 devices already in the catalogue**.

| Source | Imported records | Examples and source filter |
| --- | ---: | --- |
| [Meshtastic](https://meshtastic.org/) | 117 | [Heltec Mesh Node T114](/devices/heltec/mesh-node-t114/), [Seeed Card Tracker T1000-E](/devices/seeed-studio/card-tracker-t1000-e/) · [all Meshtastic records](/devices/?source=meshtastic) |
| [Armbian](https://www.armbian.com/) | 437 | [Orange Pi 5](/devices/orange-pi/5/), [AYN Odin2](/devices/ayn/odin-2/) · [all Armbian records](/devices/?source=armbian) |
| [CircuitPython](https://circuitpython.org/) | 639 | [Raspberry Pi Pico W](/devices/raspberry-pi/pico-w/) · [all CircuitPython records](/devices/?source=circuitpython) |
| [Ubuntu Touch](https://devices.ubuntu-touch.io/) | 116 | [Google Pixel 3a](/devices/google/pixel-3a/), [Fairphone 3+](/devices/fairphone/3-plus/) · [all Ubuntu Touch records](/devices/?source=ubports) |
| [Droidian](https://devices.droidian.org/) | 37 | [F(x)tec Pro1-X](/devices/f-x-tec/pro1-x/), [Volla Phone 22](/devices/volla/phone-22/) · [all Droidian records](/devices/?source=droidian) |

These are **source-record counts**, not additive new-device counts: several projects
support the same hardware. Records are merged by their normalised device identity;
the headline total counts each resulting catalogue entry once.

What the new sources provide:

- **Meshtastic** uses the official flasher's hardware index. Named products retain their
  target and active-support flag; generic DIY profiles are excluded. Inactive entries
  do not receive a current installation claim. MeshPocket's 5,000 and 10,000 mAh variants
  stay distinct, including the requirement for the magnetic programming cable.
- **Armbian** reads board configurations without executing their shell code. Standard,
  community, TV-box, work-in-progress and end-of-life states stay visible. Generic UEFI
  and virtual-machine targets are excluded. A board configuration does not guarantee
  a current downloadable image, every working peripheral or a fully free boot chain.
- **CircuitPython** comes from the **10.3.2 firmware release**, rather than the broader
  website or Blinka host-library list. Physical memory, radio and board revisions stay
  separate; alternative firmware configurations for the same board can share a record.
  USB IDs describe the CircuitPython build and are hints rather than proof of the board.
  Where applicable, installation notes retain the TinyUF2 bootloader prerequisite.
- **Ubuntu Touch** retains the selected release, port type, development stage and
  maintenance state. Matching UBports Installer configurations add preparation steps,
  including required stock Android builds. Outdated Xenial and unmaintained listings
  are not presented as maintained current ports.
- **Droidian** adds model references and feature exceptions. Its **potential** category
  remains unknown support and gets no installation route. The device site's content
  licence is unspecified, so the importer creates a factual index with original
  summaries and upstream links, without copying its prose, instructions or images.

**These imports are upstream support references, not new hardware tests by
OpenDeviceDB.** Features and installation requirements vary by exact model, variant
and release. Read the linked project page before choosing an image or flashing method.

Found an incorrect name or missing prerequisite? [Contribute a correction](/contribute/)
with the exact model and the upstream evidence.
