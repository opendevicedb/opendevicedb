# Tuya CloudCutter

- Published: 2026-11-04T16:31:28Z
- Channel: GitHub discussion
- Public evidence: https://github.com/tuya-cloudcutter/tuya-cloudcutter/discussions/931
- Category: Show and tell
- Title: OpenDeviceDB links device-model searches back to CloudCutter profiles

Historical outgoing message, preserved as published. Imported listings are not OpenDeviceDB hardware tests.

---

Hello CloudCutter community,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my open-source directory linking device models to existing firmware, drivers and protocol work so people can find and reuse earlier investigations.

The directory already has a [CloudCutter importer](https://github.com/opendevicedb/opendevicedb/blob/main/packages/importers/src/sources/cloudcutter.ts). It reads your public device/profile files, links back to the original device JSON, and includes firmware constraints in the installation route. Thank you for making this information available.

I would welcome feedback on how that work is presented. A retail model or chipset match does not establish that a particular unit has a vulnerable firmware build; your exact profiles and known-patched-firmware documentation remain the reference. The listing is also separate from any OpenDeviceDB hardware test, and should not imply that we tested flashing those devices.

If you notice a misleading model grouping or missing constraint, I can handle the correction in the directory. The aim is to send people to your existing work and instructions, with attribution, rather than give a blanket compatibility claim.

[Project repository](https://github.com/opendevicedb/opendevicedb)

Thanks,
Sebastien Michea

Written with AI assistance.
