// Read literal board metadata from the firmware release, not website prose or
// Blinka's host-library catalogue. USB identities belong to this firmware build.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchJson, githubFiles, githubRaw, mapLimit, type Source } from "../lib.ts";
import { normVendor } from "./lineageos.ts";

const REPO = "adafruit/circuitpython";
export interface CircuitBoard { path: string; header: string; make: string }
const MAKERS: Record<string, string> = {
  "adafruit industries llc": "Adafruit", "adafruit industries": "Adafruit", adafruit: "Adafruit",
  "raspberry pi": "Raspberry Pi", "raspberry pi foundation": "Raspberry Pi", espressif: "Espressif",
  "seeed studio": "Seeed Studio", seeed: "Seeed Studio", "seeed technology co., ltd.": "Seeed Studio",
  "lilygo": "LILYGO", "lilygo.cc": "LILYGO", "solder party": "Solder Party",
  "sparkfun electronics": "SparkFun", "invector labs": "Invector Labs", "bdmicro llc": "BDMICRO",
  "silabs": "Silicon Labs", "aithinker": "Ai Thinker",
};
const PREFIXES = ["Raspberry Pi", "Seeed Studio", "Ai Thinker", "Maker Go", "Adafruit", "SparkFun", "Pimoroni", "Waveshare", "Espressif", "LOLIN", "LILYGO", "M5Stack", "Arduino", "01Space", "AITHinker", "DFRobot", "CRCibernetica", "cezerio", "Deneyap", "Freenove", "Elecrow", "Hardkernel", "Wemos", "Luatos", "MicroDev", "NodeMcu", "Oxocard", "PCBCupid", "Seeed", "Spotpear", "SQFMI", "Sunton", "WeAct", "Xteink", "Yoto", "Espruino", "SiLabs", "VIDI"];
// Manufacturer is explicitly encoded in these upstream board paths, including
// boards whose USB manufacturer is just the chip-vendor SDK default.
const PATH_MAKERS: Record<string, string> = {
  espressif_: "Espressif", unexpectedmaker_: "Unexpected Maker", elecrow_: "Elecrow", microbit_: "BBC",
  mixgo_: "Mixly", franzininho_: "Franzininho", ttgo_: "LILYGO", doit_: "DOIT",
  // The canonical Red S2 WROOM download page lists its maker as Generic.
  "red-s2-wroom": "Generic",
};

