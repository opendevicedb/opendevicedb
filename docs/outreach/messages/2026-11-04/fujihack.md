# Fujihack

- Published: 2026-11-04T16:39:53Z
- Channel: GitHub discussion
- Public evidence: https://github.com/orgs/fujihack/discussions/25
- Category: Show and tell
- Title: OpenDeviceDB: linking Fujifilm model research back to Fujihack

Historical outgoing message, preserved as published. The linked downstream correction is a draft PR, not a deployed fix or new hardware validation.

---

Hello Fujihack community,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my open-source directory linking device models to existing firmware, drivers and protocol research, to help people find earlier work.

Fujihack is already a source in the catalogue. Before introducing it here, I checked our presentation against your README and website and found it was too broad: a model header had been treated as evidence of a USB-debugger installation route.

I have prepared [a correction in OpenDeviceDB PR 21](https://github.com/opendevicedb/opendevicedb/pull/21). It keeps the model headers as research records and offers an experimental installation route only for the documented X-A2 1.30 and XF1 1.01 ports. The change includes a regenerated snapshot and regression tests. It is still a draft PR, not a change already deployed to the site, and I have not performed a new hardware test.

The goal is to make your existing work easier to discover, with attribution and links back, without turning research definitions into a blanket support claim. If there is a better maintained source for model/firmware feature status, I would be glad to follow it.

[Project repository](https://github.com/opendevicedb/opendevicedb)

Thanks,
Sebastien Michea

Written with AI assistance.
