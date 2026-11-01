// Magic Lantern: free software that runs on Canon EOS cameras next to Canon's firmware (RAW
// video, focus peaking, intervalometer, scripting). From the source tree of the maintained project,
// github.com/reticulatedpines/magiclantern_simplified: platform/<CAMERA>.<FIRMWARE>/ holds one
// port per camera and Canon firmware version ("5D3.123" = EOS 5D Mark III on firmware 1.2.3).
// A port that ships ML-SETUP.FIR (the installer run from the camera's firmware-update menu) is
// installable; the others are ports in development. Read with one shallow, blob-less clone:
// only file names are needed. The ports under platform/unmaintained are left out.
//
// Status: controllable for installable ports (open code drives the camera over its stock
// firmware), partial-protocol for ports in development. Code GPL-2.0.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { today, type DeviceRecord, type InstallRoute } from "@opendevicedb/core";
import { deviceFirmwareFreedom, type Source } from "../lib.ts";
import { cameraIdentity, knownCameras } from "../camera-ids.ts";

const REPO = "https://github.com/reticulatedpines/magiclantern_simplified";
const LICENSE = "GPL-2.0-only";

/** Platform code → model as Canon names it. Codes not listed are skipped (and reported). */
export const ML_MODELS: Record<string, string> = {
  "100D": "EOS 100D", "1100D": "EOS 1100D", "1300D": "EOS 1300D", "200D": "EOS 200D", "500D": "EOS 500D", "50D": "EOS 50D",
  "550D": "EOS 550D", "5D2": "EOS 5D Mark II", "5D3": "EOS 5D Mark III", "5D4": "EOS 5D Mark IV", "5DSR": "EOS 5DS R",
  "600D": "EOS 600D", "60D": "EOS 60D", "650D": "EOS 650D", "6D": "EOS 6D", "6D2": "EOS 6D Mark II", "700D": "EOS 700D",
  "70D": "EOS 70D", "750D": "EOS 750D", "77D": "EOS 77D", "7D": "EOS 7D", "7D2": "EOS 7D Mark II", "80D": "EOS 80D",
  "850D": "EOS 850D", EOSM: "EOS M", M50: "EOS M50", M6II: "EOS M6 Mark II", R: "EOS R", R5: "EOS R5", R6: "EOS R6",
  RP: "EOS RP", SX70: "PowerShot SX70 HS", SX740: "PowerShot SX740 HS", XF605: "XF605",
};

export interface MlPort { code: string; firmware: string; installable: boolean }

/** Paths under platform/ → one port per camera and firmware ("5D3.123" → 5D3, 1.2.3). */
export function parsePorts(paths: string[]): MlPort[] {
  const ports = new Map<string, MlPort>();
  for (const p of paths) {
    const m = p.match(/^platform\/([A-Z0-9_]+)\.(\d{3})\/(.+)$/i);
    if (!m) continue;
    const key = `${m[1]}.${m[2]}`;
    const port = ports.get(key) ?? { code: m[1], firmware: m[2].split("").join("."), installable: false };
    if (m[3] === "ML-SETUP.FIR") port.installable = true;
    ports.set(key, port);
  }
  return [...ports.values()];
}

export const mlInstall = (firmwares: string[]): InstallRoute => ({
  project: "Magic Lantern",
  method: "sd-card",
  guide: `${REPO}#readme`,
  difficulty: "medium",
  tools: ["SD or CF card", "Card reader", "Fully charged battery"],
  opens_device: false,
  brick_risk: "low",
  reversible: "yes",
  firmware_constraints: `Canon firmware ${firmwares.join(" or ")} exactly: update or downgrade it first with Canon's own updater.`,
  notes: "Copy the build to the card and run Firmware Update from the camera's menu: ML-SETUP.FIR sets the boot flag and Magic Lantern then loads from the card at each start. Nothing is written to the camera's firmware; remove the card (or run the uninstaller) to go back.",
});

/** One record per camera; several firmware versions of one camera are merged. */
export function fromPorts(ports: MlPort[], known = knownCameras(), date = today()): { records: DeviceRecord[]; unknown: string[] } {
  const byCode = new Map<string, MlPort[]>();
  for (const p of ports) {
    if (p.code === "7D_MASTER") continue; // the 7D's second processor, same camera as 7D
    byCode.set(p.code, [...(byCode.get(p.code) ?? []), p]);
  }
  const records: DeviceRecord[] = [], unknown: string[] = [];
  for (const [code, list] of byCode) {
    const model = ML_MODELS[code];
    if (!model) { unknown.push(code); continue; }
    const installable = list.filter((p) => p.installable);
    const who = cameraIdentity("Canon", model, known);
    const firmwares = (installable.length ? installable : list).map((p) => p.firmware);
    records.push({
      id: who.id,
      vendor: who.vendor,
      model: who.model,
      aliases: who.aliases,
      category: "camera",
      status: installable.length ? "controllable" : "partial-protocol",
      summary: installable.length
        ? `Magic Lantern runs on it (Canon firmware ${firmwares.join(", ")}): RAW video, focus peaking, zebras, intervalometer, scripting.`
        : `A Magic Lantern port is in development (Canon firmware ${firmwares.join(", ")}): no installable build yet.`,
      projects: list.map((p) => ({
        name: `Magic Lantern ${code}.${p.firmware.replace(/\./g, "")} port`,
        url: `${REPO}/tree/dev/platform/${code}.${p.firmware.replace(/\./g, "")}`,
        kind: "firmware" as const,
        license: LICENSE,
        freedom: deviceFirmwareFreedom("Magic Lantern loads from the card next to Canon's firmware, which stays and does the imaging."),
      })),
      install: installable.length ? [mlInstall(firmwares)] : [],
      provenance: { sources: ["magiclantern"] },
      updated: date,
    });
  }
  return { records, unknown };
}

function listPlatform(): string[] {
  const dir = mkdtempSync(join(tmpdir(), "odb-magiclantern-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  try {
    git("clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout", `${REPO}.git`, ".");
    return git("ls-tree", "-r", "--name-only", "HEAD", "platform/").split("\n").filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const source: Source = {
  source: "magiclantern",
  name: "Magic Lantern",
  url: "https://www.magiclantern.fm/",
  license: LICENSE,
  async fetch() {
    const ports = parsePorts(listPlatform());
    if (ports.length < 20) throw new Error(`magiclantern: only ${ports.length} ports`);
    const { records, unknown } = fromPorts(ports);
    console.error(`magiclantern: ${ports.length} ports, ${records.length} cameras${unknown.length ? `, unknown codes skipped: ${unknown.join(" ")}` : ""}`);
    return records;
  },
};
export default source;
