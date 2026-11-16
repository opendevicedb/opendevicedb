// Armbian board configs are shell programs. Read literal top-level metadata;
// never execute/source them. Generic targets and unnamed configurations are
// excluded, while CSC/TVB/WIP/EOS status remains attached to every project.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchJson, githubFiles, githubRaw, mapLimit, type Source } from "../lib.ts";
import { normVendor, normModel } from "./lineageos.ts";

const REPO = "armbian/build";
const GUIDE = "https://docs.armbian.com/User-Guide_Getting-Started/";
const VENDORS: Record<string, string> = {
  xunlong: "Orange Pi", friendlyelec: "FriendlyElec", friendlyarm: "FriendlyElec", hardkernel: "Hardkernel",
  bananapi: "Banana Pi", pine64: "PINE64", raspberrypi: "Raspberry Pi", radxa: "Radxa",
  olimex: "Olimex", khadas: "Khadas", orangepi: "Orange Pi", nanopi: "FriendlyElec",
  ayntec: "AYN", generic: "Generic",
};

/** Only unconditional assignments before the first function/block; no expansions. */
export function parseBoard(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(?:function\b|[\w:]+\s*\(\s*\)|if\b|case\b|for\b)/.test(line)) break;
    const m = line.match(/^(?:declare -g\s+)?([A-Z][A-Z0-9_]*)=(?:"([^"$`\\]*)"|'([^']*)'|([A-Za-z0-9_.+,-]+))(?:\s*(?:#.*)?)$/);
    if (m) out[m[1]] = clean(m[2] ?? m[3] ?? m[4]);
  }
  return out;
}

export function fromBoard(file: string, d: Record<string, string>, ref: string, date = today()): DeviceRecord | null {
  const name = clean(d.BOARD_NAME), rawVendor = clean(d.BOARD_VENDOR);
  if (!name || !rawVendor || /generic|uefi|virtual|qemu|^armbian$/i.test(name)) return null;
  const vendor = normVendor(VENDORS[rawVendor.toLowerCase()] ?? rawVendor);
  let model = normModel(vendor, name);
  if (vendor === "Hardkernel" && /^ODROID[- ]/i.test(name)) model = name; // same identity as existing phone/SBC sources
  const type = file.split(".").pop()!;
  const state: Record<string, string> = { conf: "standard configuration", csc: "community/unmaintained configuration", tvb: "community TV-box configuration", wip: "work in progress", eos: "end of life" };
  if (!state[type]) return null;
  const runnable = ["conf", "csc", "tvb"].includes(type);
  const detail = `Armbian ${state[type]} (${file}). Kernel branches: ${d.KERNEL_TARGET || "not declared"}; board family: ${d.BOARDFAMILY || "not declared"}.${d.BOOT_SCENARIO ? ` Boot scenario: ${d.BOOT_SCENARIO}.` : ""} Availability and working features depend on the selected image and branch; a build configuration is not an OpenDeviceDB hardware test.`;
  const category: DeviceRecord["category"] = /odin|retroid|\bthor\b|anbernic|gameforce|powkiddy|game.console/i.test(name) ? "game-console"
    : /tablet|xiaomi pad|legion.*y700|lenovo.*y700/i.test(name) ? "tablet"
    : /oneplus|poco.*f\d|xiaomi.*phone/i.test(name) ? "phone"
    : /tvb|tv.?box|set.top|chromecast/i.test(`${type} ${name}`) ? "media-player"
    : /laptop|pinebook|teres|chromebook|thinkpad/i.test(name) ? "laptop"
    : /router|clearfog|turris|jethub|jethome/i.test(name) ? "router" : "single-board";
  return {
    id: makeId(vendor, model), vendor, model, category,
    status: type === "conf" ? "open-firmware" : type === "wip" ? "in-progress" : "partial-protocol",
    aliases: [name, file.replace(/\.[^.]+$/, "")],
    summary: detail,
    projects: [{ name: `Armbian (${state[type]}; ${file})`, url: `https://github.com/${REPO}/blob/${ref}/config/boards/${file}`,
      kind: "firmware", license: "GPL-2.0", freedom: { notes: `${detail} Bootloader, DDR initialization, trusted firmware and peripheral firmware may use vendor binaries. This entry does not establish a fully free firmware stack.`, cloud: "none" },
    }],
    ...(runnable ? { install: [{ project: "Armbian", method: "other" as const, guide: GUIDE,
      difficulty: "medium" as const, firmware_constraints: `Use the exact ${name} board revision and an image for the selected kernel branch (${d.KERNEL_TARGET || "consult upstream"}). ${state[type]}.`,
      notes: "Check upstream image availability and the board-specific page. SD, eMMC, SPI and USB installation routes vary by board; no universal media or recovery procedure is implied.",
    }] } : {}),
    provenance: { sources: ["armbian"] }, updated: date,
  };
}

const source: Source = {
  source: "armbian", name: "Armbian board configurations", url: "https://www.armbian.com/", license: "GPL-2.0",
  async fetch() {
    const ref: string = (await fetchJson(`https://api.github.com/repos/${REPO}/commits/main`)).sha;
    const files = (await githubFiles(REPO, ref)).filter((p) => /^config\/boards\/[^/]+\.(?:conf|csc|tvb|wip|eos)$/.test(p));
    if (files.length < 300) throw new Error(`armbian: unexpectedly few board configurations (${files.length})`);
    const out = await mapLimit(files, 8, async (p) => fromBoard(p.split("/").pop()!, parseBoard(await githubRaw(REPO, ref, p)), ref));
    const records = out.filter((r): r is DeviceRecord => !!r);
    console.error(`armbian ${ref}: ${files.length} configurations, ${records.length} named boards`);
    return records;
  },
};
export default source;
