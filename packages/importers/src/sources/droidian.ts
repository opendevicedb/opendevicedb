// An original factual model/support index with links to the complete upstream
// pages. The device site's licence is not specified: do not copy its prose,
// installation text, credits, contact data or images, or label it GPL/MIT.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchJson, githubRaw, mapLimit, type Source } from "../lib.ts";
import { mobileNames } from "./mobile-names.ts";

const REPO = "droidian-devices/devices.droidian.org";
export interface DroidianDevice { name: string; code: string; category: string; features?: Record<string, Record<string, string[]>>; Notes?: unknown }

export function deviceFiles(controller: string): string[] {
  const files = [...controller.matchAll(/^import\s+\w+\s+from\s+['"]\.\/([^/'"]+\.json)['"]/gm)].map((m) => `src/devices/${m[1]}`);
  return [...new Set(files)].filter((p) => !p.endsWith("/template.json"));
}

/** Feature labels and status flags are facts; descriptions/notes remain upstream. */
export function featureStates(features: DroidianDevice["features"]): string {
  const out: string[] = [];
  for (const [group, states] of Object.entries(features ?? {})) {
    for (const [status, labels] of Object.entries(states)) {
      if (["notWorking", "partly", "unknown"].includes(status) && Array.isArray(labels) && labels.length) out.push(`${group} ${status}: ${labels.map(clean).filter(Boolean).join(", ")}`);
    }
  }
  return out.length ? `Upstream feature exceptions: ${out.join("; ")}.` : "Consult the upstream feature matrix; absence of a listed exception is not proof that every feature works.";
}

export function fromDevice(d: DroidianDevice, file: string, ref: string, date = today()): DeviceRecord[] {
  const category = clean(d.category).toLowerCase();
  if (!["official", "community", "potential"].includes(category)) throw new Error(`droidian: unknown category ${d.category} (${file})`);
  if (!d.code || !d.name) throw new Error(`droidian: missing model/codename (${file})`);
  const potential = category === "potential";
  const url = `https://devices.droidian.org/devices/${encodeURIComponent(d.code)}`;
  const detail = `Droidian ${category} entry ${d.code}. ${featureStates(d.features)} ${potential ? "Potential device: this does not establish a working port or an installation image." : "Android base version, vendor firmware, hardware variant and adaptation requirements must be checked on the device page before installation."} This is not an OpenDeviceDB hardware test. Original model grouping: ${d.name}.`;
  return mobileNames(d.name, d.code).map(({ vendor, model }): DeviceRecord => ({
    id: makeId(vendor, model), vendor, model, category: /tablet/i.test(d.name) ? "tablet" : "phone",
    aliases: [d.name, d.code], status: potential ? "unknown" : "open-firmware",
    summary: detail,
    projects: [{ name: `Droidian (${category}; ${d.code})`, url, kind: potential ? "other" : "firmware",
      freedom: { nonfree: ["vendor-blobs"], cloud: "none", notes: `${detail} Droidian uses Halium/libhybris and device-specific Android drivers; the OS does not replace every proprietary hardware component.` },
    }, { name: `Droidian device metadata (${d.code}; licence unspecified)`, url: `https://github.com/${REPO}/blob/${ref}/${file}`, kind: "other" }],
    ...(!potential ? { install: [{ project: "Droidian", method: "other" as const, guide: url, difficulty: "hard" as const,
      firmware_constraints: "Use only the device-specific image/adaptation and required stock Android/vendor version listed on this exact device page. A generic rootfs is not a port for an arbitrary Android phone.",
      notes: `Installation and bootloader unlocking can erase data. Read the complete upstream preparation instructions and feature matrix. ${detail}`,
    }] } : {}),
    provenance: { sources: ["droidian"] }, updated: date,
  }));
}

const source: Source = {
  source: "droidian", name: "Droidian device references", url: "https://devices.droidian.org/", license: "Unspecified upstream; factual model index only, no upstream prose or images copied",
  async fetch() {
    const ref: string = (await fetchJson(`https://api.github.com/repos/${REPO}/commits/master`)).sha;
    const files = deviceFiles(await githubRaw(REPO, ref, "src/devices/controller.ts"));
    if (files.length < 20) throw new Error(`droidian: unexpectedly few registered devices (${files.length})`);
    const groups = await mapLimit(files, 6, async (file) => fromDevice(JSON.parse(await githubRaw(REPO, ref, file)), file, ref));
    const records = groups.flat();
    console.error(`droidian ${ref}: ${files.length} registered entries, ${records.length} named products`);
    return records;
  },
};
export default source;
