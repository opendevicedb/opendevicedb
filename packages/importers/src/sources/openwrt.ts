// OpenWrt Table of Hardware, from the wiki's JSON dataset dump (openwrt.org/toh.json:
// {columns[], captions[], entries[][]}). Only devices whose "Supported Current Rel" is
// a release number are kept (not EOL, snapshot-only, or unsupported).
//
// Install routes (SPEC R1) come from the "Installation method(s)" column, the release image
// URLs (a factory image is the one meant to replace the stock firmware) and the device page;
// the Firmware Selector link is built from the image's profile id, looked up in the release's
// profiles.json at import time.
import { makeId, today, type DeviceRecord, type InstallRoute } from "@opendevicedb/core";
import { clean, fetchJson, mapLimit, type Source } from "../lib.ts";

export const TOH_URL = "https://openwrt.org/toh.json";

/** "Device Type" → category. Missing types fall back to "other"; null drops the row. */
export const DEVICE_TYPE_CATEGORIES: Record<string, string | null> = {
  "wifi router": "router",
  "router": "router",
  "travel router": "router",
  "travel router - battery powered": "router",
  "wifi ap": "router",
  "range extender": "router",
  "modem": "router",
  "single board computer": "single-board",
  "camera": "ip-camera",
  "nas": "other",
  "switch": "other",
  "emulator": null, // virtual machines, not hardware
};

export function tohCategory(deviceType: string | null | undefined): string | null {
  const k = clean(deviceType).toLowerCase();
  return k in DEVICE_TYPE_CATEGORIES ? DEVICE_TYPE_CATEGORIES[k] : "other";
}

const isRelease = (v: unknown) => typeof v === "string" && /^\d+\.\d+(\.\d+)?$/.test(v.trim());

