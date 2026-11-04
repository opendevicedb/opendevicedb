# INDI — existing mount pages and source question

- Published: 2026-11-04T21:59:15Z
- Channel: GitHub Show and tell discussion
- URL: https://github.com/indilib/indi/discussions/2522
- Title: OpenDeviceDB: helping mount owners find INDI drivers
- Source: https://github.com/indilib/indi/tree/2bedd4aeafbcfc2162f2b88a1bf09f776fec4fbd
- Verification: independent public readback confirmed author, category, title and exact body.
- Status: published and read back; no substantive response observed at publication. Two curated mount records already existed; no new importer or hardware validation.

Exact outgoing body follows.

---

Hi everyone,

I created [OpenDeviceDB](https://opendevicedb.org/) to help people find existing firmware, drivers and protocol documentation for their devices.

There are already two manually curated mount pages linking to INDI's instructions: [ZWO AM5](https://opendevicedb.org/devices/zwo/am5/) and [Sky-Watcher Star Adventurer GTI](https://opendevicedb.org/devices/sky-watcher/star-adventurer-gti/). These describe host-side control with the stock firmware, and explicitly say they haven't been tested on hardware by OpenDeviceDB. The GTI page retains your instruction to disconnect Synscan before controlling the mount through INDI.

I'd welcome feedback on whether these pages help owners discover your drivers. For adding further models, is drivers.indilib.org the canonical source you'd recommend, or is there a maintained model-to-driver list that downstream projects should use? I'd keep core/third-party driver and version requirements with each entry.

Thanks for the work on INDI,
Sébastien

Prepared with AI assistance.
