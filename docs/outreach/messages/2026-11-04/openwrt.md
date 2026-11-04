# OpenWrt

- Sent: 2026-11-04T17:29:08.000Z
- Channel: published cooperation/general-inquiry email
- Public project contact: contact@openwrt.org
- Contact source: https://openwrt.org/contact
- Subject: OpenDeviceDB: cooperation around source-linked OpenWrt device discovery
- Verification: sent status, recipient, subject and exact plain-text body read back.

Historical outgoing message, preserved as sent. Delivery or a substantive response is not established. Existing imported listings are dated source data, not our hardware tests. The linked downstream defect is reported, not fixed.

---

Hello OpenWrt team,

I created OpenDeviceDB after REA was released: https://opendevicedb.org . It is my independent open-source directory linking device models to existing firmware, drivers and protocol documentation.

The catalogue already imports a subset of your Table of Hardware JSON and links device records back to OpenWrt documentation and the Firmware Selector. The importer retains model/revision names and installation notes and excludes rows without a numeric supported-release label. These are dated source imports, not hardware I have tested or a current firmware recommendation.

I would like this to help people discover OpenWrt from their device model and reach the appropriate upstream instructions. Is the ToH JSON still the preferred source for such a downstream directory, and would there be a suitable community channel for a short introduction?

While reviewing our integration, I found conflicting generic image wording in our own GL-MT3000 installation entry. I have recorded it for correction here:
https://github.com/opendevicedb/opendevicedb/issues/23
It is not fixed yet; I can handle the downstream corrections.

Importer: https://github.com/opendevicedb/opendevicedb/blob/main/packages/importers/src/sources/openwrt.ts

Thanks,
Sebastien Michea

Written with AI assistance.
