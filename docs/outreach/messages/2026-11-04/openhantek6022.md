# OpenHantek6022

- Published: 2026-11-04T16:21:52Z
- Channel: GitHub discussion
- Public evidence: https://github.com/OpenHantek/OpenHantek6022/discussions/481
- Category: Show and tell
- Title: OpenDeviceDB: proposed OpenHantek6022 links for 6022BE/BL

Historical outgoing message, preserved as published. The proposed directory change is not implemented.

---

Hello OpenHantek6022 community,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released, to help people find existing firmware, drivers and protocol work by device model. It is my independent open-source project.

The catalogue already has Hantek 6022BE/BL records [imported from libsigrok](https://github.com/opendevicedb/opendevicedb/blob/main/data/imported/sigrok.json). They link the hantek-6xxx driver but do not yet point to OpenHantek6022. I would like someone looking up their scope to discover your application and firmware documentation as well.

Your README explains a distinction worth preserving: on the 6022BL, OpenHantek6022 serves the oscilloscope mode, while sigrok is the route for the logic-analyser function; the two modes are not simultaneous. It also explains that firmware is loaded into RAM after power-up and that Linux and non-Linux support differ.

Would links with that scope be a useful addition? I can prepare the directory-side change from your README and firmware documentation, with attribution and no request for a new feed. Are there any model/revision caveats you would especially want visible? I have not tested these scopes myself, and no OpenHantek6022 index change has been made yet.

[OpenDeviceDB repository](https://github.com/opendevicedb/opendevicedb)

Thanks,
Sebastien Michea

Written with AI assistance.
