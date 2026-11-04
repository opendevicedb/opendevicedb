# OpenWrt generic installation wording defect

- Published: 2026-11-04
- Channel: OpenDeviceDB issue
- Public report: https://github.com/opendevicedb/opendevicedb/issues/23
- Title: OpenWrt: generic GUI route contradicts GL-MT3000 sysupgrade-only note
- Verification: public author and exact issue body read back; current-main snapshot blob compared with the local record before publication.

Historical outgoing report. No importer correction, regenerated snapshot, deployment or hardware test is claimed.

---

The OpenWrt import can generate contradictory installation instructions for a device whose Table of Hardware note overrides the generic method label.

At main `330498bf4db61a574aacbc8ca6a035ae4056b453`, `data/imported/openwrt.json` contains `gl-inet/gl-mt3000-beryl-ax`. Its route says to upload a factory image through the stock UI, then appends the source note requiring a sysupgrade image through the GL.iNet UI and explicitly saying not to use a factory image to preserve GL U-Boot.

Source: [current imported snapshot](https://github.com/opendevicedb/opendevicedb/blob/330498bf4db61a574aacbc8ca6a035ae4056b453/data/imported/openwrt.json), [importer](https://github.com/opendevicedb/opendevicedb/blob/330498bf4db61a574aacbc8ca6a035ae4056b453/packages/importers/src/sources/openwrt.ts). The snapshot is dated 2026-10-17; its blob was compared against current main before opening this report.

`INSTALL_WAYS` gives both `GUI OEM` and `GL.Inet installation` the fixed wording `upload the factory image through the stock firmware's upgrade page`. `tohInstall` then appends the device-specific note without resolving the conflicting image type. The source note is retained, but the generated instruction still says the opposite.

Expected correction:

- Keep device-specific image requirements and warnings authoritative. Use neutral image wording for a generic GUI method, with a source-specific override only where the source establishes it.
- Keep installer/profile selection consistent with the required image type and direct users to the upstream device instructions.
- Regenerate the affected snapshot after the importer change.
- Add a regression case for a GL.iNet method with a sysupgrade-only note; it must not tell the user to upload a factory image. Check an ordinary factory-image case as well.

No device has been flashed or tested for this report. No correction or deployment is claimed. This was found while checking catalogue claims before community outreach.
