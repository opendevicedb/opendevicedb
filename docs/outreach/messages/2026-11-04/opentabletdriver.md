# OpenTabletDriver

- Published: 2026-11-04T16:12:33Z
- Channel: GitHub discussion
- Public evidence: https://github.com/OpenTabletDriver/OpenTabletDriver/discussions/5238
- Title: OpenDeviceDB: linking tablet models to existing driver configurations
- Category: General

Historical outgoing message, preserved as sent. Proposed work is not an implemented integration or hardware validation.

---

Hello OpenTabletDriver community,

I created [OpenDeviceDB](https://opendevicedb.org) following the release of REA, to help people find existing device drivers, firmware and protocol work by model or identifier. It is my independent open-source project.

The directory already has a libwacom source, and I would like tablet owners to discover OpenTabletDriver as well. There is no OpenTabletDriver importer yet.

I looked at the supported-tablet page and the Wacom CTH-460 configuration. Its digitizer and auxiliary-device identifiers include report-length and parser distinctions alongside the VID/PID. A downstream index should keep those matching conditions and hardware revisions visible, and link directly to the appropriate configuration and official support documentation. A USB-ID match alone would not establish that every tablet function works on every platform.

Would a small model-to-configuration index be useful? I can prepare a first sample from the existing JSON configurations and public documentation, keeping attribution and applicability limits. If there is a preferred maintained source for the support notes, a pointer would help.

[Repository](https://github.com/opendevicedb/opendevicedb). This is a directory proposal; no driver change or new hardware test has been made.

Thanks,
Sebastien Michea

Written with AI assistance.
