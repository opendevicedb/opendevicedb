# SDRangel

- Published: 2026-11-04T16:26:16Z
- Channel: GitHub discussion
- Public evidence: https://github.com/f4exb/sdrangel/discussions/3062
- Category: Show and tell
- Title: OpenDeviceDB: making existing SDR hardware support easier to find

Historical outgoing message, preserved as published. The proposed importer is not implemented.

---

Hello SDRangel community,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my open-source directory of existing device drivers, open firmware and protocol documentation, intended to help people reuse work before starting another investigation.

I would like a person looking up an SDR model to discover SDRangel and the appropriate device-plugin documentation. There is no SDRangel importer in the directory yet.

I read the sample-source plugin documentation. An index would need to distinguish actual hardware from file, test and network sources, keep receive and transmit capabilities separate, and show required host libraries. The SoapySDR input documentation also explains why a generic backend match is not equivalent to full native-plugin support or a bundled device driver.

Would a small model-to-plugin index be useful? I can prepare a first sample on the OpenDeviceDB side using your existing plugin documentation, with attribution and direct upstream links. I would welcome corrections to the presentation or a pointer to a better maintained source. No new hardware test or SDRangel integration has been made.

[Repository](https://github.com/opendevicedb/opendevicedb)

Thanks,
Sebastien Michea

Written with AI assistance.
