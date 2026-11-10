// OpenTabletDriver (LGPL-3.0): a cross-platform user-mode driver for graphics
// tablets. Each configuration (OpenTabletDriver.Configurations/Configurations/
// <Vendor>/<Model>.json) names one tablet and the USB identifiers it matches;
// TABLETS.md gives the support status and notes. Both are read at the latest
// release. Identifier matching also depends on report length and parser, so a
// VID:PID match is a hint, not proof. Entries marked "Questionable" upstream are
// excluded. A configuration is upstream support, not an OpenDeviceDB hardware test.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchJson, githubFiles, githubRaw, mapLimit, type Source } from "../lib.ts";

const REPO = "OpenTabletDriver/OpenTabletDriver";
const DIR = "OpenTabletDriver.Configurations/Configurations/";
const SITE = "https://opentabletdriver.net/";

export interface Tablet { file: string; vendor: string; name: string; usb: string[] }
export type Status = { status: string; notes: string };

const hex = (n: number) => n.toString(16).padStart(4, "0");

export function parseConfig(file: string, text: string): Tablet | null {
  const cfg = JSON.parse(text.replace(/^﻿/, ""));
  const name = clean(cfg.Name);
  const vendor = file.split("/")[0];
  if (!name) return null;
  const ids = [...(cfg.DigitizerIdentifiers ?? []), ...(cfg.AuxiliaryDeviceIdentifiers ?? [])]
    .filter((i: any) => Number.isInteger(i?.VendorID) && Number.isInteger(i?.ProductID))
    .map((i: any) => `${hex(i.VendorID)}:${hex(i.ProductID)}`);
  return { file, vendor, name, usb: [...new Set(ids)].sort() };
}

/** TABLETS.md rows: tablet name -> status and notes. */
export function parseTabletsMd(text: string): Map<string, Status> {
  const out = new Map<string, Status>();
  for (const line of text.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || !cells[1] || /^-+$|^Tablet$/.test(cells[1]) || /^:?-+:?$/.test(cells[2])) continue;
    out.set(cells[1], { status: cells[2], notes: cells[3] ?? "" });
  }
  return out;
}

export function fromTablets(items: Tablet[], statuses: Map<string, Status>, ref: string, date = today()): DeviceRecord[] {
  return items.flatMap((t) => {
    const s = statuses.get(t.name);
    if (s && /questionable/i.test(s.status)) return [];
    const model = t.name.slice(t.vendor.length).trim();
    if (!model || !t.name.toLowerCase().startsWith(t.vendor.toLowerCase())) return [];
    const statusText = s ? `OpenTabletDriver lists it as "${s.status}"${s.notes ? ` (${s.notes.replace(/\.$/, "")})` : ""}.` : "Not yet listed in OpenTabletDriver's TABLETS.md at this release.";
    return [{
      id: makeId(t.vendor, model), vendor: t.vendor, model,
      category: "peripheral", status: "controllable",
      ...(t.usb.length ? { identifiers: { usb: t.usb } } : {}),
      summary: `Supported by OpenTabletDriver (${ref}), a user-mode tablet driver for Windows, Linux and macOS. ${statusText} Matching also depends on report length and parser, so a USB ID alone is a hint; this is not an OpenDeviceDB hardware test.`,
      projects: [{
        name: "OpenTabletDriver", url: `https://github.com/${REPO}/blob/${ref}/${DIR}${t.file.split("/").map(encodeURIComponent).join("/")}`, kind: "driver", license: "LGPL-3.0-only",
        freedom: { nonfree: ["device-firmware"], cloud: "none", notes: "OpenTabletDriver reads the tablet's reports from its existing firmware; it does not replace it." },
      }],
      install: [{
        project: "OpenTabletDriver", method: "host-software", guide: SITE, difficulty: "easy",
        notes: "Install OpenTabletDriver for your operating system; vendor tablet drivers may need to be removed first. Check the tablet's entry in TABLETS.md for quirks or missing features.",
      }],
      provenance: { sources: ["opentabletdriver"] }, updated: date,
    } satisfies DeviceRecord];
  });
}

const source: Source = {
  source: "opentabletdriver", name: "OpenTabletDriver tablets", url: "https://github.com/OpenTabletDriver/OpenTabletDriver", license: "LGPL-3.0-only",
  async fetch() {
    const ref: string = (await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)).tag_name;
    const files = (await githubFiles(REPO, ref)).filter((p) => p.startsWith(DIR) && p.endsWith(".json"));
    const tablets = (await mapLimit(files, 8, async (p) => parseConfig(p.slice(DIR.length), await githubRaw(REPO, ref, p)))).filter((t): t is Tablet => !!t);
    if (tablets.length < 250) throw new Error(`opentabletdriver: unexpectedly few configurations (${tablets.length})`);
    const statuses = parseTabletsMd(await githubRaw(REPO, ref, "TABLETS.md"));
    const records = fromTablets(tablets, statuses, ref);
    console.error(`opentabletdriver ${ref}: ${tablets.length} configurations, ${statuses.size} TABLETS.md rows, ${records.length} records`);
    return records;
  },
};
export default source;
