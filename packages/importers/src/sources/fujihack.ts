// Fujihack: reverse engineering of Fujifilm cameras (github.com/fujihack/fujihack): patched
// firmware updates that add a USB/PTP debugger to read, write and run code on the camera, and
// headers documenting Fujifilm's RTOS API. One header per camera and firmware version in model/
// (`#define MODEL_NAME "Fujifilm X-T2"`, file xt2_440.h = firmware 4.40); stub.h and template.h are
// not cameras. Read with one shallow, sparse git clone (a dozen small files). GPL-3.0.
//
// Experimental: the project warns that a patched firmware can brick the camera and that no
// recovery path is reverse engineered yet. Status partial-protocol.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { today, type DeviceRecord, type InstallRoute } from "@opendevicedb/core";
import { clean, deviceFirmwareFreedom, type Source } from "../lib.ts";
import { cameraIdentity, knownCameras } from "../camera-ids.ts";

const REPO = "https://github.com/fujihack/fujihack";
const LICENSE = "GPL-3.0-only";

export interface FujiPort { file: string; name: string; firmware: string }

/** One model header → camera name and firmware ("xt2_440.h" → 4.40). */
export function parseHeader(file: string, text: string): FujiPort | null {
  const name = clean(text.match(/#define\s+MODEL_NAME\s+"([^"]+)"/)?.[1]);
  const fw = file.match(/_(\d)(\d+)\.h$/);
  return name && fw ? { file, name, firmware: `${fw[1]}.${fw[2]}` } : null;
}

export const fujiInstall = (firmwares: string[]): InstallRoute => ({
  project: "Fujihack",
  method: "sd-card",
  guide: `${REPO}#readme`,
  difficulty: "hard",
  tools: ["Computer with a C toolchain", "SD card", "USB cable"],
  opens_device: false,
  brick_risk: "high",
  reversible: "partial",
  firmware_constraints: `Built against Fujifilm firmware ${firmwares.join(" or ")}.`,
  notes: "A patched firmware update is built from Fujifilm's own and installed from the card like an official update; the USB debugger then runs code on the camera. Experimental: a bad patch can brick the camera and its boot ROM recovery is not reverse engineered. Flashing an unmodified official update restores it if the camera still boots.",
});

export function fromPorts(ports: FujiPort[], known = knownCameras(), date = today()): DeviceRecord[] {
  const byName = new Map<string, FujiPort[]>();
  for (const p of ports) byName.set(p.name, [...(byName.get(p.name) ?? []), p]);
  return [...byName].map(([name, list]) => {
    const model = name.replace(/^Fuji(film)?\s+/i, "");
    const who = cameraIdentity("Fujifilm", model, known);
    const firmwares = list.map((p) => p.firmware);
    return {
      id: who.id,
      vendor: who.vendor,
      model: who.model,
      aliases: who.aliases,
      category: "camera",
      status: "partial-protocol",
      summary: `Fujihack documents its RTOS API and patches its firmware ${firmwares.join(", ")} with a USB debugger (experimental).`,
      projects: [{ name: "Fujihack", url: `${REPO}/tree/master/model`, kind: "firmware" as const, license: LICENSE, freedom: deviceFirmwareFreedom("A patch on top of Fujifilm's firmware, which stays.") }],
      install: [fujiInstall(firmwares)],
      provenance: { sources: ["fujihack"] },
      updated: date,
    };
  });
}

function readModels(): FujiPort[] {
  const dir = mkdtempSync(join(tmpdir(), "odb-fujihack-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  try {
    git("clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout", `${REPO}.git`, ".");
    git("sparse-checkout", "set", "--no-cone", "/model/*.h");
    git("checkout", "-q");
    return readdirSync(join(dir, "model"))
      .filter((f) => f.endsWith(".h") && f !== "stub.h" && f !== "template.h")
      .map((f) => parseHeader(f, readFileSync(join(dir, "model", f), "utf8")))
      .filter((p): p is FujiPort => !!p);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const source: Source = {
  source: "fujihack",
  name: "Fujihack",
  url: REPO,
  license: LICENSE,
  async fetch() {
    const ports = readModels();
    if (ports.length < 5) throw new Error(`fujihack: only ${ports.length} model headers`);
    return fromPorts(ports);
  },
};
export default source;
