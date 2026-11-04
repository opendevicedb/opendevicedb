# QMK

- Sent: 2026-11-04T17:21:01.000Z
- Channel: project contact email
- Public project contact: hello@qmk.fm
- Contact source: https://qmk.fm/support
- Subject: OpenDeviceDB: helping people find QMK from their keyboard model
- Verification: sent status, recipient, subject and exact plain-text alternative read back.

Historical outgoing message, preserved as sent. Delivery or community endorsement is not established. Existing source imports are not our own hardware tests.

---

Hello QMK team,

I created OpenDeviceDB after REA was released: https://opendevicedb.org . It is my independent open-source directory linking device models to existing firmware, drivers and protocol documentation, to help people find and reuse earlier work.

The catalogue already imports a subset of QMK keyboard metadata from the Configurator bulk export and links back to your keyboard folders and flashing documentation. It skips handwired/converter targets and filters placeholder or shared USB identifiers. These are imported source listings, not keyboards I have tested.

The current importer groups entries by manufacturer/model name. I would like feedback on whether that presentation makes the original build targets and layout/revision differences clear enough. For example, our Keychron Q1 entry currently links to the q1v2 folder:
https://opendevicedb.org/devices/keychron/q1/

Would this be useful to introduce to the community, and is the bulk export still the preferred source for a downstream directory? I can handle any catalogue corrections on my side.

Importer: https://github.com/opendevicedb/opendevicedb/blob/main/packages/importers/src/sources/qmk.ts

Thanks,
Sebastien Michea

Written with AI assistance.
