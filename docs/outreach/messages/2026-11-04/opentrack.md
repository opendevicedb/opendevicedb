# opentrack introduction

- Published: 2026-11-04T19:06:01Z
- Channel: GitHub Discussions / Show and tell
- Public post: https://github.com/opentrack/opentrack/discussions/2235
- Title: OpenDeviceDB: finding opentrack from a device model
- Verification: author, category, title and exact outgoing body independently read back.

---

Hi, I'm Sébastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an [open-source catalogue](https://github.com/opendevicedb/opendevicedb) connecting device models to open firmware, drivers and tools.

Your [XReal One TCP tracker](https://github.com/opentrack/opentrack/tree/master/tracker-xreal-one) is a concrete example I'd like people to discover from a model lookup, with links to the setup documentation credited in your README.

A useful entry would retain the input module, firmware/protocol assumptions and host-platform limits, while preserving the README's uncertainty about One Pro. The input device, tracker and game-output protocol also need separate treatment; a plugin's presence alone doesn't establish a complete working setup.

Would a small set of source-linked model entries be useful? I can handle the catalogue work downstream and keep your guides authoritative. No dedicated opentrack importer is implemented, and I haven't tested this hardware myself.

Prepared with AI assistance.
