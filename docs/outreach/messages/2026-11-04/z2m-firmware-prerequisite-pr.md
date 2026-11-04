# Zigbee2MQTT firmware prerequisite — draft PR 27

- Date: 2026-11-04
- Channel: OpenDeviceDB draft pull request
- Public proposal: https://github.com/opendevicedb/opendevicedb/pull/27
- Title: fix: retain custom Zigbee firmware prerequisites
- Head: `cd063c90ec641e20008bed9e4cf9edaf203813d5`
- Verification: public author, open/draft state, head and exact proposal body read back. CI passed on this head.

Historical outgoing proposal, preserved as submitted. Correction is prepared in an unmerged/undeployed draft; no hardware test. Issue 26 remains open until merge.

---

The LYWSD03MMC listing currently says no flashing is needed, although the original device is Bluetooth-only and Zigbee2MQTT requires custom Zigbee firmware first. The same pairing template assumes retained stock firmware for definitions explicitly described as using custom firmware.

Preserve that prerequisite in the importer, including inheritance through white-label definitions. LYWSD03MMC gets its documented Bluetooth-to-Zigbee constraint; other explicit custom-firmware entries require a compatible image without inventing a flashing procedure. Remove blanket risk/rollback guarantees from those entries and leave their firmware licensing/components unspecified. Pairing notes across the source now describe pairing after upstream preparation instead of promising that no preparation is needed.

Regenerate the Zigbee2MQTT snapshot: all 5,786 device identities, identifiers, categories and support statuses are retained; 36 explicit custom-firmware records gain the extra context. The full snapshot refresh also changes update dates and general pairing notes. Factory-Zigbee entries retain their pairing-only risk/reversibility attributes. The native `LYWSD03MMC-z` entry stays separate.

Validation: all 149 importer tests passed, including new regression cases for LYWSD03MMC, native/ordinary devices, negative wording, white-label inheritance and absent documentation pages. Catalogue validation passed with 30 curated and 31,207 imported records, zero errors. Compared the generated snapshot to the base: no added/removed devices or identity changes. No hardware test or flashing was performed.

Fixes #26. Prepared with AI assistance. This draft is unmerged and undeployed.
