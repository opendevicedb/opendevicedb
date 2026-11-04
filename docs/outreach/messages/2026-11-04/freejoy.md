# FreeJoy

- Published: 2026-11-04T21:03:55Z
- Channel: GitHub discussion, Show and tell
- URL: https://github.com/FreeJoy-Team/FreeJoy/discussions/276
- Title: OpenDeviceDB: helping BluePill owners find FreeJoy and its setup guides
- Source baseline: https://github.com/FreeJoy-Team/FreeJoy/tree/fc697108124f9ffc4ca3f3b1c6bdb2f21f94d52d
- Setup source: https://github.com/FreeJoy-Team/FreeJoyWiki/tree/077a53613224c8d775d444757c95461b064f7e2d
- Firmware flasher: https://github.com/FreeJoy-Team/FreeJoyWiki/blob/077a53613224c8d775d444757c95461b064f7e2d/eng/Firmware-flasher.md
- Verification: public author, category, title and exact body independently read back.
- Status: published; substantive response and adoption unconfirmed.

Historical outgoing message, preserved as published. No importer, new catalogue record, firmware build, initial programming, USB update or hardware test completed for this proposal.

---

Hi everyone,

I'm Sebastien, the creator of [OpenDeviceDB](https://opendevicedb.org/), an independent open-source directory helping people find firmware, drivers, tools and protocol documentation from a physical device model. [Project source](https://github.com/opendevicedb/opendevicedb).

I'd like someone looking up the documented STM32F103C8 BluePill board to discover FreeJoy and its upstream setup guides. Your firmware-flasher guide makes an important distinction for such an entry: USB updates require FreeJoy to have been installed first, so they should remain separate from initial programming.

I would keep the physical board/MCU variant, firmware release, configurator and initial-install route explicit. Configurable USB identity would remain separate from identifying a particular board or finished controller.

Would that be a useful starting point, and are there board variants or setup prerequisites a downstream catalogue should distinguish first? I would maintain the links on my side. No FreeJoy importer, new catalogue record, firmware build or hardware test has been completed for this proposal.

Thanks,
Sebastien

Prepared with AI assistance.
