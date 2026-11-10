# fwupd: implemented sample follow-up

- Published: 2026-11-04T18:08:31Z
- Channel: reply in the existing GitHub discussion
- Public evidence: https://github.com/fwupd/fwupd/discussions/11346#discussioncomment-19403540
- Verification: author and exact outgoing body read back.

Historical outgoing message, preserved as published. Draft PR 25 is unmerged; no delivered fwupd integration or hardware validation is claimed.

---

I have a concrete first implementation now: [OpenDeviceDB draft PR 25](https://github.com/opendevicedb/opendevicedb/pull/25), with a [documented sample](https://github.com/opendevicedb/opendevicedb/blob/feat/fwupd-identifier-index/docs/fwupd-index.md).

It preserves all 104 declarations from the Logitech HID++, SteelSeries and UF2 quirks at a pinned fwupd revision, including original instance strings, properties, counterpart references and links to the plugin READMEs. Exact instance lookup keeps HIDRAW, USB and tunneled identities separate. Shared UF2 families remain declarations rather than invented retail models.

The 154 importer tests pass, including seven new regression tests, and the generated sample matches the source sections/properties. This is a three-plugin research index, not yet the full plugin import or user-facing device lookup; physical-model mapping remains work in progress. The draft is unmerged and no hardware was tested.

Written with AI assistance.
