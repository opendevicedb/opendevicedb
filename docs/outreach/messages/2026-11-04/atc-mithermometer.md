# pvvx / ATC_MiThermometer

- Published: 2026-11-04T18:26:05Z
- Channel: GitHub discussion, Show and tell
- Public post: https://github.com/pvvx/ATC_MiThermometer/discussions/839
- Title: OpenDeviceDB: linking thermometer models to firmware and protocol documentation
- Verification: public author, category, title and exact outgoing body read back.

Historical outgoing message, preserved as published. Dedicated importer is a proposal; downstream issue 26 is not corrected and no thermometer test is claimed.

---

Hi everyone,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my independent open-source directory helping people find existing firmware, drivers and protocol documentation by device model, with links back to the original projects.

LYWSD03MMC already appears through our Gadgetbridge and Zigbee2MQTT imports. I'd like to make the pvvx BLE firmware and protocol documentation easier to discover from the same model, while keeping the hardware revisions, stock-firmware requirements and separate BLE/Zigbee projects explicit. The README's B1.5/B1.6 and first-OTA notes are exactly the kind of constraints a useful directory needs to retain.

This review also exposed a problem on our side: the generic Zigbee2MQTT route says no flashing is needed, although the original Bluetooth LYWSD03MMC needs custom Zigbee firmware first. I recorded that in [OpenDeviceDB issue 26](https://github.com/opendevicedb/opendevicedb/issues/26); it is not corrected yet.

I haven't implemented a pvvx importer or tested a thermometer for this proposal. I would handle the catalogue work on my side and link to your maintained guides for setup. Would a source-linked entry with these model/revision constraints be useful? Feedback on the presentation would be welcome.

Thanks,
Sebastien

Written with AI assistance.
