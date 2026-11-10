// OpenDeviceDB importers: one module per external source, see SPEC.md (P2).
import zigbee2mqtt from "./sources/zigbee2mqtt.ts";
import openwrt from "./sources/openwrt.ts";
import tasmota from "./sources/tasmota.ts";
import esphome from "./sources/esphome.ts";
import thingino from "./sources/thingino.ts";
import zwaveJs from "./sources/zwave-js.ts";
import tuyaLocal from "./sources/tuya-local.ts";
import openrgb from "./sources/openrgb.ts";
import libgphoto2 from "./sources/libgphoto2.ts";
import lineageos from "./sources/lineageos.ts";
import postmarketos from "./sources/postmarketos.ts";
import coreboot from "./sources/coreboot.ts";
import rtl433 from "./sources/rtl_433.ts";
import marlin from "./sources/marlin.ts";
import klipper from "./sources/klipper.ts";
import rockbox from "./sources/rockbox.ts";
import gadgetbridge from "./sources/gadgetbridge.ts";
import valetudo from "./sources/valetudo.ts";
import cloudcutter from "./sources/cloudcutter.ts";
import qmk from "./sources/qmk.ts";
import sane from "./sources/sane.ts";
import openprinting from "./sources/openprinting.ts";
import libwacom from "./sources/libwacom.ts";
import betaflight from "./sources/betaflight.ts";
import edgetx from "./sources/edgetx.ts";
import magiclantern from "./sources/magiclantern.ts";
import openmemories from "./sources/openmemories.ts";
import pktriggercord from "./sources/pktriggercord.ts";
import fujihack from "./sources/fujihack.ts";
import chdk from "./sources/chdk.ts";
import asteroidos from "./sources/asteroidos.ts";
import nut from "./sources/nut.ts";
import sigrok from "./sources/sigrok.ts";
import gp2040ce from "./sources/gp2040-ce.ts";
import libratbag from "./sources/libratbag.ts";
import opentabletdriver from "./sources/opentabletdriver.ts";
import type { Source } from "./lib.ts";

export * from "./lib.ts";

/** Registered sources, in priority order. */
export const SOURCES: Source[] = [
  zigbee2mqtt, openwrt, tasmota, esphome, thingino,
  zwaveJs, tuyaLocal, openrgb, libgphoto2, lineageos, postmarketos, coreboot, rtl433, marlin, klipper, rockbox,
  gadgetbridge, valetudo, cloudcutter, qmk, sane, openprinting, libwacom, betaflight, edgetx,
  // Cameras: these map onto libgphoto2's records (camera-ids.ts), so they come after it.
  magiclantern, openmemories, pktriggercord, fujihack, chdk,
  asteroidos, nut, sigrok, gp2040ce, libratbag, opentabletdriver,
];
