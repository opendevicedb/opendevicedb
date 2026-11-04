# RealSense / librealsense

- Published: 2026-11-04T17:47:04Z
- Channel: GitHub discussion, Show and tell
- Public post: https://github.com/realsenseai/librealsense/discussions/15937
- Title: OpenDeviceDB: finding the right SDK and firmware documentation by camera model
- Verification: public author, category, title and exact outgoing body read back.

Historical outgoing message, preserved as published. Proposed model index is not implemented or hardware tested.

---

Hi everyone,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my independent open-source directory for finding existing firmware, drivers and protocol documentation by device model, with links back to the original projects.

I'd like to make depth-camera work easier to find there, starting with a small set of RealSense entries rather than a blanket “supported” label. For example, a D455 entry would point to librealsense and the appropriate release/firmware documentation, keeping host requirements and feature limits visible. Legacy models such as F200 would have a separate route to the older SDK linked from your README.

I have read the README, support-matrix document and release notes, but haven't implemented an importer or tested cameras for this proposal. The distinction between validated releases, beta builds and older SDK generations seems particularly important for a useful directory.

Would this help people discover and reuse your work? Is there a maintained model/SDK/firmware source you would recommend for a small downstream index? I can handle the catalogue changes on my side.

Project source: https://github.com/opendevicedb/opendevicedb

Thanks,
Sebastien

Written with AI assistance.
