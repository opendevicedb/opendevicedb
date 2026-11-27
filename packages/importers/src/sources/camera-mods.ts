// Camera firmware mods: community projects that patch or extend camera firmware (late-2026 wave
// for Nikon, OM System/Olympus and Sony, plus long-standing Nikon-Patch). They publish no common
// machine-readable list, so this source is a reviewed table: one entry per project, its cameras,
// the exact stock firmware each needs, how far the author tested it, and its risk. Every link is
// pinned to the commit that was read (2026-11-26/27).
//
// Rules, as for the other camera sources:
// - "installable": a public release the author tested on that body → controllable, with an install
//   route that names the firmware version. A body the project targets but its author has not
//   tested → partial-protocol, no route.
// - "research": no end-user build → partial-protocol, no route, the risk stated in the summary.
// - The project's licence is kept as stated; a repository without a licence says so (its code is
//   not open source, only published).
// Left out on purpose: NikonUnlock (distributes keys that unlock a paid Nikon option), the A6100
// Picture Profile tool (closed Windows executable), the Hasselblad X2D project (taken down).
// Facts and links only; no firmware is redistributed.
import { today, type DeviceRecord, type InstallRoute } from "@opendevicedb/core";
import { deviceFirmwareFreedom, type Source } from "../lib.ts";
import { cameraIdentity, knownCameras } from "../camera-ids.ts";

export interface ModCamera { vendor: string; model: string; firmware: string[]; tested?: boolean; category?: DeviceRecord["category"]; aliases?: string[] }
export interface CameraMod {
  project: string;
  repo: string;          // owner/name on GitHub, or a full URL for non-GitHub projects
  rev?: string;          // pinned commit
  license: string;
  tier: "installable" | "research";
  does: string;          // one line: what it adds
  cameras: ModCamera[];
  route?: Omit<InstallRoute, "project" | "guide" | "firmware_constraints">;
  risk?: string;         // stated risk, for the summary of research entries
  /** Status when the mod is too narrow to call the camera controllable (a language unlock). */
  status?: DeviceRecord["status"];
}

const NO_LICENSE = "none (no licence file: published, not open source)";
const FLASH = { method: "sd-card", tools: ["Memory card", "Card reader", "Fully charged battery", "Computer to build or download the patched file"], opens_device: false } as const;

const cam = (vendor: string, model: string, firmware: string | string[], tested = true, extra: Partial<ModCamera> = {}): ModCamera =>
  ({ vendor, model, firmware: Array.isArray(firmware) ? firmware : [firmware], tested, ...extra });

