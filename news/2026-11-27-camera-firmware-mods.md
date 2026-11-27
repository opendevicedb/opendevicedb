---
title: "Camera firmware mods: Nikon, OM System and Sony"
date: 2026-11-27T19:00:00Z
summary: "A reviewed list of community camera firmware projects becomes the 43rd source: Wonder Lantern for Nikon Z bodies, NikonFirmwarePatch for the Z8, Nikon-Patch for 14 DSLRs, db firmware for OM System and Olympus, and Sony research projects. 19 new cameras and 35 existing records enriched; the directory now holds 32,129 entries."
tags: [data]
---

Since late October, camera owners have been publishing firmware modifications at a pace
not seen since Magic Lantern's early years, often written with the help of AI coding
tools. OpenDeviceDB now lists them in a new source,
[camera firmware mods](/devices/?source=camera-mods): **19 new cameras** and
**35 existing records enriched**, mostly ones already known through libgphoto2. The
directory now holds **32,129 entries across 43 sources**.

These projects publish no common list of supported cameras, so this source is a
reviewed table rather than an automatic import. For each project it records the cameras,
the exact stock firmware each build needs, whether the author tested that body, and the
stated risk. Every link points to the project's repository at the revision we read.

## Ready to install

These projects publish a build their author has run on the camera. Their records are
*controllable* and give an installation route with the firmware version required:

- **Nikon Z**: Wonder Lantern for the [Z30](/devices/nikon/z30/) (C 1.20) and the
  [Z5](/devices/nikon/z5/) (C 1.50) adds histograms, zebras, film grain, custom
  shutter sounds and more; the [Z6](/devices/nikon/z6/) and [Z7](/devices/nikon/z7/)
  (C 3.80) get framing guides, longer exposures and display options.
  NikonFirmwarePatch adds open-gate N-RAW and log options to the [Z8](/devices/nikon/z8/),
  but only on firmware C 3.11, which Nikon has since withdrawn.
- **Nikon DSLRs**: Nikon-Patch, the long-standing NikonHacker tool, patches 14 bodies
  from the [D5100](/devices/nikon/dsc-d5100/) to the D800E for higher video bitrates,
  clean HDMI or no "star eater" filtering. Only the model and firmware pairs the tool
  actually patches are listed.
- **Nikon 1**: a custom firmware for the [J5](/devices/nikon/j5/) adds manual-lens
  metering and focus magnification; a language patch unlocks every menu language on
  Japanese-market [V2](/devices/nikon/v2/) bodies.
- **OM System and Olympus**: db firmware adds Panasonic lens aperture-ring support,
  faster bursts and an OM-1 Mark II port to the [OM-1](/devices/olympus/om-1/), and the
  [OM-5 Mark II](/devices/om-system/om-5-mark-ii/) gets similar patches.
- **Sony**: Recipe Lab, a PlayMemories camera app with 76 film-inspired recipes, is
  listed for the [A6000](/devices/sony/alpha-a6000/), the body it was built and tested on.

## Listed, but not claimed

db firmware also publishes builds for 22 other OM System and Olympus bodies, such as the
[OM-3](/devices/om-system/om-3/), E-M1 Mark III, PEN-F and E-P7, but its author can only
test three cameras. Those records name the project and the firmware it expects, without
an installation route, until a test on that body is documented.

Research projects for the Sony A7 IV, A6000, A6400, A1 II, [FX30](/devices/sony/ilme-fx30/)
and A7C II, the Nikon D90 and the Ricoh GR III/IIIx are listed the same way. Several
report boot loops during development, and none offers an end-user build yet.

## Before you flash

Modified firmware can brick a camera. Each record states the risk, whether going back to
stock firmware is documented, and the licence. Six of these projects state no licence:
their code is published, but it is not open source, and their records say so.
Three projects are left out on purpose: one distributes keys that unlock a paid Nikon
option, one ships only a closed Windows executable, and one was taken down after a legal
letter.

Nothing here was flashed or tested by OpenDeviceDB. If you have run one of these builds
on a camera that is not marked as tested, a [report](/contribute/) helps the next person
decide.
