# liquidctl

- Published: 2026-11-04T16:12:31Z
- Channel: GitHub discussion
- Public evidence: https://github.com/liquidctl/liquidctl/discussions/942
- Title: OpenDeviceDB: helping people find existing cooler and controller drivers
- Category: Show and tell

Historical outgoing message, preserved as sent. Proposed work is not an implemented integration or hardware validation.

---

Hello liquidctl community,

I created [OpenDeviceDB](https://opendevicedb.org) following the release of REA. It is my open-source directory linking device models to existing drivers, protocol documentation and open firmware, to help people reuse earlier work.

I would like someone searching for a cooler or controller model to find liquidctl and its device-specific documentation. There is no dedicated liquidctl importer yet.

I have read your supported-device table and the Kraken driver matches. A directory import would need to keep the minimum recommended liquidctl version and support notes, and preserve grouped model names when an identifier covers a family—for example, the X53/X63/X73 group in `kraken3.py`. Imported listings would link to your documentation and remain distinct from our own hardware testing.

Would a small downstream index be useful? Does the README table together with explicit driver matches look like a suitable starting point, or is there a maintained source you would prefer? I can handle the importer on the OpenDeviceDB side and start with a few examples for correction.

[Repository](https://github.com/opendevicedb/opendevicedb). Thanks for making this hardware usable across platforms.

Sebastien Michea

Written with AI assistance.
