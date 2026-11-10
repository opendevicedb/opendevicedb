# Linux Hardware / HWInfo — contextual report discovery

- Published: 2026-11-04T19:54:44Z
- Channel: GitHub Discussion / Show and tell
- URL: https://github.com/linuxhw/HWInfo/discussions/7
- Verification: author, category, title and exact body independently read back.
- Status: published; awaiting substantive response. No importer, probe/log upload or hardware test.

---

Hi everyone,

I'm Sebastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an independent [open-source catalogue](https://github.com/opendevicedb/opendevicedb) connecting device models to firmware, drivers and tools. I'd like its device lookups to help people discover relevant Linux Hardware reports.

The [HWInfo overview](https://github.com/linuxhw/HWInfo/tree/31b81aef173d9530eee80e016b90a4bd5c908e59) makes an important distinction: a device is listed when a driver was missing in at least one probe. That isn't a claim that the device never works. Similarly, hw-probe's `detected` status is distinct from `works`.

A downstream reference would retain the bus and subsystem IDs where applicable, distribution, kernel, architecture, observation date and source attribution. Shared IDs would not become unique retail-model matches, and an observed kernel version would not be presented as the first version supporting a device.

Would this be useful? Is there a preferred current dataset or linking convention? I noticed this repository's snapshot is from 2023, so I wouldn't present its tables as today's compatibility verdict. No Linux Hardware importer, probe upload or hardware test has been implemented by this proposal.

Thanks,
Sebastien

Prepared with AI assistance.