export const CAMERA_MODS: CameraMod[] = [
  // ---------- OM System / Olympus ----------
  {
    project: "db firmware (om-c-firmware)", repo: "azqeurio/om-c-firmware", rev: "036763267140bb418286d88b6dccb6246d91d7f7", license: NO_LICENSE, tier: "installable",
    does: "patches official OM System/Olympus firmware: Panasonic lens aperture ring, faster SH2 bursts, Korean menus, OM-1 to OM-1 Mark II and OM-5 to OM-5 Mark II ports, per-body controls",
    // The author tests on OM-1, OM-5 Mark II and one E-M10; other bodies are released untested on hardware.
    cameras: [
      cam("Olympus", "OM-1", "1.9"), cam("Olympus", "OM-1 Mark II", "1.3", false), cam("OM System", "OM-3", "1.1", false),
      cam("OM System", "OM-5", "1.2", false), cam("OM System", "OM-5 Mark II", "1.1"), cam("Olympus", "E-M1X", "2.4", false),
      cam("Olympus", "E-M1 Mark III", "1.6", false), cam("Olympus", "E-M1 Mark II", "3.7", false), cam("Olympus", "E-M1", "4.6", false),
      cam("Olympus", "E-M5 Mark III", "1.7", false), cam("Olympus", "E-M5 Mark II", "4.1", false), cam("Olympus", "E-M5", "2.3", false),
      cam("Olympus", "E-M10 Mark IV", "1.1", false), cam("Olympus", "E-M10 Mark III", "1.2", false), cam("Olympus", "E-M10 Mark II", "1.4", false),
      cam("Olympus", "E-M10", "1.4", false), cam("Olympus", "PEN-F", "3.1", false), cam("Olympus", "E-P7", "1.1", false),
      cam("Olympus", "E-P5", "1.8", false), cam("Olympus", "E-PL9", "1.1", false), cam("Olympus", "E-PL8", "1.1", false),
      cam("Olympus", "E-PL7", "1.4", false), cam("Olympus", "E-PL6", "1.4", false), cam("Olympus", "E-PL5", "1.6", false),
    ],
    route: { ...FLASH, difficulty: "medium", brick_risk: "medium", reversible: "yes",
      notes: "The tool downloads the official firmware and applies small patches; the result is installed with the official update procedure. The ports reset camera settings on install and when going back. Reflashing the official firmware reverts it." },
  },
  {
    project: "Olympus firmware analysis (PEN-F HSL)", repo: "fishcu/oly_fw_analysis", rev: "d565cb664d3bc37f883f844a3a0c9620efe018e4", license: "Apache-2.0", tier: "research",
    does: "TruePic VII firmware analysis; per-channel hue/saturation/lightness patches for the PEN-F colour profiles",
    cameras: [cam("Olympus", "PEN-F", "3.1", false)],
    risk: "research notes and patches, no end-user installer",
  },
  // ---------- Nikon ----------
  {
    project: "Wonder Lantern Z30", repo: "WonderLantern/wonder-lantern-z30", rev: "8084ccc0947abcbf7df30c7adcb9685ca7b4f7fc", license: "MIT", tier: "installable",
    does: "Magic Lantern-style extensions loaded from the card: video bitrate, zebras, histogram, film grain, aspect masks, long exposures, 3D tracking",
    cameras: [cam("Nikon", "Z 30", "C 1.20")],
    route: { ...FLASH, difficulty: "medium", brick_risk: "medium", reversible: "yes",
      notes: "A loader firmware is flashed once from the Firmware version menu; features then load from Z30/WL.PATCH on the card. The project checks that each loader still opens the update page, so stock firmware can be reflashed." },
  },
  {
    project: "Wonder Lantern Z5", repo: "WonderLantern/wonder-lantern-z5", rev: "1bac6974f5fd5a1c46d9556e2fc859ed81e4f2b7", license: "MIT", tier: "installable",
    does: "custom shutter sounds, DISP pages with histogram, timed bulb, photo aspect masks, film grain, faster USB listing",
    cameras: [cam("Nikon", "Z 5", "C 1.50")],
    route: { ...FLASH, difficulty: "medium", brick_risk: "medium", reversible: "yes",
      notes: "patch.py verifies the official update file you supply and writes a patched one, installed from the Firmware version menu. Reflashing the official firmware reverts it." },
  },
  {
    project: "Wonder Lantern Z6", repo: "WonderLantern/WonderLantern-z6", rev: "f63af8f21671013163ed2657b43d77ef9fda8b75", license: "LicenseRef-Wonder-Lantern-Community (free distribution only, share-alike)", tier: "installable",
    does: "custom shutter sounds, extended exposures with countdown, framing guides with recoverable NEF crops",
    cameras: [cam("Nikon", "Z 6", "C 3.80")],
    route: { ...FLASH, difficulty: "medium", brick_risk: "medium", reversible: "yes",
      notes: "Copy the release firmware and language cores to the card and update from the Firmware version menu; back up the stock firmware set first. Known issue: slower USB tethering." },
  },
  {
    project: "WonderLantern Z7", repo: "tylermcm/WonderLanternZ7", rev: "fc2d257b7b87b63d23907246ed815295345ae4be", license: NO_LICENSE, tier: "installable",
    does: "framing grids, rear-LCD battery percentage, configurable DISP pages",
    cameras: [cam("Nikon", "Z 7", "C 3.80")],
    route: { ...FLASH, difficulty: "hard", brick_risk: "high", reversible: "partial",
      notes: "Source-only: you build the patched firmware yourself. The author warns a failed flash can permanently brick the camera; features are tested on one Z7 only. Not for the Z7 II or bodies with the paid RAW video upgrade." },
  },
  {
    project: "NikonFirmwarePatch", repo: "XinmiaoZhao/NikonFirmwarePatch", rev: "25fefa1e17f321ee285bea77b3c54427f9912e4b", license: "GPL-3.0", tier: "installable",
    does: "Z8 video extensions: 3:2 open-gate N-RAW, anamorphic desqueeze, log options, photo tools",
    cameras: [cam("Nikon", "Z 8", "C 3.11")],
    route: { ...FLASH, difficulty: "hard", brick_risk: "high", reversible: "yes",
      notes: "An offline tool builds a patched update from the official Z8 C 3.11 file (exact size and SHA-256 checked); C 3.12 is not supported and Nikon has withdrawn C 3.11, so updated bodies cannot use it. The Z8 accepts a downgrade or same-version reflash to recover. Experimental; brick reports exist for Z8 firmware work." },
  },
  {
    project: "Nikon-Patch", repo: "https://simeonpilgrim.com/nikon-patch/nikon-patch.html", license: "none stated (free online tool; reverse-engineering notes at github.com/simeonpilgrim/nikon-firmware-tools)", tier: "installable",
    does: "DSLR firmware patches: higher video bitrates, no video time limit, clean HDMI, Star Eater off, lossless NEF, non-brand batteries (features vary by model and firmware)",
    // Only the model/firmware pairs for which the tool offers patches.
    cameras: [
      cam("Nikon", "D3100", ["1.01", "1.02"]), cam("Nikon", "D3200", ["1.01", "1.02", "1.03"]), cam("Nikon", "D3300", "1.02"),
      cam("Nikon", "D5100", ["1.01", "1.02"]), cam("Nikon", "D5200", ["1.01", "1.02"]), cam("Nikon", "D5300", ["1.02", "1.03"]),
      cam("Nikon", "D7000", ["1.03", "1.04", "1.05"]), cam("Nikon", "D300S", "1.02"), cam("Nikon", "D300", "1.11 (B file)"),
      cam("Nikon", "D600", "1.01"), cam("Nikon", "D610", ["1.01", "1.04"]), cam("Nikon", "D800", ["1.02", "1.10", "1.11"]),
      cam("Nikon", "D800E", ["1.02", "1.10"]), cam("Nikon", "D4", "1.05"),
    ],
    route: { ...FLASH, difficulty: "medium", brick_risk: "medium", reversible: "yes",
      notes: "Upload the official firmware to the online tool, tick the patches offered for that model and version (some are marked BETA or ALPHA), and install the result from the camera's firmware update menu. The tool warns that modified firmware can brick the camera." },
  },
  {
    project: "Nikon 1 custom firmware", repo: "XCQi/Nikon-1-custom-firmware", rev: "8c7c0fc1ee7f2828f6f8c9b454ade80899c36597", license: NO_LICENSE, tier: "installable",
    does: "manual-lens metering and focus magnification, FT1 improvements, assignable Wi-Fi/Delete buttons, 1-second intervals, full language menu",
    cameras: [cam("Nikon", "J5", "C 1.01", true, { aliases: ["Nikon 1 J5"] })],
    route: { ...FLASH, difficulty: "easy", brick_risk: "medium", reversible: "yes",
      notes: "Ready-to-flash BIN files from the project's releases, installed from the firmware menu; read the J5 guide first (FT1 limits)." },
  },
  {
    project: "Nikon 1 language patch", repo: "lcat2000/nikon1-zhtw-language-patch", rev: "e2e2c1ca21995e179bd1eb5b9b2164d1449b9b4b", license: "MIT", tier: "installable", status: "partial-protocol",
    does: "full international language menu on Japanese-market bodies",
    cameras: [cam("Nikon", "V2", "C 1.22 (Japanese-market)", true, { aliases: ["Nikon 1 V2"] })],
    route: { ...FLASH, difficulty: "medium", brick_risk: "low", reversible: "yes",
      notes: "A script patches the official firmware you download (input and output SHA-256 published); a restore file is documented." },
  },
  {
    project: "OpenEXPEED (D90 firmware research)", repo: "AleLosco/OpenEXPEED-Nikon-D90-Firmware-Research", rev: "a9fb5ac5658605092ff633ab57a98f340460b551", license: "MIT", tier: "research",
    does: "reverse engineering of the D90 firmware",
    cameras: [cam("Nikon", "D90", [], false)],
    risk: "research only, no patch to install",
  },
  // ---------- Sony ----------
  {
    project: "Recipe Lab", repo: "voxivoid/recipe-lab-sony-pmca", rev: "53754b3196495e9d6c0b1f5dccbec3cf1a56fdd7", license: "GPL-3.0", tier: "installable",
    does: "PlayMemories camera app with 76 film-inspired recipes, live preview and QR sharing",
    // Built and tested on the A6000; other PlayMemories bodies are expected but unconfirmed.
    cameras: [cam("Sony", "ILCE-6000", [])], // a camera app: no specific firmware version
    route: { method: "host-software", difficulty: "easy", tools: ["Computer", "USB cable"], opens_device: false, brick_risk: "low", reversible: "yes",
      notes: "Installed as a camera app with Sony-PMCA-RE (or PMCA-RE Reloaded); the firmware is not modified. Uninstall the app to go back." },
  },
  { project: "Sony A7 IV feature research", repo: "leogenot/sony-a7iv-feature-research", rev: "4f0b3787c444d087fc9965abbe2ec995ec0ecfdd", license: "MIT", tier: "research",
    does: "service-mode research: shutter-angle display shown, other features unproven", cameras: [cam("Sony", "ILCE-7M4", "6.02", false)],
    risk: "research; a separate decryption attempt on an A7 IV was reported to end in a boot loop" },
  { project: "A6000 firmware decompilation", repo: "nicolvus/a6000-fw-decomp", rev: "ef7ec7350af2f093a2fd3245715b7dee60e8c967", license: "MIT", tier: "research",
    does: "custom firmware prototype: electronic shutter, Picture Profile menus", cameras: [cam("Sony", "ILCE-6000", "3.21", false)],
    risk: "prototype; an earlier build stopped booting and needed hardware debugging to recover" },
  { project: "Sony A6400 research", repo: "ivica00/sony-a6400-research", rev: "80971ba3a31d0e913c36859249ead5d242f48419", license: "MIT", tier: "research",
    does: "USB UVC and PTP image output experiments", cameras: [cam("Sony", "ILCE-6400", [], false)], risk: "research, no end-user build" },
  { project: "Sony Alpha research (A1 II extension loader)", repo: "Jimmy6Smiles/Sony-Alpha-Research", rev: "2454bcccb8122c10665adc69859c82427b3dd9f2", license: NO_LICENSE, tier: "research",
    does: "loads native code extensions from the card at startup", cameras: [cam("Sony", "ILCE-1M2", "4.00", false)],
    risk: "needs an internal modification; no end-user installer" },
  { project: "FX30 firmware research", repo: "OlliV/fx30_fw", rev: "bfebe07aeb0336b0a64bfe99a4d4521ed46b9e3f", license: "CC-BY-NC-SA-4.0", tier: "research",
    does: "hidden settings research with a set/readback/rollback helper", cameras: [cam("Sony", "ILME-FX30", "6.01", false)],
    risk: "a pixel-shift experiment caused a boot loop" },
  { project: "A7C II Tools", repo: "QAQLeonard/a7c2-fl23-research", rev: "af4228d38fb7aa0577d13b38fd986622dff9f009", license: "PolyForm-Noncommercial-1.0.0", tier: "research",
    does: "FL2/FL3 creative looks, custom LUT import, shutter sound", cameras: [cam("Sony", "ILCE-7CM2", "2.01", false)],
    risk: "verified on one camera and one Windows setup" },
  // ---------- Ricoh ----------
  { project: "GR III/IIIx firmware hack", repo: "hhornbacher/gr3x-fw-hack", rev: "dc84ad50a0e5afc86d7273eb75e86ff889b83b19", license: NO_LICENSE, tier: "research",
    does: "running custom apps without changing the firmware (emulation does not fully boot yet)",
    cameras: [cam("Ricoh", "GR III", [], false), cam("Ricoh", "GR IIIx", [], false)], risk: "early research" },
];

