// libratbag (MIT): configuration of gaming mice and a few keyboards/headsets,
// used by Piper and ratbagctl. Each data/devices/*.device file names one product
// and its USB/Bluetooth IDs. Grouped names ("G102/G103/G203") become one record
// per named model sharing the listed IDs; generic chip profiles (SinoWealth) and
// the openinput protocol entry are excluded. A data file is upstream support,
// not an OpenDeviceDB hardware test.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchJson, githubFiles, githubRaw, mapLimit, type Source } from "../lib.ts";

const REPO = "libratbag/libratbag";
const GUIDE = "https://github.com/libratbag/libratbag#installing-libratbag";
const PIPER = "https://github.com/libratbag/piper";

export interface RatbagDevice { file: string; name: string; usb: string[]; bluetooth: string[]; driver: string; type: string }

/** Parse the [Device] section of a .device file. */
export function parseDevice(file: string, text: string): RatbagDevice | null {
  const section = text.split(/^\[/m).find((s) => s.startsWith("Device]"));
  if (!section) return null;
  const get = (k: string) => clean(section.match(new RegExp(`^${k}\\s*=(.*)$`, "m"))?.[1]);
  const matches = get("DeviceMatch").split(";").map((m) => m.trim().toLowerCase()).filter(Boolean);
  const ids = (bus: string) => [...new Set(matches.filter((m) => m.startsWith(`${bus}:`)).map((m) => m.slice(bus.length + 1)))]
    .filter((id) => /^[0-9a-f]{4}:[0-9a-f]{4}$/.test(id)).sort();
  return { file, name: get("Name"), usb: ids("usb"), bluetooth: ids("bluetooth"), driver: get("Driver"), type: get("DeviceType") || "mouse" };
}

const VENDOR_FIX: Record<string, string> = { asustek: "ASUS", sinowealth: "SinoWealth", "g.skill": "G.Skill" };
const MULTI_WORD = ["Mars Gaming"];
/** Entries naming a product family rather than one product (e.g. "SteelSeries Rival" lists Rival 300 IDs). */
const FAMILY = new Set(["SteelSeries Rival"]);
/** One product line written with a size variant: keep one record, the full name stays an alias. */
const SAME_PRODUCT: Record<string, string> = { "Glorious Model O/O-": "Model O" };
/** Files whose Name omits the brand: the driver and file name say Logitech. */
const NO_BRAND = /^(G5|G9x|MX518)\b/;

/** Vendor and model(s) from a device name; null for generic or protocol entries. */
export function splitName(name: string): { vendor: string; models: string[] } | null {
  // Generic chip profiles, the openinput protocol and family entries whose IDs span several products.
  if (/generic|^openinput$/i.test(name) || FAMILY.has(name)) return null;
  let n = name.replace(/\s*\[[^\]]*\]\s*$/, "").trim(); // "G9x [Original]"
  if (NO_BRAND.test(n)) n = `Logitech ${n}`;
  const multi = MULTI_WORD.find((v) => n.startsWith(`${v} `));
  const vendorRaw = multi ?? n.split(" ")[0];
  const vendor = VENDOR_FIX[vendorRaw.toLowerCase()] ?? vendorRaw;
  if (SAME_PRODUCT[n]) return { vendor, models: [SAME_PRODUCT[n]] };
  // Logitech's "Gaming Mouse G302" / "G402 Gaming Mouse": the model number is the product name.
  const rest = n.slice(vendorRaw.length).trim().replace(/^Gaming Mouse (?=G[ \d])|(?<=^G\d+) Gaming Mouse$/, "");
  if (!rest) return null;
  // "Model O/O-" is one product line; split only slash lists of model numbers.
  const m = rest.match(/^(.*?)(\b[A-Z]*\d+[A-Za-z]*(?:\/[A-Z]*\d+[A-Za-z]*)+)(.*)$/);
  if (!m) return { vendor, models: [rest] };
  const [, before, list, after] = m;
  const parts = list.split("/");
  const prefix = parts[0].match(/^[A-Z]*/)![0];
  return { vendor, models: parts.map((p) => clean(`${before}${/^\d/.test(p) ? prefix : ""}${p}${after}`)) };
}

const category = (type: string): DeviceRecord["category"] => "peripheral";

export function fromDevices(items: RatbagDevice[], ref: string, date = today()): DeviceRecord[] {
  return items.flatMap((d) => {
    const s = splitName(d.name);
    if (!s || (!d.usb.length && !d.bluetooth.length)) return [];
    return s.models.map((model): DeviceRecord => {
      const others = s.models.filter((m) => m !== model);
      const renamed = `${s.vendor} ${model}` !== d.name;
      return {
        id: makeId(s.vendor, model), vendor: s.vendor, model,
        ...(renamed ? { aliases: [d.name] } : {}),
        category: category(d.type), status: "controllable",
        identifiers: { ...(d.usb.length ? { usb: d.usb } : {}) },
        summary: `Configurable on Linux with libratbag (${d.driver} driver) and the Piper or ratbagctl front ends: resolutions, buttons, LEDs and profiles where the device exposes them.${others.length ? ` The upstream entry "${d.name}" covers ${s.models.join(", ")} with the same IDs.` : ""}${d.bluetooth.length ? ` Also matched over Bluetooth (${d.bluetooth.join(", ")}).` : ""} Supported features vary by model and firmware; this is not an OpenDeviceDB hardware test.`,
        projects: [{
          name: "libratbag", url: `https://github.com/${REPO}/blob/${ref}/data/devices/${d.file}`, kind: "driver", license: "MIT",
          freedom: { nonfree: ["device-firmware"], cloud: "none", notes: "libratbag configures the device's existing firmware over USB or Bluetooth; it does not replace it." },
        }, { name: "Piper", url: PIPER, kind: "tool", license: "GPL-2.0-or-later" }],
        install: [{
          project: "libratbag", method: "host-software", guide: GUIDE, difficulty: "easy",
          notes: "Install libratbag (ratbagd) and Piper from your Linux distribution, or build from source if your distribution's version predates this device file.",
        }],
        provenance: { sources: ["libratbag"] }, updated: date,
      };
    });
  });
}

const source: Source = {
  source: "libratbag", name: "libratbag mice and peripherals", url: "https://github.com/libratbag/libratbag", license: "MIT",
  async fetch() {
    const head = await fetchJson(`https://api.github.com/repos/${REPO}/commits/master`);
    const ref: string = head.sha;
    const files = (await githubFiles(REPO, ref)).filter((p) => p.startsWith("data/devices/") && p.endsWith(".device"));
    const devices = (await mapLimit(files, 8, async (p) => parseDevice(p.slice("data/devices/".length), await githubRaw(REPO, ref, p))))
      .filter((d): d is RatbagDevice => !!d);
    if (devices.length < 100) throw new Error(`libratbag: unexpectedly few device files (${devices.length})`);
    const records = fromDevices(devices, ref);
    console.error(`libratbag ${ref.slice(0, 12)}: ${devices.length} device files, ${records.length} records`);
    return records;
  },
};
export default source;
