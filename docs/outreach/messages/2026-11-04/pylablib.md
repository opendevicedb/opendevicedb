# pyLabLib

- Sent: 2026-11-04T17:09:17.000Z
- Channel: project contact email
- Public project contact: pylablib@gmail.com
- Contact source: https://pylablib.readthedocs.io/en/latest/install.html#support-and-feedback
- Subject: OpenDeviceDB: helping people find existing pyLabLib device interfaces
- Verification: sent status, recipient, subject and exact plain-text alternative read back.

Historical outgoing message, preserved as sent. Delivery and a human response are not established. A directory sample is proposed; no importer or hardware test is implemented.

---

Hello Alex,

I created OpenDeviceDB after REA was released: https://opendevicedb.org . It is my independent open-source directory linking device models to existing drivers, firmware and protocol documentation, to help people find and reuse earlier work.

Your pyLabLib device documentation looks useful for this: someone searching for a Thorlabs KDC101 controller could discover its KinesisMotor interface and your connection instructions. There is no dedicated pyLabLib importer yet.

I read the APT/Kinesis documentation. A directory entry would need to keep the exact controller/model scope, operating-system differences and required driver libraries visible. More generally, camera entries would retain vendor SDK requirements and documented platform limits. Listing an existing interface would not imply that I tested the hardware.

Would a small source-linked sample, starting with the documented KDC101, be useful? I can prepare the directory-side entry from existing documentation and send it for corrections; there is no need to maintain a new data feed.

Project: https://github.com/opendevicedb/opendevicedb

Thanks,
Sebastien Michea

Written with AI assistance.
