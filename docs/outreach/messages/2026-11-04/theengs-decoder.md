# Theengs Decoder introduction

- Published: 2026-11-04T18:47:10Z
- Channel: GitHub Discussions / Show and tell
- Public post: https://github.com/theengs/decoder/discussions/723
- Title: OpenDeviceDB: helping device owners find Theengs decoders
- Verification: author, category, title and exact outgoing body independently read back.

---

Hi, I'm Sébastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an [open-source catalogue](https://github.com/opendevicedb/opendevicedb) linking device models to open firmware, drivers and tools.

I'd like to help someone looking up an Inkbird IBS-TH1 discover your [BLE decoding documentation](https://decoder.theengs.io/devices/IBS_TH1.html), including what data can be received. That would describe advertised sensor readings; it wouldn't imply device control or replacement firmware.

Your sources also show why the mapping needs care: `IBS-TH1/TH2/P01B/ITH-12S` is a grouped decoder ID, while LYWSD03MMC formats depend on the installed firmware, with an additional device-name condition documented for PVVX BTHome v2.

Would downstream links from a few physical-model records be useful, and is there a preferred source for keeping those mappings accurate? I'd keep your documentation authoritative rather than create another compatibility list to maintain. No dedicated Theengs importer is implemented, and I haven't tested these devices myself.

This introduction was prepared with AI assistance.
