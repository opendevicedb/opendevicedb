# OpenTabletDriver — follow-up

- Published: 2026-11-10T20:31:55Z
- Channel: GitHub discussion comment
- Public post: https://github.com/OpenTabletDriver/OpenTabletDriver/discussions/5238#discussioncomment-19528386
- Verification: public author and exact body read back.
- Summary: Announces the OpenTabletDriver import (360 tablets at v0.6.8.1, PR 44) and asks for corrections.

---

A short follow-up, as offered above: OpenDeviceDB now lists the tablets from your configurations, read at the v0.6.8.1 release.

- 360 tablets, each linking to its configuration file at that tag and to opentabletdriver.net, e.g. [Wacom CTH-460](https://opendevicedb.org/devices/wacom/cth-460/) or [XP-Pen Deco 01 V2](https://opendevicedb.org/devices/xp-pen/deco-01-v2/). [All OpenTabletDriver records](https://opendevicedb.org/devices/?source=opentabletdriver).
- Each record repeats your TABLETS.md status and notes ("Supported", "Missing Features", "Has Quirks"). The one "Questionable" entry is left out.
- USB IDs come from both digitizer and auxiliary identifiers. The record says matching also depends on report length and parser, so a VID:PID is a hint, not proof.
- Nothing is claimed as tested by us. The importer is [here](https://github.com/opendevicedb/opendevicedb/blob/main/packages/importers/src/sources/opentabletdriver.ts) if you'd like to check how it reads your files.

If a status, note or name is wrong, or you'd rather we link elsewhere, tell me and I'll fix it.

Written with AI assistance.
