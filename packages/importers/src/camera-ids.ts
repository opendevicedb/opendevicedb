// Camera ids shared by the camera importers (Magic Lantern, OpenMemories, pktriggercord,
// Fujihack): the same body is spelled many ways ("EOS 7D Mark II", "EOS 7D MarkII", "ILCE-7RM2",
// "Alpha A7R II"), and libgphoto2 already holds a record for most of them. A loose key finds that
// record so an import enriches it instead of adding a duplicate under a slightly different id.
import { loadSnapshots, makeId, slugify, type DeviceRecord } from "@opendevicedb/core";

const ROMAN: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5" };

/**
 * Key of a model name within one vendor: "Alpha A7R II", "ILCE-7RM2" and "ilce-7r-m2" → "a7rm2".
 * Loose (the default) also drops Canon's IS/HS/Ti suffixes, which can tell two cameras apart
 * (Digital IXUS 300, 2001; IXUS 300 HS, 2010): lookups try the strict key first.
 */
export function cameraKey(model: string, loose = true): string {
  let s = slugify(model);
  s = s.replace(/^(canon-)?eos-/, "").replace(/^alpha-/, "").replace(/^ilce-/, "a").replace(/^dsc-/, "").replace(/^pentax-/, "");
  // "mark-ii", "markii", "mk-ii", "-ii", "m-2" → "m2"
  s = s.replace(/-?(?:mark|mk)-?(ii|iii|iv|v|\d)\b/g, (_, n) => `m${ROMAN[n] ?? n}`);
  s = s.replace(/-(ii|iii|iv)\b/g, (_, n) => `m${ROMAN[n]}`);
  // Canon's feature suffixes are spelled or dropped at will: "IXUS 100 IS", "IXUS100", "SX280HS".
  s = s.replace(/^digital-ixus/, "ixus");
  if (loose) s = s.replace(/(\d)-?(is|hs|ti)$/, "$1");
  return s.replace(/-/g, "");
}

/**
 * Cameras other sources already hold, keyed by vendor slug and model key: strict keys, then
 * loose ones ("~" prefix). A loose key two records share is ambiguous and maps to null.
 */
export function existingCameras(records: DeviceRecord[]): Map<string, DeviceRecord | null> {
  const out = new Map<string, DeviceRecord | null>();
  for (const r of records) {
    if (r.category !== "camera" && r.category !== "action-camera") continue;
    const v = slugify(r.vendor);
    const strict = `${v}/${cameraKey(r.model, false)}`, loose = `~${v}/${cameraKey(r.model)}`;
    if (!out.has(strict)) out.set(strict, r);
    const prev = out.get(loose);
    if (prev === undefined) out.set(loose, r);
    else if (prev && prev.id !== r.id) out.set(loose, null);
  }
  return out;
}

let cache: Map<string, DeviceRecord | null> | null = null;

/** Cameras from the libgphoto2 snapshot (read once). Empty when the snapshot is absent. */
export function knownCameras(): Map<string, DeviceRecord | null> {
  cache ??= existingCameras(loadSnapshots().filter((s) => s.source === "libgphoto2").flatMap((s) => s.records));
  return cache;
}

/**
 * Vendor, model and id for a camera: the existing record's when one matches the loose key, so
 * records merge; otherwise our own spelling.
 */
export function cameraIdentity(vendor: string, model: string, known = knownCameras()): { id: string; vendor: string; model: string; aliases: string[] } {
  const v = slugify(vendor);
  const hit = known.get(`${v}/${cameraKey(model, false)}`) ?? known.get(`~${v}/${cameraKey(model)}`);
  if (hit) return { id: hit.id, vendor: hit.vendor, model: hit.model, aliases: hit.model === model ? [] : [model] };
  return { id: makeId(vendor, model), vendor, model, aliases: [] };
}
