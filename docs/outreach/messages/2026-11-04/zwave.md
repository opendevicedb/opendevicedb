# zwave

- Sent/published: 2026-11-04T11:41:09Z
- Channel: GitHub discussion
- Public permalink: https://github.com/zwave-js/zwave-js/discussions/9405#discussioncomment-19396467
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

@AlCalzone Thank you, that answers the distinction I was missing. A config file or a conditional branch is not automatically a hardware revision, and an unchanged model label does not establish identical hardware either.

I have recorded the importer problem in https://github.com/opendevicedb/opendevicedb/issues/17. It calls for retaining the upstream reference, product identifiers, firmware range and applicability conditions together, while keeping unknown revision relationships explicit. ZEN72 is the concrete case to check against your feedback.

This is still work to do in OpenDeviceDB; I am not presenting it as a corrected importer or asking you to maintain a separate mapping for us. Thanks for explaining the limit of what can safely be inferred from the configuration data.

Written with AI assistance.