/** FCC ID from the lookup URLs the wiki stores (fcc.io/R7F/A1, fcc.report/FCC-ID/X, fccid.io/X…). */
export function fccFromUrl(u: string): string | null {
  const m = clean(u).match(/^https?:\/\/([^/\s]+)(\/[^?#\s]*)?/i);
  if (!m) return null;
  const host = m[1], path = (m[2] ?? "").replace(/^\/(fcc-id\/)?/i, "");
  const id = (host.includes(".") ? path.replace(/\//g, "") : host).toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{4,}$/.test(id) ? id : null;
}

const pageUrl = (e: Record<string, any>) => {
  const dp = clean(e.devicepage);
  if (dp.startsWith("toh:")) return `https://openwrt.org/${dp.replace(/:/g, "/")}`;
  return `https://openwrt.org/toh/hwdata/${clean(e.deviceid).replace(/:/g, "/")}`;
};

const list = (v: unknown): string[] => (Array.isArray(v) ? v : v == null ? [] : [v]).map(clean).filter((x) => x && x !== "-");

// ---------- install routes ----------

export const SELECTOR = "https://firmware-selector.openwrt.org/";
export const FACTORY_GUIDE = "https://openwrt.org/docs/guide-quick-start/factory_installation";
export const selectorUrl = (version: string, target: string, id: string) =>
  `${SELECTOR}?version=${encodeURIComponent(version)}&target=${encodeURIComponent(target)}&id=${encodeURIComponent(id)}`;

/** Release image URL → its directory (profiles.json lives there), version and target. */
export function releaseImage(u: string): { dir: string; version: string; target: string; file: string } | null {
  const m = clean(u).match(/^(https:\/\/downloads\.openwrt\.org\/releases\/([^/]+)\/targets\/([^/]+)\/([^/]+))\/([^/]+)$/);
  return m ? { dir: m[1], version: m[2], target: `${m[3]}/${m[4]}`, file: m[5] } : null;
}

/** Image file name → profile id, from a profiles.json ({ profiles: { id: { images: [{ name }] } } }). */
export function imageProfiles(profilesJson: any): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, p] of Object.entries<any>(profilesJson?.profiles ?? {})) for (const img of p?.images ?? []) if (img?.name) out.set(img.name, id);
  return out;
}

interface Way { method: InstallRoute["method"]; difficulty: InstallRoute["difficulty"]; tools?: string[]; opens_device?: boolean; brick_risk?: InstallRoute["brick_risk"]; how: string }

const SERIAL_TOOLS = ["USB-serial adapter (3.3 V)", "Computer with a TFTP server", "Ethernet cable"];
/**
 * ToH "Installation method(s)" values → route, easiest first (the first rule that matches
 * wins). "see git-commit", "see devicepage", "see forum" and "unknown" match nothing.
 */
export const INSTALL_WAYS: [RegExp, Way][] = [
  [/^(GUI OEM|GUI generic|GL\.?inet installation)$/i, { method: "vendor-upload", difficulty: "easy", tools: ["Computer with a web browser"], opens_device: false, brick_risk: "low", how: "upload {image} through the stock firmware's upgrade page" }],
  [/^(SD card|Sunxi installation)$/i, { method: "sd-card", difficulty: "medium", tools: ["microSD card and a card reader"], opens_device: false, how: "write the image to an SD card" }],
  [/^CF card$/i, { method: "sd-card", difficulty: "medium", tools: ["CompactFlash card and a card reader"], how: "write the image to a CompactFlash card" }],
  [/web recovery|recovery gui/i, { method: "other", difficulty: "medium", tools: ["Computer with a web browser", "Ethernet cable"], opens_device: false, how: "upload the image to the bootloader's recovery web page" }],
  [/serial/i, { method: "serial", difficulty: "hard", tools: SERIAL_TOOLS, opens_device: true, how: "flash from the bootloader over a serial console" }],
  [/tftp|ftp|restoration tool/i, { method: "other", difficulty: "medium", tools: ["Computer with a TFTP server", "Ethernet cable"], opens_device: false, how: "send the image to the bootloader's network recovery over TFTP" }],
  [/^(x86 installation|USB|U-Boot USB recovery)$/i, { method: "other", difficulty: "medium", tools: ["USB drive or the target disk", "Computer to write the image"], how: "write the image to a USB drive or disk" }],
  [/^(Sysupgrade|CLI generic|Telnet)$/i, { method: "other", difficulty: "medium", tools: ["Computer with an SSH or telnet client"], opens_device: false, how: "flash from a command line on the running firmware" }],
  [/^JTAG$/i, { method: "other", difficulty: "hard", tools: ["JTAG adapter"], opens_device: true, how: "flash over JTAG" }],
];

const page = (e: Record<string, any>) => (clean(e.devicepage).startsWith("toh:") ? pageUrl(e) : null);
/** Commit that added support (its message has the install steps); only hosts that answer over https. */
const commitUrl = (e: Record<string, any>) => {
  const u = clean(e.supportedsincecommit);
  return /^https:\/\/(git\.openwrt\.org|github\.com\/openwrt)\//.test(u) ? u : null;
};

/**
 * Routes of one ToH row: one per install method kind, all pointing at the device page (or,
 * without one, at the commit that added support when the ToH says "see git-commit", else at
 * the generic factory installation guide), with the Firmware Selector when the profile is
 * known. Without a recognised method: a "medium" route when a factory image exists (it is
 * made to replace the stock firmware), else a "hard" one, both saying the method is not
 * recorded. Reversibility is never given: going back to stock is device-specific.
 */
export function tohInstall(e: Record<string, any>, profiles?: Map<string, string>): InstallRoute[] {
  const methods = list(e.installationmethods);
  const gitCommit = methods.some((m) => /git-commit/i.test(m));
  const guide = page(e) ?? (gitCommit ? commitUrl(e) : null) ?? FACTORY_GUIDE;
  const images = [...list(e.firmwareopenwrtinstallurl), ...list(e.firmwareopenwrtupgradeurl)];
  let installer: string | undefined;
  for (const u of images) {
    const img = releaseImage(u);
    const id = img && profiles?.get(`${img.dir}/${img.file}`);
    if (img && id) { installer = selectorUrl(img.version, img.target, id); break; }
  }
  const comment = clean(e.commentinstallation);
  // Which image the stock upgrade page takes differs by device (factory, sysupgrade, initramfs):
  // the generic wording stays neutral and the Table of Hardware note decides. Only an explicit
  // "do not use the factory image" names the image here.
  const image = /do\s*(?:n['o]?t|not)\s+use\s+(?:the\s+)?['"]?factory/i.test(comment)
    ? "the sysupgrade image (not the factory image, as the note below says)"
    : "the OpenWrt image the device page names";
  const tail = (s: string) => [s, comment ? `Table of Hardware note: ${comment.length > 300 ? comment.slice(0, 297) + "..." : comment}` : ""].filter(Boolean).join(" ");
  const byMethod = new Map<string, { way: Way; names: string[] }>();
  for (const m of methods) {
    const way = INSTALL_WAYS.find(([re]) => re.test(m))?.[1];
    if (!way) continue;
    const g = byMethod.get(way.method);
    if (!g) byMethod.set(way.method, { way, names: [m] });
    else {
      g.names.push(m);
      if (INSTALL_WAYS.findIndex(([, w]) => w === way) < INSTALL_WAYS.findIndex(([, w]) => w === g.way)) g.way = way;
    }
  }
  const link = { guide, ...(installer ? { installer } : {}) };
  if (!byMethod.size) {
    const factory = images.some((u) => /factory/i.test(u.split("/").pop() ?? ""));
    return [{
      project: "OpenWrt", method: "other", ...link, difficulty: factory ? "medium" : "hard",
      notes: tail(factory
        ? "The Table of Hardware does not record the install method. A factory image exists (it is made to replace the stock firmware, usually through its upgrade page or recovery mode): read the guide first."
        : "The Table of Hardware does not record the install method and there is no factory image: installing may need the bootloader, a serial console or opening the device. Read the guide first."),
    }];
  }
  return [...byMethod.values()].map(({ way, names }) => {
    const { how, method, ...w } = way;
    return { project: "OpenWrt", method, ...link, ...w, notes: tail(`Table of Hardware method: ${names.join(", ")} (${how.replace("{image}", image)}).`) };
  });
}

export function fromToh(toh: { columns: string[]; entries: unknown[][] }, date = today(), profiles?: Map<string, string>): { records: DeviceRecord[]; skipped: number } {
  const records: DeviceRecord[] = [];
  let skipped = 0;
  for (const row of toh.entries) {
    const e = Object.fromEntries(toh.columns.map((c, i) => [c, row[i]]));
    const category = tohCategory(e.devicetype);
    const vendor = clean(e.brand), base = clean(e.model);
    if (!isRelease(e.supportedcurrentrel) || category === null || !vendor || !base) { skipped++; continue; }
    const versions = list(e.version);
    const model = versions.length ? `${base} ${versions.join(" / ")}` : base;
    const chips = list(e.cpu).filter((c) => !/^(unknown|n\/a|\?)$/i.test(c));
    const fcc = list(e.fccid).map(fccFromUrl).filter((x): x is string => !!x);
    records.push({
      id: makeId(vendor, model),
      vendor,
      model,
      category,
      identifiers: { chips, fcc_id: fcc },
      status: "open-firmware",
      projects: [{ name: "OpenWrt", url: pageUrl(e), kind: "firmware", license: "GPL-2.0" }],
      install: tohInstall(e, profiles),
      provenance: { sources: ["openwrt"] },
      updated: date,
    });
  }
  return { records, skipped };
}

/** "<release dir>/<image file>" → profile id, for every release directory the ToH links to. */
async function releaseProfiles(toh: { columns: string[]; entries: unknown[][] }): Promise<Map<string, string>> {
  const cols = ["firmwareopenwrtinstallurl", "firmwareopenwrtupgradeurl"].map((c) => toh.columns.indexOf(c)).filter((i) => i >= 0);
  const dirs = new Set<string>();
  for (const row of toh.entries) for (const i of cols) for (const u of list(row[i])) { const img = releaseImage(u); if (img) dirs.add(img.dir); }
  const out = new Map<string, string>();
  let failed = 0;
  await mapLimit([...dirs], 8, async (dir) => {
    try {
      for (const [file, id] of imageProfiles(await fetchJson(`${dir}/profiles.json`, { retries: 2 }))) out.set(`${dir}/${file}`, id);
    } catch { failed++; } // missing profiles.json (old releases): no selector link for those rows
  });
  console.error(`openwrt: ${dirs.size} release target directories, ${failed} without profiles.json`);
  return out;
}

const source: Source = {
  source: "openwrt",
  name: "OpenWrt Table of Hardware",
  url: "https://openwrt.org/toh/start",
  license: "CC-BY-SA-4.0",
  async fetch() {
    const toh = await fetchJson(TOH_URL, { retries: 8 });
    const profiles = await releaseProfiles(toh);
    const { records, skipped } = fromToh(toh, today(), profiles);
    console.error(`openwrt: ${skipped} rows skipped (no current release, emulator or missing name); ${records.filter((r) => r.install?.some((i) => i.installer)).length} records with a Firmware Selector link`);
    return records;
  },
};
export default source;
