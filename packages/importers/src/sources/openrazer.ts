// OpenRazer (GPL-2.0-or-later): Linux kernel driver and daemon for Razer
// peripherals. The README's "Device Support" tables list each supported device
// with its USB VID:PID, grouped by type; they are read at the latest release.
// Connection variants of one product ("(Wired)", "(Wireless)", "(Receiver)")
// are merged into one record with all their IDs; years and editions stay
// distinct products. A listed device is upstream support, not an OpenDeviceDB
// hardware test.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchJson, githubRaw, type Source } from "../lib.ts";

const REPO = "openrazer/openrazer";
const SITE = "https://openrazer.github.io/";

export interface RazerDevice { section: string; name: string; usb: string }

/** Rows of the README's device tables with the "###" section they appear under. */
export function parseReadme(text: string): RazerDevice[] {
  const start = text.indexOf("## Device Support");
  if (start < 0) throw new Error("openrazer: README Device Support section missing");
  let section = "";
  const out: RazerDevice[] = [];
  for (const line of text.slice(start).split("\n")) {
    if (/^## (?!Device Support)/.test(line)) break;
    const h = line.match(/^###\s+(.+)$/);
    if (h) { section = clean(h[1]); continue; }
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([0-9A-Fa-f]{4}):([0-9A-Fa-f]{4})\s*\|/);
    if (m && section) out.push({ section, name: clean(m[1]), usb: `${m[2]}:${m[3]}`.toLowerCase() });
  }
  return out;
}

/** Connection or ID variants of the same product. */
const VARIANT = /\s*\((?:Wired|Wireless|Receiver|Bluetooth|Alternate)\)\s*$/i;

export function splitName(name: string): { vendor: string; model: string } {
  const base = name.replace(VARIANT, "").trim();
  if (base.startsWith("Razer ")) return { vendor: "Razer", model: base.slice(6) };
  const lianLi = base.match(/^Lian Li (.+)$/);
  if (lianLi) return { vendor: "Lian Li", model: lianLi[1] };
  const [vendor, ...rest] = base.split(" ");
  return { vendor, model: rest.join(" ") };
}

const category = (section: string, model: string): DeviceRecord["category"] =>
  /^Blade\b/.test(model) ? "laptop" : /headset/i.test(section) ? "audio" : "peripheral";

export function fromDevices(items: RazerDevice[], ref: string, date = today()): DeviceRecord[] {
  return items.map((d) => {
    const { vendor, model } = splitName(d.name);
    const isLaptop = category(d.section, model) === "laptop";
    return {
      id: makeId(vendor, model), vendor, model,
      ...(VARIANT.test(d.name) ? { aliases: [d.name] } : {}),
      category: category(d.section, model), status: "controllable",
      identifiers: { usb: [d.usb] },
      summary: `Supported on Linux by OpenRazer (${ref}): ${isLaptop ? "keyboard lighting and other laptop-specific features exposed by its kernel driver and daemon" : "the lighting and other settings its kernel driver and daemon expose for this device (such as DPI and polling rate on mice)"}, usable from front ends such as Polychromatic or RazerGenie. Supported features vary by device; this is not an OpenDeviceDB hardware test.`,
      projects: [{
        name: "OpenRazer", url: `https://github.com/${REPO}/blob/${ref}/README.md#device-support`, kind: "driver", license: "GPL-2.0-or-later",
        freedom: { nonfree: ["device-firmware"], cloud: "none", notes: "OpenRazer talks to the device's existing firmware over USB; it does not replace it and needs no Razer account or Synapse." },
      }],
      install: [{
        project: "OpenRazer", method: "host-software", guide: SITE, difficulty: "medium",
        notes: "Install the OpenRazer kernel modules (DKMS) and daemon from your distribution or the OpenRazer repositories, add your user to the plugdev group, then reboot. Check that your version lists this device.",
      }],
      provenance: { sources: ["openrazer"] }, updated: date,
    } satisfies DeviceRecord;
  });
}

const source: Source = {
  source: "openrazer", name: "OpenRazer devices", url: "https://github.com/openrazer/openrazer", license: "GPL-2.0-or-later",
  async fetch() {
    const ref: string = (await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)).tag_name;
    const devices = parseReadme(await githubRaw(REPO, ref, "README.md"));
    if (devices.length < 200) throw new Error(`openrazer: unexpectedly few devices (${devices.length})`);
    const records = fromDevices(devices, ref);
    console.error(`openrazer ${ref}: ${devices.length} README rows`);
    return records;
  },
};
export default source;
