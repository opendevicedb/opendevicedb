# OpenIPC

- Sent/published: 2026-11-04T14:01:13.000Z
- Channel: email
- Public project contact: dev@openipc.org
- Subject: OpenDeviceDB: helping camera owners find existing firmware and protocol work
- Original content format: text/plain

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi OpenIPC community,

I created OpenDeviceDB (https://opendevicedb.org) after the release of REA to help people find existing device-protocol and open-firmware work before repeating it. It is my independent open-source project.

The directory already imports thingino camera profiles and links to community contributions such as Vittuu’s work on one XM530V200 camera (https://github.com/opendevicedb/opendevicedb/blob/main/data/devices/xiongmai/ipg-x2-wq-bl.yaml). That entry describes modifications to stock firmware; it does not establish OpenIPC compatibility. There is no OpenIPC importer yet.

I would like camera owners searching by model to find your work too. I have looked at OpenIPC/builder’s device and clone tables (https://github.com/OpenIPC/builder). A downstream index would need to preserve the hardware revision, SoC, sensor, Wi-Fi and flash differences, as well as notes such as video working while Wi-Fi or motors remain unsupported. A shared SoC alone would not establish full camera support.

Is builder the preferred source for this, or would you recommend another maintained model-to-profile source? I can do the importer work in OpenDeviceDB, link every entry back to your documentation, and bring a small example back for review. No new export format is needed from your side.

Project and importers (https://github.com/opendevicedb/opendevicedb). A pointer or one example of a compatibility detail I should preserve would be very helpful.

Thanks,
Sebastien Michea

Written with AI assistance.
