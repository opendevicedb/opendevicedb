# gPhoto developers

- Sent/published: 2026-11-04T11:47:54.000Z
- Channel: email
- Public project contact: gphoto-devel@lists.sourceforge.net
- Subject: OpenDeviceDB: linking camera model aliases to libgphoto2 support
- Original content format: text/plain

Historical outgoing message, preserved as sent. Counts, versions and proposed work describe the date above; they are not current support claims.

---

Hello gPhoto developers,

I created OpenDeviceDB after the release of REA, to help people find existing device-protocol and open-firmware work: https://opendevicedb.org . It is my independent open-source project.

The camera importer reads the main PTP2, Canon and Sierra model tables in libgphoto2 and keeps USB identifiers and links to the source. I have also added CHDK records, so regional IXUS/PowerShot aliases and firmware-version constraints matter. The matching code tries strict names before unambiguous normalized matches; it must not confuse the old Digital IXUS 300 with the later IXUS 300 HS.

Importer: https://github.com/opendevicedb/opendevicedb/blob/main/packages/importers/src/sources/libgphoto2.ts

Is there a maintained machine-readable model/alias export you would prefer a downstream directory to consume? A concrete example of an alias or support distinction we represent incorrectly would also help. I can review and correct the directory side; an imported listing is not presented as my own hardware test.

Thank you for the work that makes these cameras usable.

Best regards,
Sebastien Michea
https://github.com/opendevicedb/opendevicedb

Written with AI assistance.
