# PyMeasure

- Published: 2026-11-04T17:04:55Z
- Channel: GitHub Show and tell
- Public post: https://github.com/pymeasure/pymeasure/discussions/1587
- Subject: OpenDeviceDB: finding existing PyMeasure drivers by instrument model
- Verification: public author, title and exact outgoing body read back.

Historical outgoing message, preserved as published. A proposed index is not an implemented importer or a hardware test.

---

Hello PyMeasure community,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my independent open-source directory linking device models to existing drivers, firmware and protocol documentation, so people can find and reuse earlier work.

I would like someone looking up a laboratory instrument to find its PyMeasure driver. There is no dedicated PyMeasure importer yet. As a first example, I looked at the [Keithley 2400 documentation](https://pymeasure.readthedocs.io/en/latest/api/instruments/keithley/keithley2400.html) and its implementation, which exposes source and measurement controls.

My idea is a small downstream index linking an explicitly documented model to its driver class and your documentation, with the relevant PyMeasure version and connection/adapter requirements. A local VISA resource address would not become a product identifier, and a shared instrument family would not imply that every variant implements every operation. Your separate protocol and hardware tests are also a useful distinction: an imported listing would not claim that I tested the instrument.

Would starting with a few source-linked entries be useful? I can do the directory-side work from existing documentation and bring back a small sample for corrections, without asking you to maintain a new export. I have not implemented this importer or tested a Keithley instrument for this proposal.

[OpenDeviceDB repository](https://github.com/opendevicedb/opendevicedb)

Thanks,
Sebastien Michea

Written with AI assistance.
