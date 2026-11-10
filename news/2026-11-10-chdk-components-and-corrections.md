---
title: "CHDK cameras, in-browser applications and a round of corrections"
date: 2026-11-10T08:00:00Z
summary: "CHDK becomes the 34th imported source, with 61 new Canon cameras and 130 existing records enriched. A new components page runs device applications in the browser, curated records add Aquacomputer cooling hardware and several stock-firmware devices, and a series of fixes makes support claims match their sources. The directory now holds 30,411 entries."
tags: [data]
---

Since the [last update](/news/2026-11-01-new-device-families/), OpenDeviceDB has gained
a new imported source, a way to run device applications directly in the browser, new
curated records, and a set of corrections that make support claims match exactly what
upstream projects document.

## CHDK for Canon compacts

[CHDK](https://chdk.fandom.com/wiki/CHDK) loads from the SD card alongside Canon's own
firmware and adds RAW/DNG capture, Lua scripting and manual controls to many PowerShot
and IXUS cameras. Its build list is now an imported source covering **191 cameras**:
**61 new entries** and **130 existing records enriched**, mostly ones already known
through libgphoto2. [Browse the CHDK records](/devices/?source=chdk).

Each record keeps the Canon firmware versions a build targets, because a CHDK build
only matches specific firmware. Cameras sold under two names, such as IXUS in Europe and
PowerShot ELPH in America, keep one record per name, each listing the other as an
alias. Matching was also tightened so that suffixes like IS or HS no longer split one
camera in two, and an IXUS 300 HS is no longer confused with the 2001 Digital IXUS 300.

## Applications that run in your browser

The new [Components & apps](/components/) page lists small applications built from
reusable components. They run in the browser, without installing anything or running
a local server. You can open an application as is, then customise how its components
connect. Device pages also list the applications compatible with that device, and
[Detect device](/detect/) can suggest them after a USB match.

The first applications target one of the USB ultrasound probes documented in the
directory. One replays a saved recording from a
[convex USB probe](/devices/unknown/puis-fx2-convex-usb-probe-04b4-4611/) and
reconstructs its images, without the probe or a configuration file. These are
interoperability research tools: rendering is uncalibrated, hardware configuration is
still incomplete, and they are not medical or diagnostic software. The WebAssembly
modules are rebuilt byte for byte in CI from published source.

## New curated records

- **Aquacomputer cooling hardware**: 12 records, such as the
  [D5 Next](/devices/aquacomputer/d5-next/), link USB IDs and model names to the
  `aquacomputer_d5next` Linux hwmon driver. This follows a source suggestion from the
  liquidctl community. Models that share a USB ID stay grouped, and each record keeps the
  kernel version from which sensors, fan control or flow readings are available.
- **Bangle.js 2**: the [watch's record](/devices/espruino/bangle-js-2/) now also links
  the official Espruino firmware, source and App Loader, alongside its Gadgetbridge
  integration.
- **Stock-firmware interoperability**: new records document open clients for the
  [V380 S300](/devices/macro-video/s300/) pan/tilt camera, a
  [Xiongmai IPG-X2-WQ-BL](/devices/xiongmai/ipg-x2-wq-bl/) camera and the
  [DJI Neo 2](/devices/dji/neo-2/) drone, plus partial protocol notes for a
  [BMV UL10-5E](/devices/bmv/ul10-5e/) linear ultrasound probe. Each record states what
  was tested and what remains unknown. The DJI Neo 2 and the probes stay at *partial
  protocol*: full flight control and calibrated imaging are not claimed.

## Corrections

- **pktriggercord**: support for Pentax cameras now follows the project's README lists.
  Fully supported cameras are *controllable*, the "limited support" ones are *partial
  protocol*, cameras still in testing have no install route, and cameras listed as
  not working no longer get a pktriggercord record.
- **Zigbee2MQTT**: devices that need custom Zigbee firmware first, such as the Xiaomi
  LYWSD03MMC thermometer (Bluetooth-only out of the box), no longer say that no flashing
  is needed.
- **Fujihack**: only the two model and firmware pairs documented upstream (X-A2 1.30 and
  XF1 1.01) offer the experimental install route. The other eight cameras remain
  research entries.
- **HackRF One**: the firmware route now describes the official `hackrf_spiflash`
  update over USB instead of a web upload.
- **OpenWrt**: routes that flash through the stock web interface no longer tell you to
  upload the "factory" image. They point to the image named on the device's OpenWrt
  page, because some devices, such as the GL.iNet GL-MT3000, need a sysupgrade image
  there instead.

## For developers

An experimental **fwupd quirk index** preserves fwupd's device declarations exactly as
written, pinned to a fwupd commit. It starts with 104 sections from three plugins. It
is kept separate from the device directory and from detection, because fwupd
identifiers can describe bootloader modes, receivers or whole chip families rather than
a single retail product.

**The directory now holds 30,411 entries across 34 imported sources.** As always, these
are documented support records rather than new hardware tests by OpenDeviceDB. Found a
mistake? [Send a correction](/contribute/) with the exact model and an upstream source.
