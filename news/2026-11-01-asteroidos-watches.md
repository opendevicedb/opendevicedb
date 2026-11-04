---
title: "AsteroidOS joins OpenDeviceDB: 67 more watches"
date: 2026-11-01
summary: "AsteroidOS adds 70 supported-watch records: 67 new entries and 3 existing records enriched with replacement OS support. The directory now covers 29,389 devices from 30 sources, with a refreshed website for desktop, tablet and phone."
tags: [data]
---

An old smartwatch can still have useful hardware even when its original software no longer
meets your needs. [AsteroidOS](https://asteroidos.org/) is an alternative operating system
for supported watches, and its device list is now part of OpenDeviceDB.

The new import adds **67 entries** and enriches **3 devices already in the directory**.
You can [browse all 70 AsteroidOS records](/devices/?source=asteroidos), including:

- [OPPO Watch 46mm LTE](/devices/oppo/watch-46mm-lte/);
- [Mobvoi TicWatch Pro 3 Ultra GPS](/devices/mobvoi/ticwatch-pro-3-ultra-gps/);
- [Polar M600](/devices/polar/m600/);
- [Asus ZenWatch 3](/devices/asus/zenwatch-3/).

**The exact hardware variant matters.** Records preserve the model numbers and hardware
codenames from AsteroidOS's own table, alongside links to its installation guides.
Different retail models are not merged just because they share a model number or platform.
Experimental ports and generic platform families are excluded from this import.

Supported does not mean every feature works. Where the upstream table marks features
as partial or unavailable, the record keeps those limitations. Check the guide for your
exact variant before choosing an image or installation method. These are imported support
records, not new hardware tests by OpenDeviceDB, and replacement OS support is not a claim
that every component is free software.

The source is the [official AsteroidOS watch table](https://asteroidos.org/watches/), whose
website content is licensed CC BY 3.0. Each record links back to the project that provides
the software and instructions.

**The directory now contains 29,389 devices across 30 imported sources.** The website has
also been redesigned for desktop, tablet and phone. Search, source filters, device
detection and the official installation links remain available, alongside the
[JSON API](/api/sources.json) and [MCP server](/agents/).

Found a wrong model name or a missing hardware variant? [Send a correction](/contribute/).
Include the model number and an upstream reference so the next person can find the right
project for their device.
