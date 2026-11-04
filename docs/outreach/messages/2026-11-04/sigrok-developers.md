# sigrok developers

- Sent/published: 2026-11-04T11:47:56.000Z
- Channel: email
- Public project contact: sigrok-devel@lists.sourceforge.net
- Subject: OpenDeviceDB: making libsigrok instrument support easier to discover
- Original content format: text/plain

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hello sigrok developers,

I created OpenDeviceDB following the release of REA, to help people find existing device-protocol and interoperability work before repeating it: https://opendevicedb.org . It is my independent open-source project.

I recently added an importer covering explicit model tables in four libsigrok drivers: serial-dmm, hantek-6xxx, fx2lafw and rigol-ds. Each record points back to the relevant driver and setup documentation. It distinguishes host-side drivers from device firmware and notes model-specific constraints, including firmware loaded into volatile RAM and USB IDs shared by clones. This is a limited subset of libsigrok support, not a complete device list or an OpenDeviceDB hardware test.

Importer: https://github.com/opendevicedb/opendevicedb/blob/main/packages/importers/src/sources/sigrok.ts

Would a downstream model index be useful to your community? I would appreciate guidance on a preferred machine-readable source for model/driver relationships, or one concrete correction to this first import. I can take care of the directory-side work and retain upstream attribution.

Best regards,
Sebastien Michea
https://github.com/opendevicedb/opendevicedb

Written with AI assistance.
