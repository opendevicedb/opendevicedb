// CHDK (Canon Hack Development Kit): free software that Canon PowerShot and IXUS compacts load from
// the SD card next to Canon's firmware (RAW, scripting, manual controls, motion detection). From the
// CHDK autobuild server, mighty-hoernsche.de: the stable release at the root and development builds
// under /trunk/, one table row per camera and Canon firmware version:
//   <td rowspan="2">PowerShot&nbsp;A1000</td><td>1.00A</td><td><a href="bins/a1000-100a-1.6.1-6355-full.zip">
// The server is not reachable from every network; the import workflow runs it on GitHub Actions.
//
// Status: controllable (open code drives the camera over its stock firmware). Code GPL-2.0.
import { today, type DeviceRecord, type InstallRoute } from "@opendevicedb/core";
import { clean, deviceFirmwareFreedom, fetchText, type Source } from "../lib.ts";
import { cameraIdentity, knownCameras } from "../camera-ids.ts";

const BUILDS = "https://mighty-hoernsche.de/";
const LICENSE = "GPL-2.0-only";

export interface ChdkBuild { model: string; firmware: string; platform: string; trunk: boolean }

const text = (html: string) => clean(html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&"));
const FIRMWARE = /^\d+\.\d+[a-z]?$/i;

/** Rows of one autobuild page → one build per camera and firmware version. */
export function parseBuilds(html: string, trunk: boolean): ChdkBuild[] {
  const out: ChdkBuild[] = [];
  let model = "";
  for (const row of html.split(/<tr\b/i).slice(1)) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr>|$)/gi)].map((m) => m[1]);
    if (!cells.length) continue;
    let i = 0;
    const first = text(cells[0]);
    if (first && !FIRMWARE.test(first) && /[a-z]/i.test(first) && !/\.zip\b/i.test(first)) { model = first; i = 1; }
    const fw = text(cells[i] ?? "");
    const bin = row.match(/href="[^"]*?bins\/([a-z0-9_]+)-([0-9a-z]+)-[\d.]+-\d+(?:-full)?\.zip"/i);
    if (!model || !FIRMWARE.test(fw) || !bin) continue;
    out.push({ model, firmware: fw, platform: bin[1], trunk });
  }
  return out;
}

/** "PowerShot SD880 IS / IXUS 870 IS" → the first name, the others as aliases. */
export function splitNames(model: string): { model: string; aliases: string[] } {
  const names = model.split(/\s*\/\s*|\s*,\s*/).map(clean).filter(Boolean);
  return { model: names[0] ?? model, aliases: names.slice(1) };
}

export const chdkInstall = (firmwares: string[], trunkOnly: boolean): InstallRoute => ({
  project: "CHDK",
  method: "sd-card",
  guide: "https://chdk.fandom.com/wiki/CHDK_in_Brief",
  installer: trunkOnly ? `${BUILDS}trunk/` : BUILDS,
  difficulty: "easy",
  tools: ["SD card", "Card reader"],
  opens_device: false,
  brick_risk: "low",
  reversible: "yes",
  firmware_constraints: `Canon firmware ${firmwares.join(", ")}: pick the build matching the camera's version (CHDK's ver.req file shows it).`,
  notes: `${trunkOnly ? "Development builds only so far. " : ""}Load it once with Firmware Update from the camera's menu, or make the card bootable to load it at every start. Nothing is written to the camera; without the card it starts as before.`,
});

/** Where the build server's name is ambiguous, by platform: "Digital IXUS300" is the 2010 IXUS 300 HS. */
export const MODEL_BY_PLATFORM: Record<string, string> = { ixus300_sd4000: "Digital IXUS 300 HS" };

export function fromBuilds(builds: ChdkBuild[], known = knownCameras(), date = today()): DeviceRecord[] {
  builds = builds.map((b) => (MODEL_BY_PLATFORM[b.platform] ? { ...b, model: MODEL_BY_PLATFORM[b.platform] } : b));
  // One platform sold under several names (IXUS in Europe, PowerShot SD/ELPH in America): a record
  // per name, like libgphoto2, each naming the others as aliases.
  const namesOf = new Map<string, Set<string>>();
  for (const b of builds) namesOf.set(b.platform, (namesOf.get(b.platform) ?? new Set()).add(b.model));
  const byModel = new Map<string, ChdkBuild[]>();
  for (const b of builds) byModel.set(b.model, [...(byModel.get(b.model) ?? []), b]);
  return [...byModel].map(([name, list]) => {
    const split = splitNames(name);
    const model = split.model;
    const aliases = [...split.aliases, ...list.flatMap((b) => [...namesOf.get(b.platform)!]).filter((n) => n !== name)];
    const who = cameraIdentity("Canon", model, known);
    const stable = list.filter((b) => !b.trunk);
    const firmwares = [...new Set(list.map((b) => b.firmware))];
    const platforms = [...new Set(list.map((b) => b.platform))];
    return {
      id: who.id,
      vendor: who.vendor,
      model: who.model,
      aliases: [...new Set([...who.aliases, ...aliases])],
      category: "camera",
      status: "controllable",
      summary: `CHDK runs on it (Canon firmware ${firmwares.join(", ")}${stable.length ? "" : ", development builds"}): RAW/DNG, Lua and uBASIC scripts, manual exposure, motion detection.`,
      projects: [{
        name: `CHDK ${platforms.join(", ")} port`,
        url: stable.length ? BUILDS : `${BUILDS}trunk/`,
        kind: "firmware" as const,
        license: LICENSE,
        freedom: deviceFirmwareFreedom("CHDK loads from the card next to Canon's firmware, which stays and does the imaging."),
      }],
      install: [chdkInstall(firmwares, !stable.length)],
      provenance: { sources: ["chdk"] },
      updated: date,
    };
  });
}

const source: Source = {
  source: "chdk",
  name: "CHDK",
  url: "https://chdk.fandom.com/wiki/CHDK",
  license: LICENSE,
  async fetch() {
    const builds = [...parseBuilds(await fetchText(BUILDS), false), ...parseBuilds(await fetchText(`${BUILDS}trunk/`), true)];
    const records = fromBuilds(builds);
    if (records.length < 80) throw new Error(`chdk: only ${records.length} cameras (${builds.length} builds)`);
    console.error(`chdk: ${builds.length} builds, ${records.length} cameras, ${records.filter((r) => !/trunk/.test(r.install![0].installer!) ).length} with a stable build`);
    return records;
  },
};
export default source;
