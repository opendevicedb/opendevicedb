# MissionControl introduction

- Published: 2026-11-04T19:26:34Z
- Channel: GitHub Discussions / Show and tell
- Public post: https://github.com/ndeadly/MissionControl/discussions/1174
- Title: OpenDeviceDB: linking controller models to MissionControl with version-specific scope
- Verification: author, category, title and exact outgoing body independently read back.

---

Hi, I'm Sébastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an [open-source catalogue](https://github.com/opendevicedb/opendevicedb) connecting device models to open firmware, drivers and tools.

I'd like someone looking up their controller to discover MissionControl with the right constraints: the controller model/firmware and Bluetooth transport, the console's Atmosphère requirement, and the relevant release instructions.

Your Xbox-controller FAQ shows why model names alone aren't enough. Release-specific warnings also matter: the maintainer's [DualShock 3 warning for 0.16.0](https://github.com/ndeadly/MissionControl/discussions/1151#discussioncomment-18713645) needs to remain visible alongside the README's supported-controller list. Experimental BLE fork reports would be labelled separately from official release support.

Would a small set of source-linked controller entries be useful? I can handle the catalogue work downstream and link to your guides. No MissionControl importer is implemented, and I haven't tested a console or controller for this proposal.

Prepared with AI assistance.
