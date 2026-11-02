// AsteroidOS's official watch/model-number table. Content: CC-BY-3.0 (LICENSE-CC
// in AsteroidOS/asteroidos.org); the site's MIT license applies to its code only.
// Import named retail models, not codenames or generic platform families. Several
// models can share a SKU/codename: those identifiers must never merge their identities.
// Only upstream-supported watches with a real installation page are imported.
// Experimental ports, generic families and watches without model details stay out.
import { loadAll, makeId, slugify, today, type DeviceRecord } from "@opendevicedb/core";
import { clean, fetchJson, githubFiles, type Source } from "../lib.ts";

const REPO = "AsteroidOS/asteroidos.org";
const SITE = "https://asteroidos.org";
const TABLE = `https://raw.githubusercontent.com/${REPO}/master/pages/watches-support.json`;

export interface WatchModel { name: string; num: string; codename: string }
export interface Watch {
  name: string;
  status: string;
  soc?: string;
  modelnumbers?: WatchModel[];
  features?: { name: string; status: string }[];
}

/** Match complete vendor/model names only; never match on shared hardware identifiers. */
const modelKey = (vendor: string, model: string) => `${slugify(vendor)}/${slugify(model).replace(/-/g, "")}`;

const BRANDS = [
  "Armani Exchange", "Emporio Armani", "Michael Kors", "Kate Spade", "Tory Burch",
  "Asus", "LG", "OPPO", "Huawei", "Fossil", "Misfit", "Diesel", "Skagen", "Kingwear",
  "Blocks", "Lemfo", "LooK", "Diggro", "AllCall", "Zeblaze", "IQ", "Polar", "Samsung", "Sony", "Casio",
];

export function watchIdentity(name: string): { vendor: string; model: string } | null {
  const older = /^older\s+/i.test(name);
  const full = clean(name.replace(/^older\s+/i, ""));
  if (/^TicWatch\s/i.test(full)) return { vendor: "Mobvoi", model: full };
  if (/^Moto\s/i.test(full)) return { vendor: "Motorola", model: full };
  const brand = BRANDS.find((b) => full.toLowerCase().startsWith(b.toLowerCase() + " "));
  if (!brand) return null;
  const model = clean(full.slice(brand.length));
  return model ? { vendor: brand, model: older ? `${model} (older hardware)` : model } : null;
}

export function fromWatches(watches: Watch[], guideNames: Set<string>, known: DeviceRecord[] = [], date = today()): DeviceRecord[] {
  const existing = new Map<string, DeviceRecord | null>();
  for (const r of known.filter((r) => r.category === "wearable")) {
    const key = modelKey(r.vendor, r.model);
    const prev = existing.get(key);
    existing.set(key, prev !== undefined && prev?.id !== r.id ? null : r);
  }
  const grouped = new Map<string, { vendor: string; model: string; id: string; variants: { watch: Watch; model: WatchModel }[] }>();
  for (const watch of watches) {
    if (watch.status !== "supported" || !/^[a-z0-9_-]+$/.test(watch.name) || !guideNames.has(watch.name)) continue;
    for (const m of watch.modelnumbers ?? []) {
      if (!clean(m.name) || !clean(m.num) || !/^[a-z0-9_-]+$/.test(clean(m.codename))) continue;
      const who = watchIdentity(m.name);
      if (!who) continue;
      const key = modelKey(who.vendor, who.model);
      const hit = existing.get(key);
      const id = hit?.id ?? makeId(who.vendor, who.model);
      let group = grouped.get(id);
      if (!group) grouped.set(id, group = { id, vendor: hit?.vendor ?? who.vendor, model: hit?.model ?? who.model, variants: [] });
      group.variants.push({ watch, model: m });
    }
  }
  const uniq = (xs: string[]) => [...new Set(xs.map(clean).filter(Boolean))];
  return [...grouped.values()].map((g) => {
    const codenames = uniq(g.variants.map((v) => v.model.codename));
    const skus = uniq(g.variants.map((v) => v.model.num));
    const guides = uniq(g.variants.map((v) => v.watch.name));
    const limitations = uniq(g.variants.flatMap((v) => (v.watch.features ?? [])
      .filter((f) => f.status === "partial" || f.status === "bad")
      .map((f) => `${clean(f.name)} (${f.status === "bad" ? "unavailable" : "partial"})`)));
    return {
      id: g.id, vendor: g.vendor, model: g.model,
      aliases: uniq(g.variants.map((v) => v.model.name).concat(codenames)),
      category: "wearable", status: "open-firmware",
      identifiers: { sku: skus, chips: uniq(g.variants.map((v) => v.watch.soc ?? "")) },
      summary: `AsteroidOS replacement operating system; upstream-supported model (${codenames.join(", ")}).` +
        (limitations.length ? ` Upstream platform limitations: ${limitations.join(", ")}. Check the exact variant's support table.` : " Consult the upstream table for per-feature support."),
      // AsteroidOS is a multi-component OS: do not assign the website's license to it,
      // or infer that replacement firmware means a blob-free or hardware-tested device.
      projects: guides.map((guide) => ({ name: "AsteroidOS", url: `${SITE}/watches/${guide}/`, kind: "firmware" as const })),
      install: guides.map((guide) => ({
        project: "AsteroidOS", method: "other" as const, guide: `${SITE}/watches/${guide}/`, difficulty: "medium" as const,
        firmware_constraints: `Match the exact model number (${skus.join(", ")}) and hardware codename (${codenames.join(", ")}) in the official guide.`,
        notes: "Uses the watch-specific bootloader/recovery procedure. Installation can erase data; read the guide's prerequisites, feature limits and backup instructions first.",
      })),
      provenance: { sources: ["asteroidos"] }, updated: date,
    };
  });
}

const source: Source = {
  source: "asteroidos", name: "AsteroidOS supported watches", url: `${SITE}/watches/`, license: "CC-BY-3.0",
  async fetch() {
    const [data, files] = await Promise.all([
      fetchJson<{ watches: Watch[] }>(TABLE), githubFiles(REPO, "master"),
    ]);
    if (!Array.isArray(data.watches)) throw new Error("AsteroidOS: missing watches table");
    const guides = new Set(files.flatMap((p) => p.match(/^pages\/watches\/([a-z0-9_-]+)\.md$/)?.[1] ?? []));
    const records = fromWatches(data.watches, guides, loadAll());
    if (records.length < 40) throw new Error(`AsteroidOS: only ${records.length} named supported watches`);
    return records;
  },
};
export default source;
