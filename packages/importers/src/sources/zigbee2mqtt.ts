// Zigbee2MQTT supported devices, read from the zigbee-herdsman-converters npm package
// (the same definitions the zigbee2mqtt.io docgen renders). Only plain data is kept:
// vendor, model, zigbeeModel/fingerprint model IDs, and expose types for the category.
import { makeId, today, type DeviceRecord, type InstallRoute } from "@opendevicedb/core";
import { clean, firstMatch, githubFiles, deviceFirmwareFreedom, type Source } from "../lib.ts";

/** The subset of a prepared converter definition this importer reads. */
export interface Z2mDefinition {
  vendor: string;
  model: string;
  description?: string;
  zigbeeModel?: string[];
  fingerprint?: { modelID?: string; manufacturerName?: string }[];
  /** top-level expose types and names, e.g. ["light", "switch", "temperature"] */
  exposes: string[];
  whiteLabel?: { vendor?: string; model: string; description?: string; whiteLabelOf?: string; fingerprint?: { modelID?: string; manufacturerName?: string }[] }[];
}

// Ordered: the first pattern matching the description wins.
export const DESCRIPTION_CATEGORIES: [RegExp, string][] = [
  [/\b(plug|socket|outlet|power ?strip|extension lead)s?\b/i, "smart-plug"],
  [/\b(gateway|hub|bridge|coordinator|repeater|range extender|zigbee router)s?\b/i, "hub"],
  [/\b(switch|relay|dimmer|button|remote|keypad|knob|scenes? control(ler)?|wall controller)s?\b/i, "switch"],
  [/\b(sensor|detector|thermometer|hygrometer|monitor|meter|multisensor|smoke alarm|co alarm|carbon monoxide alarm)s?\b/i, "sensor"],
  [/\b(bulb|lamp|light|led|downlight|spotlight|spot|strip|luminaire|lightstrip|ceiling|chandelier|lighting)s?\b/i, "light"],
];

// Fallback on expose types/names when the description says nothing.
const ACTUATORS = ["light", "switch", "cover", "climate", "lock", "fan"];
const SENSING = ["temperature", "humidity", "occupancy", "presence", "contact", "water_leak", "smoke", "illuminance", "co2", "pm25", "voc", "pressure", "vibration", "gas"];

export function z2mCategory(description: string, exposes: string[]): string {
  const byText = firstMatch(DESCRIPTION_CATEGORIES, description, "");
  if (byText) return byText;
  if (exposes.includes("light")) return "light";
  if (exposes.includes("switch")) return "switch";
  if (exposes.some((e) => ACTUATORS.includes(e))) return "other";
  if (exposes.some((e) => SENSING.includes(e))) return "sensor";
  return "other";
}

/**
 * Page name used by the zigbee2mqtt.io docgen (utils.ts normalizeModel: / | space :), plus
 * the site build, which publishes "+" and "&" as "_" and drops leading "_"
 * (FUT035Z+ → FUT035Z_.html, _TZ3000_o1jzcxou → TZ3000_o1jzcxou.html; checked 2026-10-17).
 */
export const z2mPage = (model: string) =>
  `https://www.zigbee2mqtt.io/devices/${z2mPageName(model).replace(/[+&]/g, "_").replace(/^_+/, "")}.html`;
/** docs/devices/<name>.md in github.com/Koenkk/zigbee2mqtt.io. */
export const z2mPageName = (model: string) => model.replace(/[/| :]/g, "_");

const PAIRING_GUIDE = "https://www.zigbee2mqtt.io/guide/usage/pairing_devices.html";

/**
 * Pairing route, after any device-specific firmware preparation. An upstream
 * custom-firmware listing is not evidence that an original retail unit can pair.
 */
export function z2mInstall(page: string, pages?: Set<string>, customFirmware = false): InstallRoute {
  const route: InstallRoute = {
    project: "Zigbee2MQTT",
    method: "pairing",
    // The docs site can lag the converter release; use a general pairing guide
    // when the device page has not been published yet.
    guide: !pages || pages.has(z2mPageName(page)) ? z2mPage(page) : PAIRING_GUIDE,
    difficulty: "medium",
    tools: ["Zigbee USB coordinator", "Computer or Raspberry Pi running Zigbee2MQTT"],
    ...(!customFirmware ? { brick_risk: "none", reversible: "yes" } as const : {}),
    notes: customFirmware
      ? "This route pairs a device already running the required custom Zigbee firmware. Unpairing removes it from the network; it does not restore the original firmware. Firmware preparation is separate."
      : "Pair the device with your Zigbee network after any preparation required by its device guide. This route covers pairing; remove the device from Zigbee2MQTT to undo the pairing.",
    ...(customFirmware ? { firmware_constraints: page === "LYWSD03MMC"
      ? "The original LYWSD03MMC is Bluetooth-only. Install compatible custom Zigbee firmware before pairing, following the upstream device guide and its hardware/firmware requirements."
      : "This upstream listing requires compatible custom Zigbee firmware before pairing. Consult the project documentation for device/board-specific preparation; this pairing route does not install firmware." } : {}),
  };
  return route;
}

