// Camera ids shared by the camera importers (Magic Lantern, OpenMemories, pktriggercord,
// Fujihack): the same body is spelled many ways ("EOS 7D Mark II", "EOS 7D MarkII", "ILCE-7RM2",
// "Alpha A7R II"), and libgphoto2 already holds a record for most of them. A loose key finds that
// record so an import enriches it instead of adding a duplicate under a slightly different id.
import { loadSnapshots, makeId, slugify, type DeviceRecord } from "@opendevicedb/core";

const ROMAN: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5" };

/** Loose key of a model name within one vendor: "Alpha A7R II", "ILCE-7RM2" and "ilce-7r-m2" → "a7rm2". */
export function cameraKey(model: string): string {
  let s = slugify(model);
  s = s.replace(/^(canon-)?eos-/, "").replace(/^alpha-/, "").replace(/^ilce-/, "a").replace(/^dsc-/, "").replace(/^pentax-/, "");
  // "mark-ii", "markii", "mk-ii", "-ii", "m-2" → "m2"
  s = s.replace(/-?(?:mark|mk)-?(ii|iii|iv|v|\d)\b/g, (_, n) => `m${ROMAN[n] ?? n}`);
  s = s.replace(/-(ii|iii|iv)\b/g, (_, n) => `m${ROMAN[n]}`);
  return s.replace(/-/g, "");
}

/** id → record for the cameras other sources already hold, keyed by vendor slug and cameraKey. */
export function existingCameras(records: DeviceRecord[]): Map<string, DeviceRecord> {
  const out = new Map<string, DeviceRecord>();
  for (const r of records) {
    if (r.category !== "camera" && r.category !== "action-camera") continue;
    const k = `${slugify(r.vendor)}/${cameraKey(r.model)}`;
    if (!out.has(k)) out.set(k, r);
  }
  return out;
}

let cache: Map<string, DeviceRecord> | null = null;

/** Cameras from the libgphoto2 snapshot (read once). Empty when the snapshot is absent. */
export function knownCameras(): Map<string, DeviceRecord> {
  cache ??= existingCameras(loadSnapshots().filter((s) => s.source === "libgphoto2").flatMap((s) => s.records));
  return cache;
}

/**
 * Vendor, model and id for a camera: the existing record's when one matches the loose key, so
 * records merge; otherwise our own spelling.
 */
export function cameraIdentity(vendor: string, model: string, known = knownCameras()): { id: string; vendor: string; model: string; aliases: string[] } {
  const hit = known.get(`${slugify(vendor)}/${cameraKey(model)}`);
  if (hit) return { id: hit.id, vendor: hit.vendor, model: hit.model, aliases: hit.model === model ? [] : [model] };
  return { id: makeId(vendor, model), vendor, model, aliases: [] };
}
