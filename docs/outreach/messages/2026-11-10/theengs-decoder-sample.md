# Theengs Decoder — follow-up

- Published: 2026-11-10T12:42:37Z
- Channel: GitHub discussion reply
- Public post: https://github.com/theengs/decoder/discussions/723#discussioncomment-19518745
- Verification: public author and exact body read back.
- Summary: Eight-device sample from the decoder device pages with three questions (SwitchBot control, gateway-only properties, grouped IDs).

---

As promised, a small sample for corrections before going further. All data comes from your device pages; only the LYWSD03MMC already has records in OpenDeviceDB (from Zigbee2MQTT and Gadgetbridge), the others would be new.

Each record would have the status *partial protocol* (advertised data documented, no control), link its decoder page, and keep your model ID as the grouping key.

| Proposed record | Decoder page | Model ID kept | Data decoded from advertisements | Encryption | Notes we'd keep |
| --- | --- | --- | --- | --- | --- |
| Xiaomi LYWSD03MMC | [LYWSD03MMC](https://decoder.theengs.io/devices/LYWSD03MMC.html) | `LYWSD03MMC_ATC/PVVX/BTHOME` | temperature, humidity, battery, voltage, packet, power, open (depends on the installed firmware) | optional (PVVX), decrypted by the client app | needs ATC, PVVX or BTHome v2 custom firmware; with PVVX TelinkMiFlasher, BTHome v2 needs the default "ATC" name prefix |
| Inkbird IBS-TH1 (also Mini and Plus) | [IBS-TH1](https://decoder.theengs.io/devices/IBS_TH1.html) | `IBS-TH1` | temperature, humidity, battery | no | one grouped ID for several models; external probe except on the Mini |
| Govee H5075 | [H5075](https://decoder.theengs.io/devices/H5075.html) | `H5075` | temperature, humidity, battery | no | |
| SwitchBot Meter (Plus) | [Meter (Plus)](https://decoder.theengs.io/devices/SBMT.html) | `THX1(W230150X)` | temperature, humidity, battery | no | |
| SwitchBot Blind Tilt | [Blind Tilt](https://decoder.theengs.io/devices/SBBT.html) | `W270160X` | open, direction, motion, calibrated, light level, battery | no | control not provided by the Decoder; possibly through OpenMQTTGateway (to confirm) |
| Xiaomi / VegTrug Mi Flora | [Mi Flora](https://decoder.theengs.io/devices/HHCCJCY01HHCC.html) | `HHCCJCY01HHCC` | temperature, moisture, fertility, luminance | no | |
| Aranet4 CO₂ monitor | [Aranet4](https://decoder.theengs.io/devices/Aranet4.html) | `ARANET4` | temperature, humidity, pressure, carbon dioxide, battery | no | broadcasting requires the Bluetooth dip switch set to ON |
| Victron Smart Battery Sense | [Smart Battery Sense](https://decoder.theengs.io/devices/VICTRON_SBS.html) | `VICTSBS` | voltage, temperature | yes, decrypted by the client app (Victron scheme) | |

Questions:

1. **SwitchBot control.** Which SwitchBot models can OpenMQTTGateway control, and is there a page I should link for that?
2. **Gateway-only properties.** You mentioned a few properties are only read through a connection via OpenMQTTGateway. Is that marked anywhere per device, so we don't list them as advertised data?
3. **Grouped IDs.** For `IBS-TH1`, would you prefer one record for the group, or one per retail model, each pointing to the same decoder page?

Written with AI assistance.
