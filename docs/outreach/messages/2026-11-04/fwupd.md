# fwupd

- Sent/published: 2026-11-04T11:49:49Z
- Channel: GitHub discussion
- Public permalink: https://github.com/fwupd/fwupd/discussions/11346
- Original content format: text/markdown

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hello everyone,

I created [OpenDeviceDB](https://opendevicedb.org) following the release of REA, to make existing device-protocol and interoperability work easier to find before someone starts investigating the same hardware again.

The directory links model names and identifiers to upstream firmware, host drivers and protocol documentation. It distinguishes an open host-side driver from the license of the device firmware, and keeps imported support listings separate from hardware verification. People can browse it, or use read-only model/USB-ID lookup through [`@opendevicedb/mcp`](https://www.npmjs.com/package/@opendevicedb/mcp).

I would welcome feedback from firmware developers on whether source-linked device records could help people discover existing plugin or protocol documentation. A useful first example would be one well-documented peripheral, with its exact model/revision, upstream link and applicability constraints. OpenDeviceDB does not currently import the LVFS catalogue or match fwupd GUIDs; that would need a separate, carefully scoped proposal.

[Project and source](https://github.com/opendevicedb/opendevicedb) · [Contribution guide](https://opendevicedb.org/contribute/)

This is my independent project. Code: AGPL-3.0; directory data: CC BY-SA 4.0. Written with AI assistance.
