# Espruino / Bangle.js

- Published: 2026-11-04T17:59:02Z
- Channel: official forum, GitHub organization discussion, Projects
- Public post: https://github.com/orgs/espruino/discussions/8038
- Title: OpenDeviceDB: Bangle.js 2 firmware and tools alongside Gadgetbridge
- Verification: public author, category, title and exact outgoing body read back.

Historical outgoing message, preserved as published. Draft PR 24 is unmerged and undeployed; no hardware test is claimed.

---

Hi everyone,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my independent open-source directory helping people find existing firmware, drivers and protocol documentation by device model, with links back to the original projects.

Bangle.js 1 and 2 are already listed through our Gadgetbridge import. Looking at the [Bangle.js 2 page](https://opendevicedb.org/devices/espruino/bangle-js-2/), I noticed it only points to that integration, so it misses the Espruino firmware and tools that make the watch programmable.

I prepared [draft PR 24](https://github.com/opendevicedb/opendevicedb/pull/24) to add the official Bangle.js 2 documentation, Espruino source and App Loader alongside the existing Gadgetbridge links. It keeps model selection and browser requirements in view and adds no new flashing procedure. Schema validation passed, and I checked that the merged record retains the Gadgetbridge links and pairing route. I haven't tested a watch for this change. The draft is not merged or live yet.

I'd welcome feedback on whether this makes the existing Espruino work easier to discover, or if there are better links to use. I'll handle the catalogue changes on my side.

Thanks,
Sebastien

Written with AI assistance.
