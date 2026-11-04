# flashrom developers

- Sent: 2026-11-04T16:56:11.000Z
- Channel: developer mailing-list email
- Public project contact: flashrom@flashrom.org
- Contact source: https://github.com/flashrom/flashrom/blob/0172149da9479da7bad0f939e2cdd6b23e13c69d/doc/contact.rst
- Subject: OpenDeviceDB: linking programmers and boards to existing flashrom support
- Verification: sent status, recipient, subject and exact plain-text body read back.
- Publication: unconfirmed; non-subscriber messages are moderated under the list policy.

Historical outgoing message, preserved as sent. A sent email is not a published list post. No importer or hardware test is claimed.

---

Hello flashrom community,

I created OpenDeviceDB after REA was released: https://opendevicedb.org . It is my independent open-source directory linking device models to existing firmware, drivers and protocol documentation, to help people find and reuse earlier work.

The directory already has a coreboot source, but no dedicated flashrom importer. I would like someone looking up a programmer or board to find the appropriate flashrom documentation as well.

I read your supported-hardware documentation. A directory should keep flash chips, programmers and boards distinct, retain the per-operation tested status for chips and the board test states, and point to the relevant source revision and setup instructions. A chip or board identifier alone should not become a blanket claim that every programming operation works.

Would a small source-linked entry for a programmer, starting from documentation such as your Bus Pirate page, be useful? I can prepare the directory-side example from existing sources and bring it back for corrections. There is no need to create a new data feed. I have not tested a programmer or flashing workflow for this proposal.

Project: https://github.com/opendevicedb/opendevicedb

Thanks,
Sebastien Michea

Written with AI assistance.
