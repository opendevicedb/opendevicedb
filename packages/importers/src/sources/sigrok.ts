// Read explicit model tables in libsigrok, GPL-3.0-or-later. The wiki does
// not declare a content license, so it is linked for documentation, not copied.
// This importer covers serial-dmm, hantek-6xxx, fx2lafw and rigol-ds only.
// Generic chips, placeholder families and models mentioned only in comments
// are excluded. A registered driver/model is upstream support, not our test.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, githubRaw, type Source } from "../lib.ts";

const REPO = "sigrokproject/libsigrok";
export const SIGROK_DRIVERS = ["serial-dmm", "hantek-6xxx", "fx2lafw", "rigol-ds"] as const;
export type SigrokDriver = typeof SIGROK_DRIVERS[number];
const MIN_PROFILES: Record<SigrokDriver, number> = { "serial-dmm": 40, "hantek-6xxx": 4, fx2lafw: 4, "rigol-ds": 30 };
const codeUrl = (driver: string) => `https://github.com/${REPO}/blob/master/src/hardware/${driver}/api.c`;
const GUIDE = "https://sigrok.org/wiki/Getting_started";
export interface Instrument { vendor: string; model: string; driver: SigrokDriver; usb?: string; details?: string }

const uncomment = (s: string) => s.replace(/\/\*[^]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const table = (s: string, name: string) => s.match(new RegExp(`\\b${name}\\[\\]\\s*=\\s*\\{([^]*?)\\n\\};`))?.[1] ?? "";
const usbId = (v: string, p: string) => `${v.slice(2).toLowerCase().padStart(4, "0")}:${p.slice(2).toLowerCase().padStart(4, "0")}`;
const concrete = (model: string) => !!clean(model) && !/\bseries\b|\d[xX](?:[a-z])?\b|[/*?]/.test(model);

export function parseSigrok(driver: SigrokDriver, text: string): Instrument[] {
  const src = uncomment(text);
  if (driver === "serial-dmm") {
    const list = src.split("SR_REGISTER_DEV_DRIVER_LIST(serial_dmm_drivers,")[1];
    if (!list) throw new Error("sigrok: serial DMM registration table missing");
    return [...list.matchAll(/\bDMM(?:_CONN|_LEN)?\(\s*"([^"]+)"\s*,\s*\w+\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"/g)]
      .filter((m) => concrete(m[3])).map((m) => ({ vendor: m[2], model: m[3], driver, details: `Select driver ${m[1]} and the device-specific serial/USB adapter and communication settings.` }));
  }
  if (driver === "hantek-6xxx") {
    return [...table(src, "dev_profiles").matchAll(/\{\s*(0x[\da-f]+)\s*,\s*(0x[\da-f]+)\s*,\s*0x[\da-f]+\s*,\s*0x[\da-f]+\s*,\s*0x[\da-f]+\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"/gi)]
      .map((m) => ({ vendor: m[3], model: m[4], driver, usb: usbId(m[1], m[2]), details: `Requires ${m[5]} from sigrok-firmware-fx2lafw, uploaded to volatile RAM by libsigrok when connecting. This is not a permanent flash.` }));
  }
  if (driver === "fx2lafw") {
    return [...table(src, "supported_fx2").matchAll(/\{\s*(0x[\da-f]+)\s*,\s*(0x[\da-f]+)\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(?:NULL|"[^"]*")\s*,\s*"([^"]+)"/gi)]
      .filter((m) => m[3] !== "Cypress" && !/^FX2 LA/.test(m[4]))
      .map((m) => ({ vendor: m[3], model: m[4], driver, usb: usbId(m[1], m[2]), details: `Requires ${m[5]} from sigrok-firmware-fx2lafw, loaded into volatile RAM. USB IDs can be shared by clones; match the physical model before choosing a profile.` }));
  }
  const vendors = new Map([...table(src, "supported_vendors").matchAll(/\[(\w+)\]\s*=\s*\{\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const series = new Map([...table(src, "supported_series").matchAll(/\[(\w+)\]\s*=\s*\{\s*VENDOR\((\w+)\)/g)].map((m) => [m[1], vendors.get(m[2])]));
  return [...table(src, "supported_models").matchAll(/\{\s*SERIES\((\w+)\)\s*,\s*"([^"]+)"\s*,\s*\{[^}]+\}\s*,\s*CH_INFO\((\d+),\s*(true|false)\)/g)].map((m) => {
    const vendor = series.get(m[1]);
    if (!vendor) throw new Error(`sigrok: unknown vendor for series ${m[1]}`);
    return { vendor, model: m[2], driver, details: `Upstream profile: ${m[3]} analog channels; digital acquisition ${m[4] === "true" ? "enabled" : "not enabled"} in this driver. ${m[1] === "DS1000" ? "DS1000 firmware versions before 0.2.4 use a different waveform format. " : ""}Check the model's supported acquisition modes and connection in the upstream documentation.` };
  });
}

export function fromInstruments(items: Instrument[], date = today()): DeviceRecord[] {
  return items.map((r) => ({
    id: makeId(r.vendor, r.model), vendor: r.vendor, model: r.model,
    category: "test-instrument", status: "controllable",
    ...(r.usb ? { identifiers: { usb: [r.usb] } } : {}),
    summary: `Measurement acquisition via libsigrok's ${r.driver} driver (${r.driver === "serial-dmm" ? "multimeter" : r.driver === "fx2lafw" ? "logic analyzer / mixed signal" : "oscilloscope"}). Features depend on the model, firmware and libsigrok version; this is not an OpenDeviceDB hardware test.`,
    projects: [{ name: `sigrok (${r.driver})`, url: codeUrl(r.driver), kind: "driver", license: "GPL-3.0-or-later",
      // RAM firmware devices are intentionally left unknown for remaining blobs.
      ...(["serial-dmm", "rigol-ds"].includes(r.driver) ? { freedom: { notes: "The open driver reads measurements from the device's existing firmware. This model table does not establish the firmware's license or remaining proprietary components." } } : {}),
    }],
    install: [{ project: "sigrok", method: "host-software", guide: GUIDE, difficulty: "medium",
      firmware_constraints: r.details,
      notes: "Install a libsigrok version containing this model and its required dependencies. Use sigrok-cli or a frontend appropriate to the instrument (PulseView is for logic/oscilloscope acquisition). Consult README.devices and the driver source for model-specific setup.",
    }],
    provenance: { sources: ["sigrok"] }, updated: date,
  }));
}

const source: Source = {
  source: "sigrok", name: "sigrok measurement instruments", url: "https://sigrok.org/", license: "GPL-3.0-or-later",
  async fetch() {
    const groups = await Promise.all(SIGROK_DRIVERS.map(async (driver) => {
      const items = parseSigrok(driver, await githubRaw(REPO, "master", `src/hardware/${driver}/api.c`));
      if (items.length < MIN_PROFILES[driver]) throw new Error(`sigrok: unexpectedly few models in ${driver} (${items.length})`);
      console.error(`sigrok: ${driver}: ${items.length} explicit model profiles`);
      return fromInstruments(items);
    }));
    return groups.flat();
  },
};
export default source;
