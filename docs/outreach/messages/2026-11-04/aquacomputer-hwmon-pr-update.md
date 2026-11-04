# Aquacomputer hwmon catalogue proposal — CI update

- Updated: 2026-11-04T18:57:05Z
- Channel: edit to our existing OpenDeviceDB draft pull request
- URL: https://github.com/opendevicedb/opendevicedb/pull/28
- Head: 3182905c1d7421423029275810bb486877cfbd9c
- Verification: exact current body, author, open/draft state and head read back; CI passed on this head.
- Status: unmerged and undeployed; no hardware test.

---

Owners of Aquacomputer USB cooling devices currently have no catalogue record pointing to the `aquacomputer_d5next` Linux hwmon driver. Add 12 curated records, following [Aleksa's source suggestion](https://github.com/liquidctl/liquidctl/discussions/942#discussioncomment-19403517), so model and USB-ID lookup can reach the driver and its device-specific documentation.

Cover all 13 device/family rows in the [source overview at 9ae7fd5](https://github.com/aleksamagicka/aquacomputer_d5next-hwmon/blob/9ae7fd514d635f2d8bc5cdfefbbeecd4198641e9/README.md#overview), with exactly the driver's 12 USB match entries. Keep Aquaero 5/6 grouped and High Flow USB/MPS Flow grouped because their IDs do not distinguish the physical models. Retain separate kernel baselines for sensors, fan control and Octo flow support, and distinguish standalone-driver features whose mainline availability is unspecified. Monitoring-only records remain partial; control claims name their limited scope.

Each record links the pinned README, driver and device documentation, credits the source suggestion, discloses AI assistance and explicitly carries no hardware verification. The install route points to the host-driver guide; it does not flash device firmware. The driver's GPL license is not presented as the device firmware license. No dedicated importer, upstream driver change or deployment is included.

Validation:

- `npm run validate`: 42 curated / 31,207 imported records, zero errors.
- Independent audit of the serialized YAML against the pinned source: all 13 overview rows covered, all 12 HID USB matches preserved exactly, and each stated kernel baseline retained.
- Production model search and USB lookup checked, including the grouped Aquaero and High Flow aliases; no pre-existing same-ID or USB-ID collisions found.
- [CI passed on the exact proposal head](https://github.com/opendevicedb/opendevicedb/actions/runs/41891930072).
- `git diff --check` passed. No hardware, kernel module, cooling control or firmware test performed.
