// Official downloads metadata (OpenStickCommunity/Site, MIT). Parse metadata
// as text: never execute upstream TSX. Generic MCU boards, product families and
// unrecognized identities are excluded. One build configuration is not itself
// a physical product: retain named designs and their explicit hardware revision.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, githubFiles, githubRaw, type Source } from "../lib.ts";

export interface Board { name: string; config: string; website: string; category: string }
export function parseBoards(text: string): Board[] {
  return [...text.matchAll(/\{\s*name:\s*'([^']+)'([^]*?)(?=\n\s*\{\s*name:|$)/g)].flatMap((m) => {
    const meta = m[2].split(/\bdesc:\s*/)[0];
    const field = (key: string) => meta.match(new RegExp(`\\b${key}:\\s*'([^']+)'`))?.[1] ?? "";
    const config = field("configName"), website = field("website"), category = field("category");
    if (/\bsupported:\s*false/.test(meta) || !["official", "open", "closed"].includes(category) || !config || !/^https:\/\//.test(website)) return [];
    return [{ name: clean(m[1]), config, website, category }];
  });
}

export function boardIdentity(b: Board): { vendor: string; model: string } | null {
  if (/\bseries\b/i.test(b.name) || ["SGFDevices", "BentoBox", "Haute42COSMOXXAnalog"].includes(b.config)) return null;
  if (/^Flatbox /.test(b.name)) return { vendor: "Flatbox", model: b.name.slice(8) };
  if (/^Reflex /.test(b.name) || b.config === "MiSTercadeV2") return { vendor: "MiSTerAddons", model: b.name };
  if (/^Granola /.test(b.name)) return { vendor: "Granola", model: b.name.slice(8) };
  if (/^Mavercade /.test(b.name)) return { vendor: "Mavercade", model: b.name.slice(10) };
  if (/^HautePad /.test(b.name)) return { vendor: "COSMOX", model: b.name };
  if (/^ASi /.test(b.name)) return { vendor: "ASIndo", model: b.name.slice(4) };
  const vendors: Record<string, string> = {
    ARCController: "OpenStickCommunity", OpenCore0: "OpenStickCommunity", OpenCore0WASD: "OpenStickCommunity",
    RP2040AdvancedBreakoutBoard: "OpenStickCommunity", RP2040AdvancedBreakoutBoardUSBPassthrough: "OpenStickCommunity",
    RP2040MiniBreakoutBoard: "OpenStickCommunity", KeyboardConverter: "OpenStickCommunity", ZeroRhythm: "OpenStickCommunity",
    "OSUMGP-RP2040": "NickGuyver", PicoFightingBoard: "FeralAI", PXPGamepad: "MegaBitmap", Stress: "GroooveBob",
  };
  return vendors[b.config] ? { vendor: vendors[b.config], model: b.name } : null;
}

export function fromBoards(boards: Board[], configs: Set<string>, date = today()): DeviceRecord[] {
  return boards.flatMap((b) => {
    const who = boardIdentity(b);
    if (!who || !configs.has(b.config)) return [];
    return [{
      id: makeId(who.vendor, who.model), ...who, category: "game-controller", status: "open-firmware" as const,
      summary: `Named controller or arcade interface listed in GP2040-CE downloads (configuration: ${b.config}). ${b.category === "closed" ? "Upstream classifies the hardware design as closed source; the controller firmware is open." : "Hardware designs and firmware have separate licensing."} Console compatibility depends on the mode and any required accessories; this is not a hardware test.`,
      projects: [
        { name: "GP2040-CE", url: `https://github.com/OpenStickCommunity/GP2040-CE/tree/main/configs/${encodeURIComponent(b.config)}`, kind: "firmware", license: "MIT" },
        { name: "Controller hardware / product", url: b.website, kind: "other" },
      ],
      install: [{ project: "GP2040-CE", method: "usb-bootloader" as const, guide: "https://gp2040-ce.info/installation/", difficulty: "medium" as const,
        firmware_constraints: `Use the ${b.config} build for this exact hardware revision. Follow the board's bootloader instructions and the official download selection.`,
        notes: "The installation guide describes USB bootloader / UF2 installation. Button layout, pin assignments and firmware configuration must match the controller. See the upstream compatibility documentation for each console and input mode.",
      }],
      provenance: { sources: ["gp2040-ce"] }, updated: date,
    }];
  });
}

const source: Source = {
  source: "gp2040-ce", name: "GP2040-CE controllers", url: "https://gp2040-ce.info/downloads/", license: "MIT",
  async fetch() {
    const [text, files] = await Promise.all([
      githubRaw("OpenStickCommunity/Site", "main", "src/config/boards.tsx"),
      githubFiles("OpenStickCommunity/GP2040-CE", "main"),
    ]);
    const configs = new Set(files.flatMap((p) => p.match(/^configs\/([^/]+)\/BoardConfig\.h$/)?.[1] ?? []));
    const boards = parseBoards(text);
    const records = fromBoards(boards, configs);
    if (records.length < 15) throw new Error(`GP2040-CE: only ${records.length} named controllers with matching firmware configurations`);
    console.error(`gp2040-ce: ${boards.length} community download entries; ${records.length} individually identified controllers/interfaces`);
    return records;
  },
};
export default source;