/** Literal preprocessor/make values only; expressions and interpolations stay unknown. */
export function boardValues(header: string, make: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of header.matchAll(/^\s*#define\s+(MICROPY_HW_(?:BOARD|MCU)_NAME)\s+"([^"\\]*)"/gm)) out[m[1]] = clean(m[2]);
  let depth = 0;
  for (const line of make.split(/\r?\n/)) {
    if (/^\s*if(?:eq|neq|def|ndef)\b/.test(line)) { depth++; continue; }
    if (/^\s*endif\b/.test(line)) { depth--; continue; }
    if (depth) continue;
    const key = line.match(/^([A-Z][A-Z0-9_]*)\s*[:?]?=/)?.[1];
    if (!key) continue;
    const m = line.match(/^[A-Z][A-Z0-9_]*\s*[:?]?=\s*(?:"([^"$`\\]*)"|([A-Za-z0-9_.+-]+))\s*(?:#.*)?$/);
    if (m) out[key] = clean(m[1] ?? m[2]);
    else delete out[key];
  }
  return out;
}

export function fromBoard(b: CircuitBoard, ref: string, date = today()): DeviceRecord | null {
  const d = boardValues(b.header, b.make);
  const full = clean(d.MICROPY_HW_BOARD_NAME || d.USB_PRODUCT);
  if (!full || /generic|renode|^unknown$|^circuitpython$/i.test(full)) return null;
  const boardId = b.path.split("/").pop()!;
  let rawVendor = Object.entries(PATH_MAKERS).find(([p]) => boardId.startsWith(p))?.[1] ?? clean(d.USB_MANUFACTURER);
  if (!rawVendor) {
    // Vendor names explicitly present in the board's own name.
    rawVendor = PREFIXES.find((v) => new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[ _-]|$)`, "i").test(full)) ?? "";
  }
  if (!rawVendor || /^unknown$|^circuitpython$/i.test(rawVendor)) return null;
  const vendor = normVendor(MAKERS[rawVendor.toLowerCase()] ?? rawVendor);
  // Phone normalisation strips Wi-Fi/LTE and parenthetical SKUs. Those are
  // different physical microcontroller boards and must remain distinct here.
  let model = full;
  for (const prefix of [vendor, rawVendor]) if (model.toLowerCase().startsWith(prefix.toLowerCase() + " ")) model = model.slice(prefix.length + 1).trim();
  const revision = boardId.match(/_(pcb\d+|rev[a-z]|\d+\.\d+)$/i)?.[1];
  if (revision) model += ` (${revision})`;
  if (/_(?:no|with)_flash$/.test(boardId)) model += boardId.endsWith("_no_flash") ? " (without external flash)" : " (with external flash)";
  if (boardId === "adafruit_metro_m7_1011_sd") model += " (SD)";
  if (boardId.endsWith("_ch343")) model += " (CH343)";
  const chip = d.MICROPY_HW_MCU_NAME || d.IDF_TARGET || d.CHIP_VARIANT;
  const usb = /^0x[\da-f]{4}$/i.test(d.USB_VID ?? "") && /^0x[\da-f]{4}$/i.test(d.USB_PID ?? "") ? [`${d.USB_VID.slice(2)}:${d.USB_PID.slice(2)}`.toLowerCase()] : [];
  const license = b.header.match(/SPDX-License-Identifier:\s*(.+)/)?.[1].trim() || "MIT";
  const esp = /esp32/i.test(chip ?? "");
  const uf2Constraint = /esp32[-_]?s[23]/i.test(chip ?? "") && d.CIRCUITPY_ESP_FLASH_SIZE === "4MB"
    ? " For CircuitPython 10.x UF2 installation on this 4 MB ESP32-S2/S3 board, TinyUF2 0.33.0 or newer is required; consult the board's bootloader upgrade instructions."
    : "";
  const detail = `CircuitPython ${ref} board definition ${boardId}${chip ? ` (${chip})` : ""}. Modules and working features are specific to the board and release. USB IDs identify CircuitPython firmware, can change with firmware or bootloader, and do not uniquely prove a physical board. This is not an OpenDeviceDB hardware test.`;
  return {
    id: makeId(vendor, model), vendor, model, category: /watch|bangle\.js/i.test(full) ? "wearable" : /xteink/i.test(full) ? "e-reader" : /yoto/i.test(full) ? "audio" : /camera|memento|esp32-cam/i.test(full) ? "camera" : /odroid.go/i.test(full) ? "game-console" : "single-board",
    status: "open-firmware", aliases: [full, boardId], identifiers: { usb, ...(chip ? { chips: [chip] } : {}) },
    summary: detail,
    projects: [{ name: `CircuitPython ${ref} (${boardId})`, url: `https://github.com/${REPO}/tree/${ref}/${b.path}`, kind: "firmware", license,
      freedom: { ...(esp ? { nonfree: ["wifi", "bluetooth"] as ("wifi" | "bluetooth")[] } : {}), cloud: "none",
        notes: `${detail} ${esp ? "Espressif wireless stacks include vendor binaries." : "This definition does not establish the freedom of every bootloader, wireless stack or peripheral firmware component."}` },
    }],
    install: [{ project: "CircuitPython", method: "other", guide: "https://circuitpython.org/downloads", difficulty: "medium",
      firmware_constraints: `Select the exact ${boardId} board and the intended release. Memory sizes and hardware revisions can require different builds.${uf2Constraint}`,
      notes: "Follow the board's own download/installation page. UF2 drag-and-drop, serial flashing and debug-probe routes differ; do not use an image for a similarly named board.",
    }],
    provenance: { sources: ["circuitpython"] }, updated: date,
  };
}

const source: Source = {
  source: "circuitpython", name: "CircuitPython firmware boards", url: "https://circuitpython.org/", license: "MIT (individual board SPDX licences apply)",
  async fetch() {
    const ref: string = (await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)).tag_name;
    const files = await githubFiles(REPO, ref);
    const paths = files.filter((p) => /^ports\/[^/]+\/boards\/[^/]+\/mpconfigboard\.h$/.test(p)).map((p) => p.slice(0, -"/mpconfigboard.h".length));
    if (paths.length < 400) throw new Error(`circuitpython: unexpectedly few boards (${paths.length})`);
    const out = await mapLimit(paths, 8, async (path) => {
      const [header, make] = await Promise.all([githubRaw(REPO, ref, `${path}/mpconfigboard.h`), files.includes(`${path}/mpconfigboard.mk`) ? githubRaw(REPO, ref, `${path}/mpconfigboard.mk`) : Promise.resolve("")]);
      return fromBoard({ path, header, make }, ref);
    });
    const records = out.filter((r): r is DeviceRecord => !!r);
    console.error(`circuitpython ${ref}: ${paths.length} definitions, ${records.length} named boards; no Blinka host entries`);
    return records;
  },
};
export default source;
