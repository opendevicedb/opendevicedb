# dji-firmware-tools: Neo 2 client presentation

- Published: 2026-11-04T17:15:46Z
- Channel: GitHub Show and tell
- Public post: https://github.com/o-gs/dji-firmware-tools/discussions/498
- Subject: DJI Neo 2 local BLE/Wi-Fi client and protocol notes
- Verification: public author, title and exact outgoing body read back.

Historical outgoing message, preserved as published. No new hardware test or upstream tool integration is claimed. Reported Neo 2 trials remain distinct from public replay evidence.

---

Hi everyone,

I have released an experimental [DJI Neo 2 client for Linux/Python](https://github.com/smichea/dji-neo2-lan-client), using the aircraft's local BLE and Wi-Fi interfaces with stock firmware.

It implements BLE setup, SWUDP/DUML communication, local video reception and selected telemetry. Documented development trials include a short takeoff/landing cycle and yaw rotations. Full flight control, link-loss behavior and physical calibration remain incomplete. The [validation notes](https://github.com/smichea/dji-neo2-lan-client/blob/main/docs/VALIDATION.md) distinguish those reports from offline tests; the original hardware captures remain private.

Initial framing, transport and BLE leads came from Leonardo da Silva's [neo-control](https://github.com/lslv1243/neo-control), credited in the repository. Neo 1 commands are hypotheses to check against Neo 2 observations, not assumed compatibility.

I also created [OpenDeviceDB](https://opendevicedb.org) after REA was released, to make existing device-protocol and open-firmware work easier to find. Its [Neo 2 entry](https://opendevicedb.org/devices/dji/neo-2/) links the client and protocol documentation with a partial-protocol status.

I would welcome corrections to the protocol description or pointers to related research, and feedback on whether the directory entry conveys the model-specific scope clearly.

Thanks,
Sebastien Michea

Written with AI assistance.
