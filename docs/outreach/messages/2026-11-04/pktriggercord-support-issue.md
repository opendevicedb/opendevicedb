# PkTriggerCord source-specific support defect

- Published: 2026-11-04T16:31:00Z
- Channel: OpenDeviceDB issue
- Public evidence: https://github.com/opendevicedb/opendevicedb/issues/20
- Title: Preserve PkTriggerCord support limits instead of treating every model-table entry as controllable

This is a downstream defect report, not a new community contact or an implemented correction.

---

An entry in PkTriggerCord’s internal camera-model table does not prove that tethering works for that model. OpenDeviceDB currently turns every parsed name into a working PkTriggerCord route.

At OpenDeviceDB revision `3b704be41602c3bda540cf62d26c15000375ddf7`:

- [`parseModels` and `fromModel`](https://github.com/opendevicedb/opendevicedb/blob/3b704be41602c3bda540cf62d26c15000375ddf7/packages/importers/src/sources/pktriggercord.ts) collect names from `pslr_model.c` and unconditionally assign `status: "controllable"`, a documented interface and the same installation instructions.
- The resulting [`pentax/ist-d` entry](https://github.com/opendevicedb/opendevicedb/blob/3b704be41602c3bda540cf62d26c15000375ddf7/data/imported/pktriggercord.json) therefore advertises PkTriggerCord control.
- The upstream [README](https://github.com/asalamon74/pktriggercord/blob/c1177a4881f363455255866f6f6d8149574e4b35/README.md) lists Pentax istD and istDS as not working. Its limited and testing lists are separate from supported models. The [official project page](https://pktriggercord.melda.info/) gives further limits, including status-field/GUI restrictions on limited models and a firmware requirement for K10D.

This was found while checking sources before a community introduction. No new camera test was performed, and no upstream bug is alleged.

The importer should:

- Derive each PkTriggerCord support assertion from an explicit maintained support source, retaining the source revision and model-specific firmware/function limits.
- Stop presenting known-not-working and untested models as a working PkTriggerCord route merely because their identifiers occur in the source table. Preserve limited support explicitly rather than upgrading it to full control.
- Add regression coverage for at least one supported, limited, not-working and untested model; refresh the generated source data and merged catalogue.

A camera may still have a valid route through another project such as libgphoto2. The correction must distinguish the PkTriggerCord-specific claim from a device’s aggregate capabilities.

This issue records the defect; no importer correction is implemented yet.