const projectUrl = (m: CameraMod) => (/^https?:/.test(m.repo) ? m.repo : `https://github.com/${m.repo}${m.rev ? `/tree/${m.rev}` : ""}`);

/**
 * One record per camera. A camera that several projects target gets one record carrying every
 * project, route and summary (joined with " · ", each starting with its project's name), so no
 * project's firmware or state is lost to the generic merge, which keeps a single summary.
 */
export function fromMods(mods: CameraMod[], known = knownCameras(), date = today()): DeviceRecord[] {
  const byId = new Map<string, DeviceRecord>();
  for (const r of recordsPerProject(mods, known, date)) {
    const prev = byId.get(r.id);
    if (!prev) { byId.set(r.id, r); continue; }
    byId.set(r.id, {
      ...prev,
      aliases: [...new Set([...(prev.aliases ?? []), ...(r.aliases ?? [])])],
      status: prev.status === "controllable" || r.status === "controllable" ? "controllable" : prev.status,
      summary: `${prev.summary} · ${r.summary}`,
      projects: [...(prev.projects ?? []), ...(r.projects ?? [])],
      install: [...(prev.install ?? []), ...(r.install ?? [])],
    });
  }
  return [...byId.values()];
}

function recordsPerProject(mods: CameraMod[], known: ReturnType<typeof knownCameras>, date: string): DeviceRecord[] {
  const out: DeviceRecord[] = [];
  for (const m of mods) {
    const url = projectUrl(m);
    for (const c of m.cameras) {
      const who = cameraIdentity(c.vendor, c.model, known);
      const usable = m.tier === "installable" && c.tested !== false && !!m.route;
      const fw = c.firmware.length ? ` (firmware ${c.firmware.join(" or ")})` : "";
      const summary = m.tier === "research"
        ? `${m.project}: ${m.does}${fw}. Research only: ${m.risk ?? "no end-user build"}.`
        : usable ? `${m.project}: ${m.does}${fw}.`
        : `${m.project} targets it${fw} (${m.does}), but its author has not tested this body on hardware.`;
      out.push({
        id: who.id,
        vendor: who.vendor,
        model: who.model,
        aliases: [...who.aliases, ...(c.aliases ?? [])],
        category: c.category ?? "camera",
        status: usable ? m.status ?? "controllable" : "partial-protocol",
        summary,
        projects: [{ name: m.project, url, kind: m.tier === "research" ? "protocol-doc" : "firmware", license: m.license,
          freedom: deviceFirmwareFreedom("A patch or extension on top of the manufacturer's firmware, which stays.") }],
        install: usable ? [{ project: m.project, guide: url, ...m.route!,
          ...(c.firmware.length ? { firmware_constraints: `Stock firmware ${c.firmware.join(" or ")} exactly.` } : {}) }] : [],
        provenance: { sources: ["camera-mods"] },
        updated: date,
      });
    }
  }
  return out;
}

const source: Source = {
  source: "camera-mods",
  name: "Camera firmware mods (reviewed list)",
  url: "https://github.com/opendevicedb/opendevicedb/blob/main/packages/importers/src/sources/camera-mods.ts",
  license: "CC0-1.0",
  async fetch() {
    return fromMods(CAMERA_MODS);
  },
};
export default source;
