# ATC_MiThermometer introduction — correction proposal update

- Updated: 2026-11-04T18:35:56Z
- Channel: edit to our existing Show and tell discussion
- Public post: https://github.com/pvvx/ATC_MiThermometer/discussions/839
- Title: OpenDeviceDB: linking thermometer models to firmware and protocol documentation
- Verification: public author, category, title and exact updated body read back.

Historical revision, preserved as published. The original introduction is retained in `atc-mithermometer.md`; this edit adds draft PR 27 without a duplicate comment or a merge/deployment claim.

---

Hi everyone,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my independent open-source directory helping people find existing firmware, drivers and protocol documentation by device model, with links back to the original projects.

LYWSD03MMC already appears through our Gadgetbridge and Zigbee2MQTT imports. I'd like to make the pvvx BLE firmware and protocol documentation easier to discover from the same model, while keeping the hardware revisions, stock-firmware requirements and separate BLE/Zigbee projects explicit. The README's B1.5/B1.6 and first-OTA notes are exactly the kind of constraints a useful directory needs to retain.

This review also exposed a problem on our side: the generic Zigbee2MQTT route says no flashing is needed, although the original Bluetooth LYWSD03MMC needs custom Zigbee firmware first. I recorded that in [OpenDeviceDB issue 26](https://github.com/opendevicedb/opendevicedb/issues/26) and prepared [draft correction PR 27](https://github.com/opendevicedb/opendevicedb/pull/27). It retains custom-firmware prerequisites and separates pairing from firmware preparation; 149 importer tests passed and the snapshot was regenerated. The PR is unmerged, so the live listing is not corrected yet.

I haven't implemented a pvvx importer or tested a thermometer for this proposal. I would handle the catalogue work on my side and link to your maintained guides for setup. Would a source-linked entry with these model/revision constraints be useful? Feedback on the presentation would be welcome.

Thanks,
Sebastien

Written with AI assistance.