const customFirmwareListing = (description = "") => /\b(?:with|and)\s+custom[\s-]+firmware\b/i.test(description);

const modelIds = (fp: Z2mDefinition["fingerprint"] = []) => fp.map((f) => f.modelID).filter((x): x is string => !!x);

/** `pages`: names of the device pages the docs site has (z2mPageName), when known. */
export function fromDefinitions(defs: Z2mDefinition[], date = today(), pages?: Set<string>): DeviceRecord[] {
  const out: DeviceRecord[] = [];
  const record = (vendor: string, model: string, description: string, exposes: string[], zigbee: string[], page: string, customFirmware: boolean): DeviceRecord => ({
    id: makeId(vendor, model),
    vendor: clean(vendor),
    model: clean(model),
    category: z2mCategory(description, exposes),
    // some model IDs are NUL-padded as the device reports them
    identifiers: { zigbee_model: [...new Set(zigbee.map((z) => clean(z.replace(/\0/g, ""))).filter(Boolean))] },
    status: "controllable",
    ...(customFirmware ? { summary: "Zigbee2MQTT listing for a device running compatible custom Zigbee firmware. Firmware preparation and hardware compatibility must be checked before pairing." } : {}),
    projects: [{ name: "Zigbee2MQTT", url: z2mPage(page), kind: "integration", license: "GPL-3.0",
      freedom: customFirmware ? { cloud: "none", notes: "Custom device firmware is required. Its licensing and remaining vendor components depend on the chosen firmware." } : deviceFirmwareFreedom() }],
    install: [z2mInstall(page, pages, customFirmware)],
    provenance: { sources: ["zigbee2mqtt"] },
    updated: date,
  });
  for (const d of defs) {
    const base = [...(d.zigbeeModel ?? []), ...modelIds(d.fingerprint)];
    const customFirmware = customFirmwareListing(d.description);
    out.push(record(d.vendor, d.model, d.description ?? "", d.exposes, base, d.model, customFirmware));
    for (const w of d.whiteLabel ?? []) {
      // A white label with its own fingerprint has its own docs page and its own model IDs
      // (inherited from the base fingerprint with the same manufacturerName when omitted).
      let zigbee = base, page = w.whiteLabelOf ?? d.model;
      if (w.fingerprint?.length) {
        page = w.model;
        zigbee = w.fingerprint.flatMap((f) => f.modelID ? [f.modelID]
          : modelIds((d.fingerprint ?? []).filter((b) => b.manufacturerName && b.manufacturerName === f.manufacturerName)));
      }
      out.push(record(w.vendor ?? d.vendor, w.model, w.description ?? d.description ?? "", d.exposes, zigbee, page,
        customFirmware || customFirmwareListing(w.description)));
    }
  }
  return out;
}

const DOCS_REPO = "Koenkk/zigbee2mqtt.io";

/** Load and flatten the converter definitions (executes the published npm package). */
async function loadDefinitions(): Promise<Z2mDefinition[]> {
  const devices: any = await import("zigbee-herdsman-converters/devices/index");
  const { prepareDefinition }: any = await import("zigbee-herdsman-converters");
  const all: any[] = devices.default?.default ?? devices.default ?? devices;
  return all.map((raw) => {
    const d = prepareDefinition(raw);
    let ex: any[] = [];
    try {
      ex = typeof d.exposes === "function" ? d.exposes({ isDummyDevice: true }, {}) : (d.exposes ?? []);
    } catch { /* dynamic exposes that need a real device */ }
    return {
      vendor: d.vendor, model: d.model, description: d.description, zigbeeModel: d.zigbeeModel,
      fingerprint: d.fingerprint, whiteLabel: d.whiteLabel,
      exposes: [...new Set(ex.flatMap((e: any) => [e.type, e.name]).filter(Boolean))] as string[],
    };
  });
}

const source: Source = {
  source: "zigbee2mqtt",
  name: "Zigbee2MQTT",
  url: "https://www.zigbee2mqtt.io/supported-devices/",
  license: "MIT",
  async fetch() {
    let pages: Set<string> | undefined;
    try {
      pages = new Set((await githubFiles(DOCS_REPO, "master"))
        .filter((p) => p.startsWith("docs/devices/") && p.endsWith(".md")).map((p) => p.slice(13, -3)));
    } catch (e) {
      console.error(`zigbee2mqtt: docs page list unavailable (${(e as Error).message}); install guides link every device page`);
    }
    const recs = fromDefinitions(await loadDefinitions(), today(), pages);
    if (pages) console.error(`zigbee2mqtt: ${recs.filter((r) => r.install![0].guide === PAIRING_GUIDE).length} records without a docs page yet (general pairing guide)`);
    return recs;
  },
};
export default source;
