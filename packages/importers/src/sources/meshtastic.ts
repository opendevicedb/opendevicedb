// The official flasher's GPL-3.0 hardware index, read at an immutable revision.
// Keep inactive targets visible without claiming a working installation. DIY
// profiles without a named manufacturer are not physical product identities.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchJson, githubRaw, type Source } from "../lib.ts";

const REPO = "meshtastic/web-flasher";
const PATH = "public/data/hardware-list.json";
const GUIDE = "https://meshtastic.org/docs/getting-started/flashing-firmware/";
export interface MeshHardware {
  hwModel: number; hwModelSlug: string; displayName: string; architecture: string;
  platformioTarget: string; activelySupported: boolean; tags?: string[];
  requiresDfu?: boolean; supportLevel?: number;
}
const BRANDS: Record<string, string> = {
  LilyGo: "LILYGO", Heltec: "Heltec", RAK: "RAKwireless", "B&Q": "B&Q Consulting",
  Waveshare: "Waveshare", Seeed: "Seeed Studio", RPi: "Raspberry Pi", M5Stack: "M5Stack",
  Elecrow: "Elecrow", EByte: "EBYTE", muzi: "muzi Works", Canary: "Canary",
  RadioMaster: "RadioMaster", NomadStar: "NomadStar", Meshnology: "Meshnology",
  Axiometa: "Axiometa", Radioddity: "Radioddity",
};

export function meshName(d: MeshHardware): { vendor: string; model: string } | null {
  const name = clean(d.displayName);
  const tag = d.tags?.find((t) => BRANDS[t]);
  const vendor = tag ? BRANDS[tag] : /^Heltec /i.test(name) ? "Heltec" : "Generic";
  if ((!tag && d.tags?.includes("DIY")) || !name || /^(?:unknown|unset|generic|DIY)\b/i.test(name)) return null;
  let model = name.replace(/^(?:LILYGO|Heltec|RAKwireless|RAK|Seeed(?: Studio)?|Elecrow|LilyGo|Raspberry Pi|NomadStar|Meshnology|Axiometa|Radioddity|EBYTE)\s+/i, "");
  if (/^RAK\d/i.test(name)) model = name; // RAK3312 is the model, not just a vendor prefix.
  if (/^M5 Stack$/i.test(name)) model = "Stack";
  else model = model.replace(/^M5Stack\s+/i, "");
  const pocket = d.platformioTarget.match(/^heltec-mesh-pocket-(5000|10000)$/);
  if (pocket) model += ` (${pocket[1]} mAh)`;
  return model ? { vendor, model } : null;
}

export function fromHardware(items: MeshHardware[], ref: string, date = today()): DeviceRecord[] {
  return items.flatMap((d): DeviceRecord[] => {
    const n = meshName(d);
    if (!n || !Number.isInteger(d.hwModel) || !d.platformioTarget) return [];
    const active = d.activelySupported === true;
    const pocket = /^heltec-mesh-pocket-(5000|10000)$/.test(d.platformioTarget);
    const detail = `Upstream hardware model ${d.hwModel} (${d.hwModelSlug}), target ${d.platformioTarget}, architecture ${d.architecture}. ${active ? "Listed as actively supported" : "Not marked actively supported; no current working image is established by this entry"}.${d.supportLevel !== undefined ? ` Upstream support-level code: ${d.supportLevel}.` : ""}${n.vendor === "Generic" ? " The index does not identify a manufacturer for this named design." : ""} Board revisions, attached radio modules and frequency variants must match the upstream instructions. This is not an OpenDeviceDB hardware test.`;
    return [{
      id: makeId(n.vendor, n.model), ...n, category: "radio", status: active ? "open-firmware" : "unknown",
      aliases: [d.displayName, d.hwModelSlug, d.platformioTarget],
      summary: `Meshtastic LoRa mesh firmware listing. ${detail}`,
      projects: [{ name: `Meshtastic (${d.platformioTarget}; ${active ? "active" : "inactive"})`,
        url: `https://github.com/${REPO}/blob/${ref}/${PATH}`, kind: "firmware", license: "GPL-3.0",
        freedom: { cloud: "none", ...(d.architecture === "esp32" ? { nonfree: ["wifi", "bluetooth"] as ("wifi" | "bluetooth")[] } : {}),
          notes: `${detail} ESP32 wireless stacks may require vendor blobs; this index does not audit every component's freedom.` },
      }],
      ...(active ? { install: [{ project: "Meshtastic", method: d.requiresDfu ? "usb-bootloader" as const : "other" as const,
        guide: pocket ? "https://meshtastic.org/docs/hardware/devices/heltec-automation/meshpocket/" : GUIDE, installer: "https://flasher.meshtastic.org/", difficulty: "medium" as const,
        firmware_constraints: `Select the exact ${d.platformioTarget} board target and hardware revision. ${pocket ? "MeshPocket requires its magnetic pogo-pin cable; its USB-C port is power-only. Select the firmware for the correct battery capacity." : ""} ${d.requiresDfu ? "Upstream marks this device as requiring DFU; follow its model-specific bootloader instructions." : "Use the flashing method documented for this board; the browser flasher does not support every architecture."}`,
        notes: "Read the hardware and installation documentation for the complete board/module combination and existing bootloader before installing.",
      }] } : {}),
      provenance: { sources: ["meshtastic"] }, updated: date,
    }];
  });
}

const source: Source = {
  source: "meshtastic", name: "Meshtastic mesh radios", url: "https://meshtastic.org/", license: "GPL-3.0",
  async fetch() {
    const ref: string = (await fetchJson(`https://api.github.com/repos/${REPO}/commits/main`)).sha;
    const items: MeshHardware[] = JSON.parse(await githubRaw(REPO, ref, PATH));
    if (!Array.isArray(items) || items.length < 80) throw new Error("meshtastic: hardware index missing or unexpectedly small");
    const records = fromHardware(items, ref);
    console.error(`meshtastic ${ref}: ${items.length} targets, ${records.length} named products; DIY/unidentified targets excluded`);
    return records;
  },
};
export default source;
