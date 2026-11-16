// CC-BY-SA-4.0 factual device metadata from the official Ubuntu Touch website.
// The site's published data attributes carry release, port type and maintenance
// state; installer-configs add exact prerequisites without claiming every entry
// is maintained or currently installable.
import YAML from "yaml";
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchJson, fetchText, githubFiles, githubRaw, mapLimit, type Source } from "../lib.ts";
import { mobileNames } from "./mobile-names.ts";

const SITE = "https://devices.ubuntu-touch.io";
const REPO = "ubports/installer-configs";
export interface UbuntuDevice { name: string; code: string; path: string; release: string; type: string; port: string; stage: number; supported: boolean; installer: boolean }
const decode = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function parseDevices(html: string): UbuntuDevice[] {
  if (!/License CC-BY-SA-4\.0/i.test(html)) throw new Error("ubports: site content licence changed or missing");
  const out: UbuntuDevice[] = [];
  for (const m of html.matchAll(/<li\b([^>]*\bclass="device-name"[^>]*)>([\s\S]*?)<\/li>/g)) {
    const d = Object.fromEntries([...m[1].matchAll(/(data-[\w-]+)="([^"]*)"/g)].map((a) => [a[1].toLowerCase(), decode(a[2])]));
    const path = m[2].match(/href="(\/device\/[^"?#]+)"/)?.[1];
    if (!d["data-name"] || !d["data-codename"] || !path) throw new Error("ubports: incomplete device metadata");
    out.push({ name: d["data-name"], code: d["data-codename"], path, release: d["data-release"] || "unknown",
      type: d["data-devicetype"], port: d["data-porttype"] || "unknown", stage: Number(d["data-progressstage"] || 0),
      supported: d["data-supported"] === "1", installer: d["data-installeravailable"] === "1" });
  }
  return out;
}

/** The unlock/preparation actions actually referenced by this config. */
export function prerequisites(config: any): string[] {
  if (!config || typeof config !== "object") return [];
  const actions = Array.isArray(config.unlock) ? config.unlock : [];
  return actions.map((k: unknown) => typeof k === "string" ? clean(config.user_actions?.[k]?.description) : "").filter(Boolean);
}

export function fromDevice(d: UbuntuDevice, config?: { file: string; data: any; ref: string }, date = today()): DeviceRecord[] {
  const legacy = d.release === "xenial";
  const usable = d.supported && d.stage > 0 && !legacy;
  const setup = config ? prerequisites(config.data) : [];
  const detail = `Ubuntu Touch ${d.release}; ${d.port} port ${d.code}; development stage ${d.stage}/5. ${d.supported ? "Marked supported upstream" : "Unmaintained/unsupported upstream"}.${legacy ? " Xenial is an outdated release; this listing does not establish a maintained current image." : ""} Feature support is model- and release-specific. This is not an OpenDeviceDB hardware test. Original listing: ${d.name}.`;
  return mobileNames(d.name, d.code).map(({ vendor, model }): DeviceRecord => ({
    id: makeId(vendor, model), vendor, model,
    category: d.type === "tablet" ? "tablet" : /pinebook/i.test(d.name) ? "laptop" : d.type === "phone" ? "phone" : "single-board",
    aliases: [d.name, d.code], status: usable ? "open-firmware" : "partial-protocol",
    summary: detail,
    projects: [{ name: `Ubuntu Touch (${d.code}; ${d.release}; ${d.supported ? "supported" : "unmaintained"})`, url: SITE + d.path, kind: "firmware",
      freedom: { ...(d.port.toLowerCase() === "halium" ? { nonfree: ["vendor-blobs"] as "vendor-blobs"[] } : {}),
        cloud: "none", notes: `${detail} ${d.port.toLowerCase() === "halium" ? "Halium uses Android vendor drivers and firmware; the modem and other components may remain proprietary." : "Native ports can still require proprietary peripheral firmware; this listing does not audit every component."}` },
    }, ...(config ? [{ name: `UBports Installer configuration (${d.code})`, url: `https://github.com/${REPO}/blob/${config.ref}/${config.file}`, kind: "tool" as const, license: "GPL-3.0" }] : [])],
    ...(usable ? { install: [{ project: "Ubuntu Touch", method: "other" as const, guide: SITE + d.path,
      ...(d.installer ? { installer: "https://devices.ubuntu-touch.io/installer/" } : {}), difficulty: "hard" as const,
      firmware_constraints: setup.length ? setup.join(" ") : "Read the exact device page for Android/vendor firmware prerequisites and supported variants; they are not inferred from another model or a generic image.",
      notes: `${d.installer ? "The upstream page lists installer support." : "The upstream page does not list installer support; consult its manual port instructions."} Unlocking the bootloader and installation can erase data. ${detail}`,
    }] } : {}),
    provenance: { sources: ["ubports"] }, updated: date,
  }));
}

const source: Source = {
  source: "ubports", name: "Ubuntu Touch devices", url: SITE, license: "CC-BY-SA-4.0 (device site); GPL-3.0 (installer configurations)",
  async fetch() {
    const devices = parseDevices(await fetchText(SITE));
    if (devices.length < 80) throw new Error(`ubports: unexpectedly few device entries (${devices.length})`);
    const ref: string = (await fetchJson(`https://api.github.com/repos/${REPO}/commits/master`)).sha;
    const files = (await githubFiles(REPO, ref)).filter((f) => /^v2\/devices\/[^/]+\.yml$/.test(f));
    const configs = await mapLimit(files, 8, async (file) => ({ file, ref, data: YAML.parse(await githubRaw(REPO, ref, file)) }));
    const find = (d: UbuntuDevice) => configs.find((c) => c.data.codename?.toLowerCase() === d.code.toLowerCase() || c.data.aliases?.some((a: string) => a.toLowerCase() === d.code.toLowerCase()));
    const records = devices.flatMap((d) => fromDevice(d, find(d)));
    console.error(`ubports: ${devices.length} site entries, ${records.length} named products; installer configs ${ref}`);
    return records;
  },
};
export default source;
