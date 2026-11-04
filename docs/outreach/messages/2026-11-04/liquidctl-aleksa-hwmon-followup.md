# liquidctl / Aleksa source suggestion — downstream proposal reply

- Published: 2026-11-04T18:57:39Z
- Channel: reply within the existing GitHub discussion thread, addressed to aleksamagicka
- URL: https://github.com/liquidctl/liquidctl/discussions/942#discussioncomment-19404382
- Verification: author and exact outgoing body independently read back.
- Routing: an initial nested-reply attempt was rejected without creating a comment. The containing thread was rechecked before publishing this single reply there.

---

Thanks, @aleksamagicka — this is useful, and I'll handle the catalogue work downstream.

I reviewed your Aquacomputer sources and prepared [OpenDeviceDB draft PR 28](https://github.com/opendevicedb/opendevicedb/pull/28): 12 records covering all 13 overview rows and the 12 USB IDs. Aquaero 5/6 and High Flow USB/MPS Flow stay grouped. The records distinguish sensor/control kernel baselines and standalone-only features rather than assume everything is available in the first mainline release.

Catalogue validation, source/lookup checks and CI passed. The PR is unmerged, with no hardware test or deployment.

I also looked at your Gigabyte Waterforce and ASUS Ryujin repositories. They're useful additional leads; ASUS's newer source variants need separate checking against the older README before being presented as model-specific support.

Thanks for sharing the sources despite being short on time.

Prepared with AI assistance.
