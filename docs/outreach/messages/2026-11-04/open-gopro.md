# Open GoPro

- Published: 2026-11-04T17:35:53Z
- Channel: GitHub Show and tell
- Public post: https://github.com/gopro/OpenGoPro/discussions/933
- Subject: OpenDeviceDB: helping camera owners find Open GoPro interfaces
- Verification: public author, title and exact outgoing body read back.

Historical outgoing message, preserved as published. No dedicated importer, camera entry implementation or new hardware test is claimed.

---

Hello Open GoPro community,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my independent open-source directory linking device models to existing drivers, firmware and protocol documentation, to help people find and reuse earlier work.

I would like someone looking up their camera model to discover Open GoPro and the appropriate SDK documentation. There is no dedicated Open GoPro importer yet.

I read your developer README and Python SDK overview. A directory entry would need to preserve the exact camera/firmware scope, supported BLE or Wi-Fi/USB HTTP interfaces, and SDK host requirements. The SDK's availability should not become a compatibility claim for every GoPro camera or interface. An open SDK/protocol entry would also keep the camera's own firmware status separate.

Would a small sample with links to your documentation be useful? Is there a preferred maintained page or source for model/firmware compatibility? The README mentions capability specifications; I would start from your documented support rather than infer a complete model list from the runtime capabilities-query schema.

I can prepare the directory entries and bring back a small sample for corrections. I have not implemented this importer or tested GoPro hardware for this proposal.

[Project repository](https://github.com/opendevicedb/opendevicedb)

Thanks,
Sebastien Michea

Written with AI assistance.
