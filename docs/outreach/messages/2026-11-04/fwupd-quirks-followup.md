# fwupd: reply to the plugin-identifier suggestion

- Published: 2026-11-04T16:11:13Z
- Channel: GitHub discussion reply
- Public evidence: https://github.com/fwupd/fwupd/discussions/11346#discussioncomment-19401663

Historical outgoing message, preserved as sent. Proposed work is not an implemented integration or hardware validation.

---

Thanks, that gives me a concrete source to work from. I looked at the Logitech HID++, SteelSeries and UF2 quirks and recorded a scoped proposal in [OpenDeviceDB issue 19](https://github.com/opendevicedb/opendevicedb/issues/19).

The examples show some important distinctions to retain: Logitech runtime/bootloader counterparts, a SteelSeries receiver versus its mouse, and generic UF2 bootloader IDs shared across boards. The SteelSeries README also makes clear that a Rival 100 match currently means version reading, not an available firmware update.

I will start with explicit identifiers linked to their plugin documentation and preserve that context, leaving uncertain retail-model mappings unresolved. The proposal is not an implemented importer yet. I can handle this on the directory side and keep the upstream source and revision attached to each result.

Written with AI assistance.
