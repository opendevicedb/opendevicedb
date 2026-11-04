# LYWSD03MMC firmware prerequisite — issue 26

- Date: 2026-11-04
- Channel: OpenDeviceDB issue
- Public report: https://github.com/opendevicedb/opendevicedb/issues/26
- Title: Zigbee2MQTT: preserve LYWSD03MMC custom-firmware prerequisite
- Verification: public author, open state and exact issue body read back.

Historical outgoing report, preserved as submitted. No correction, deployment or hardware test is claimed.

---

The imported `custom-devices-diy/lywsd03mmc` entry presents pairing with a generic note saying no flashing is needed and the device keeps its firmware. Upstream explicitly requires custom firmware to convert the original Bluetooth device to Zigbee before it can be used with Zigbee2MQTT.

Evidence:

- [Current imported record](https://github.com/opendevicedb/opendevicedb/blob/330498bf4db61a574aacbc8ca6a035ae4056b453/data/imported/zigbee2mqtt.json), ID `custom-devices-diy/lywsd03mmc`; the checked local snapshot matches current main's blob `f7d79e6860da4c7d12dd6053377f09f04c4f54c0`.
- [Importer route](https://github.com/opendevicedb/opendevicedb/blob/330498bf4db61a574aacbc8ca6a035ae4056b453/packages/importers/src/sources/zigbee2mqtt.ts#L56) applies the same stock-firmware/no-flashing wording to every definition.
- [Pinned upstream device notes](https://github.com/Koenkk/zigbee2mqtt.io/blob/14acd6165880130fa3c1608aab74cb5f38b2547a/docs/devices/LYWSD03MMC.md#notes) state that the original device is Bluetooth-only and requires custom Zigbee firmware; [rendered documentation](https://www.zigbee2mqtt.io/devices/LYWSD03MMC.html).

Pairing an already converted device is distinct from preparing an original unit. The current route hides that prerequisite and makes its reversibility/risk wording appear to cover the complete setup.

Expected correction:

- Keep the custom-firmware prerequisite and source guide explicit for this source entry; constrain the pairing-only claims to a device already running the required Zigbee firmware.
- Preserve hardware/model/revision boundaries and upstream preparation instructions; do not invent a universal flashing method or merge this entry with other BLE/native-Zigbee variants by display name alone.
- Regenerate the affected snapshot after the importer change. Add a regression case for this definition and a normal factory-Zigbee device, ensuring ordinary pairing still works as before.

No correction is implemented by this report. No hardware was tested or flashed. Written with AI assistance.
