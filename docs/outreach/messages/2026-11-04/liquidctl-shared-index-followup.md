# liquidctl shared-index follow-up

- Published: 2026-11-04T16:53:43Z
- Channel: GitHub discussion reply
- Public evidence: https://github.com/liquidctl/liquidctl/discussions/942#discussioncomment-19402348

Historical outgoing message, preserved as published. The linked upstream proposal is a draft PR; no OpenDeviceDB importer or hardware validation is claimed.

---

Thanks for pointing me at the generator. I have opened [draft PR 943](https://github.com/liquidctl/liquidctl/pull/943) with a concrete proposal.

It extracts shared declaration readers for the existing udev generator and a JSON exporter. The export retains the driver classes, grouped descriptions and USB constructor parameters, and keeps NVIDIA PCI subsystem and I2C identifiers distinct. It also reads the README family table, MRLVs, support notes and references without changing their maintained values.

The generated udev rules are byte-for-byte unchanged. The full test rerun passed with 543 tests and 2 skipped; the PR records an initial failure of the existing timing-sensitive keyval test, which passed in isolation and on the full rerun. No hardware was probed or tested.

For review, the README families and driver match rows remain separate rather than guessing associations from similar names. I would welcome your feedback on the format and how you would prefer explicit family-to-match associations to be represented. No OpenDeviceDB importer is implemented yet.

Written with AI assistance.
