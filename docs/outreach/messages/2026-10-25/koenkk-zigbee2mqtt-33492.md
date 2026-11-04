# Koenkk-zigbee2mqtt-33492

- Sent/published: 2026-10-25T07:52:02Z
- Channel: GitHub
- Public permalink: https://github.com/Koenkk/zigbee2mqtt/discussions/33492
- Subject: OpenDeviceDB: all Zigbee2MQTT devices searchable next to 24 other open projects, with links back here
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi, and thank you for Zigbee2MQTT. I built something on top of your device definitions and wanted to share it here, in case it's useful or you spot a problem.

[OpenDeviceDB](https://opendevicedb.org) is a free directory of devices that already work with open code or open firmware. The code is AGPL and the data is CC BY-SA. It brings the supported-device lists of 25 projects together in one search: Zigbee2MQTT, Z-Wave JS, Tasmota, ESPHome, OpenWrt, LineageOS, coreboot, QMK, SANE, Betaflight and more. Someone holding a device can look up its label and find which project already supports it, even if they had never heard of that project. Every record links back to the project it comes from.

Zigbee2MQTT is our largest source: **5,786 devices**. Each record links to its page on zigbee2mqtt.io and carries its Zigbee model ids, so it can be found by what the device reports: https://opendevicedb.org/devices/?source=zigbee2mqtt

- The data is read from the zigbee-herdsman-converters definitions (MIT). We don't edit it on our side: corrections belong here, upstream.
- If something looks wrong, or you'd rather we didn't show a field, tell me and I'll fix the importer.
- There is also a JSON API and an MCP server, so an AI agent asked "does this device work locally?" can answer with a link to your docs.


---
Disclosure: an AI assistant helped me write this post. I maintain OpenDeviceDB and checked everything in it.
