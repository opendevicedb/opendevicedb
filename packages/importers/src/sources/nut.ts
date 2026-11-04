// NUT's machine-readable HCL, GPL-2.0-or-later (repository COPYING).
// Import identifiable products, not wildcard families or untested promises. Keep
// every connection/driver restriction; HCL stars describe protocol provenance,
// never a hardware-test score. No device is flashed by these host-side drivers.
import { makeId, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchText, type Source } from "../lib.ts";

const REPO = "networkupstools/nut";
const TABLE = `https://raw.githubusercontent.com/${REPO}/master/data/driver.list.in`;
const SITE = "https://networkupstools.org";
export interface NutRow { vendor: string; type: string; level: string; model: string; extra: string; driver: string; hclModel?: string }

export function parseNut(text: string): NutRow[] {
  return text.split(/\r?\n/).flatMap((line) => {
    if (!/^\s*"/.test(line)) return [];
    const m = line.match(/^\s*"([^"]*)"\t"([^"]*)"\t"([^"]*)"\t"([^"]*)"\t"([^"]*)"\t"([^"]*)"\s*(?:#.*)?$/);
    if (!m) throw new Error(`NUT: unrecognized HCL row: ${line.slice(0, 100)}`);
    const [, vendor, type, level, model, extra, driver] = m.map(clean);
    return [{ vendor, type, level, model, extra, driver }];
  });
}

export function identifiableNut(r: NutRow): boolean {
  const namedProduct = r.vendor === "PiJuice" && ["PiJuice HAT", "PiJuice Zero pHAT"].includes(r.model);
  const family = (r.vendor === "Eaton" && ["3S", "5 PX", "5P", "5S", "5SC", "9E", "9PX", "9SX"].includes(r.model)) ||
    (r.vendor === "Liebert" && r.model === "GXT5") || (r.vendor === "Riello" && ["S3M", "S3T"].includes(r.model)) ||
    (r.vendor === "ION" && r.model === "F11");
  return ["ups", "pdu", "ats", "scd", "psu"].includes(r.type) && /^[1-5]$/.test(r.level) &&
    !!r.vendor && /[a-z]/i.test(r.model) && (/\d/.test(r.model) || namedProduct) && !family &&
    !/\b(simulated?|dummy|generic)\b/i.test(`${r.vendor} ${r.model} ${r.driver}`) &&
    !/[/*?]|\b(various|series|models?|all|older|newer|unknown)\b|\d\s*-\s*\d/i.test(r.model) &&
    !/experimental|untested|no report|should be supported/i.test(`${r.model} ${r.extra} ${r.driver}`);
}

const ORIGINS = ["", "reverse engineered protocol", "partly published protocol", "published protocol", "vendor-provided protocol", "vendor-provided protocol and hardware"];
const driverUrl = (name: string) => `${SITE}/docs/man/${name}.html`;
// Official migration notes: these historical drivers were removed in NUT 2.6.
const REPLACED: Record<string, string> = { megatec: "blazer_ser", megatec_usb: "blazer_usb" };
const UPGRADING = `${SITE}/docs/release-notes.chunked/NUT_Upgrading_Notes.html`;

export function fromNut(rows: NutRow[], date = today()): DeviceRecord[] {
  const groups = new Map<string, NutRow[]>();
  for (const r of rows.filter(identifiableNut)) {
    // Preserve hardware/year qualifiers in the displayed identity. Pure connection
    // names are routes to the same product, so USB and serial can share one record.
    const qualifier = /\b(?:19|20)\d{2}\b|vendor id|product id|protocol \d|revision|\brev\b/i.test(r.extra) ? ` (${r.extra})` : "";
    const model = r.model + qualifier;
    const key = makeId(r.vendor, model);
    const prev = groups.get(key);
    if (prev && (prev[0].vendor !== r.vendor || prev[0].model !== model || prev[0].type !== r.type)) throw new Error(`NUT: identity collision ${key}`);
    groups.set(key, [...(prev ?? []), { ...r, model, hclModel: r.model }]);
  }
  return [...groups.values()].map((variants) => {
    const r = variants[0];
    const byDriver = new Map<string, string[]>();
    for (const v of variants) for (const command of v.driver.split(/\s+or\s+/)) {
      const original = command.match(/^(?:driver=)?([a-z0-9_-]+)(?:[\s,]|$)/i)?.[1];
      if (!original) throw new Error(`NUT: invalid driver ${command}`);
      const name = REPLACED[original] ?? original;
      const detail = `${v.extra || "Connection unspecified"}; driver: ${command}; HCL protocol origin: ${ORIGINS[Number(v.level)]}.` +
        (REPLACED[original] ? ` Historical HCL driver ${original} was replaced by ${name}; follow the NUT upgrading notes (${UPGRADING}) for current installations.` : "");
      byDriver.set(name, [...new Set([...(byDriver.get(name) ?? []), detail])]);
    }
    const hcl = `${SITE}/stable-hcl.html?manufacturer=${encodeURIComponent(r.vendor)}&model=${encodeURIComponent(r.hclModel ?? r.model)}`;
    return {
      id: makeId(r.vendor, r.model), vendor: r.vendor, model: r.model,
      category: r.type === "ups" ? "ups" : r.type === "psu" ? "test-instrument" : "appliance",
      status: "controllable",
      summary: `Listed by Network UPS Tools (${r.type.toUpperCase()}). Host-side drivers communicate with the existing device firmware. Connection and hardware constraints apply; upstream listing is not an OpenDeviceDB hardware test.`,
      projects: [
        ...[...byDriver.keys()].map((name) => ({ name: `NUT ${name}`, url: driverUrl(name), kind: "driver", license: "GPL-2.0-or-later", freedom: { notes: "NUT provides host-side monitoring/control; it does not replace the device firmware. The firmware's license and remaining proprietary components are not established by this HCL entry." } })),
        { name: "NUT hardware compatibility list", url: hcl, kind: "other" },
        ...([...byDriver.values()].flat().some((detail) => detail.includes("Historical HCL driver")) ? [{ name: "NUT driver migration notes", url: UPGRADING, kind: "protocol-doc" }] : []),
      ],
      install: [...byDriver].map(([name, details]) => ({
        project: `NUT ${name}`, method: "host-software" as const, guide: driverUrl(name), difficulty: "medium" as const,
        firmware_constraints: details.join(" "),
        notes: "Install NUT on the host and configure the listed driver, connection and parameters for the exact unit. Consult the HCL and driver manual for supported commands and limitations; no replacement device firmware is installed.",
      })),
      provenance: { sources: ["nut"] }, updated: date,
    };
  });
}

const source: Source = {
  source: "nut", name: "Network UPS Tools", url: `${SITE}/stable-hcl.html`, license: "GPL-2.0-or-later",
  async fetch() {
    const rows = parseNut(await fetchText(TABLE));
    const records = fromNut(rows);
    if (rows.length < 500 || records.length < 200) throw new Error(`NUT: unexpected HCL size (${rows.length} rows, ${records.length} products)`);
    console.error(`nut: ${rows.length} HCL rows; ${records.length} identifiable products after excluding families and uncertain support`);
    return records;
  },
};
export default source;
