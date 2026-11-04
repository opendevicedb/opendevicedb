# NUT developers

- Sent/published: 2026-11-04T11:41:31.000Z
- Channel: email
- Public project contact: nut-upsdev@alioth-lists.debian.net
- Subject: OpenDeviceDB: indexing the NUT HCL with its driver and connection constraints
- Original content format: text/plain

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hi NUT developers,

I created OpenDeviceDB following the release of REA, to help people find and reuse existing device-protocol and interoperability work: https://opendevicedb.org . It is my independent open-source project.

I recently added an importer for NUT's data/driver.list.in. Records link to the upstream HCL and driver manuals, retain connection/driver qualifiers, and distinguish NUT's host-side software from the device firmware. HCL stars are described as protocol provenance, not as an OpenDeviceDB hardware-test score. Ambiguous product families and entries explicitly marked untested are excluded.

Importer: https://github.com/opendevicedb/opendevicedb/blob/main/packages/importers/src/sources/nut.ts

Is driver.list.in the preferred input for a downstream discovery directory, and is there a better canonical way to link a specific model with its connection and driver constraints? If an example loses an important distinction, I would be happy to correct the importer and keep the attribution and upstream links intact.

Thanks for making this information available.

Best regards,
Sebastien Michea
https://github.com/opendevicedb/opendevicedb

Written with AI assistance.
