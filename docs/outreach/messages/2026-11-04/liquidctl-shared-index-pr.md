# liquidctl shared-index proposal

- Published: 2026-11-04T16:52:47Z
- Channel: upstream draft pull request
- Public evidence: https://github.com/liquidctl/liquidctl/pull/943
- Title: Share driver match metadata between udev and a JSON device index
- Commit: 312f13400c5c6723b3003f0e934335e952878b9e

Requested by the maintainer in the existing discussion. This draft is not merged and does not implement an OpenDeviceDB importer.

---

The udev generator currently reads private driver matching tables directly. This makes a downstream index repeat the same discovery logic, while the README’s support-family notes and minimum recommended versions remain separate.

Extract declaration readers into a shared private helper, switch the udev generator to those readers, and add a hardware-free JSON exporter. It preserves each driver match, grouped description, USB constructor parameters, and NVIDIA PCI subsystem/I2C identifiers. It also exports all README support-family rows, MRLVs, note legend and reference links without editing their maintained values.

The current checkout exports 100 USB matches, 45 NVIDIA/I2C matches and 52 README families. The generated udev rules are byte-for-byte identical to those produced before this change.

This is a draft for feedback on the common format, following [discussion 942](https://github.com/liquidctl/liquidctl/discussions/942#discussioncomment-19402109). In particular, README families and match rows remain separate: descriptions can cover multiple models, and assigning per-family support notes to raw IDs by fuzzy name matching would invent certainty. An explicit reviewed association can be added once its representation is agreed. The declaration readers cover the USB/NVIDIA data already used by udev; they do not pretend to enumerate generic DDR4 families or replace driver-specific probe conditions. No OpenDeviceDB importer is implemented by this PR.

Validation on Linux/Python 3.14:

- Full unit tests and module doctests: **543 passed, 2 skipped**. An initial run failed the existing timing-sensitive `test_fs_backend_stores_honor_load_store_locking`; it passed in isolation and the full rerun passed. PyUSB was installed from its upstream repository as in this project’s CI.
- New tests cover shared IDs, preserved constructor data, distinct NVIDIA identities, no hardware discovery, grouped README metadata, layout failures, and deterministic export from another working directory.
- Before/after udev generator output compared byte-for-byte; Black and `git diff --check` passed.

No hardware was probed or tested. Prepared with AI assistance.
