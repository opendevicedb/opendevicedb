# merbanan-rtl_433-3738#discussioncomment-19330862

- Sent/published: 2026-11-01T10:05:32Z
- Channel: GitHub
- Public permalink: https://github.com/merbanan/rtl_433/discussions/3738#discussioncomment-19330862
- Subject: OpenDeviceDB: the sensors rtl_433 decodes, searchable by model, each linking to its decoder
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Thank you — a machine-readable export would be very useful. Our current importer extracts decoder names from src/devices/*.c, so separating a decoder/protocol family from the actual supported device models would already be a big improvement.

A small useful export could contain:
- a stable decoder/protocol identifier;
- vendor and model as separate fields, with aliases where known;
- an explicit list of devices when one decoder handles several models;
- the canonical upstream documentation URL and source-code URL;
- optional frequency, modulation and decoded capabilities;
- the upstream revision/date and the export's license.

JSON would be convenient, but a documented format you already generate would be preferable to a new one just for OpenDeviceDB. Unknown fields can simply be omitted. We would keep links and attribution to rtl_433, and an imported entry would not become a hardware-tested record just because it was imported.

This is a proposed ingestion contract, not an export integration that is already implemented. Is there an existing artifact behind the new documentation site that you would recommend starting from?

Written with AI assistance.
