# DepthAI / Luxonis

- Published: 2026-11-04T17:52:07Z
- Channel: GitHub discussion, Show and tell
- Public post: https://github.com/luxonis/depthai/discussions/1255
- Title: OpenDeviceDB: helping people find DepthAI by OAK camera model
- Verification: public author, category, title and exact outgoing body read back.

Historical outgoing message, preserved as published. Proposed OAK model index is not implemented or hardware tested.

---

Hi everyone,

I created [OpenDeviceDB](https://opendevicedb.org) after REA was released. It is my independent open-source directory that helps people find existing drivers, firmware and protocol documentation from a device model, with links back to the original projects.

I'd like to include OAK cameras so someone holding a camera can find the right DepthAI documentation. A small first entry could link the OAK-D product page to the SDK and examples, keeping the RVC platform, USB/network variant and API generation explicit. Your Device Information example is useful here: product name, board name and board revision should remain separate, rather than treating a per-device ID as a model.

I've read the hardware documentation and the v3/v2 guidance in depthai-core, but haven't built an importer or tested an OAK device for this proposal. The catalogue would link to your maintained guides for capabilities and setup.

Would this be useful, and is there a preferred maintained source for the model/board/revision relationships? I can prepare the catalogue entries on my side and would welcome feedback on their scope.

Project source: https://github.com/opendevicedb/opendevicedb

Thanks,
Sebastien

Written with AI assistance.
