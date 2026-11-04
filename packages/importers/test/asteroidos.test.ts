import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, type DeviceRecord } from "@opendevicedb/core";
import { fromWatches, watchIdentity, type Watch } from "../src/sources/asteroidos.ts";

const DATE = "2026-11-01";
const watch = (name: string, models: string[], extra: Partial<Watch> = {}): Watch => ({
  name, status: "supported", soc: "msm8909w",
  modelnumbers: models.map((model) => ({ name: model, num: "SHARED-SKU", codename: name })), ...extra,
});

test("AsteroidOS: retail brands and hardware variants retain their identities", () => {
  assert.deepEqual(watchIdentity("Armani Exchange Connected Drexler"), { vendor: "Armani Exchange", model: "Connected Drexler" });
  assert.deepEqual(watchIdentity("TicWatch Pro 3 GPS"), { vendor: "Mobvoi", model: "TicWatch Pro 3 GPS" });
  assert.deepEqual(watchIdentity("Moto 360 Sport"), { vendor: "Motorola", model: "Moto 360 Sport" });
  assert.deepEqual(watchIdentity("older Diggro DI07"), { vendor: "Diggro", model: "DI07 (older hardware)" });
  assert.equal(watchIdentity("MTK6580 watches"), null);
});

test("AsteroidOS: a shared SKU or platform does not merge distinct watches", () => {
  const rs = fromWatches([watch("rubyfish", ["TicWatch Pro 3 GPS", "TicWatch Pro 3 Ultra GPS"])], new Set(["rubyfish"]), [], DATE);
  assert.equal(rs.length, 2);
  assert.notEqual(rs[0].id, rs[1].id);
  assert.deepEqual(rs[0].identifiers?.sku, rs[1].identifiers?.sku);
  for (const r of rs) { assert.deepEqual(validate(r), []); assert.equal(r.verification, undefined); }
});

test("AsteroidOS: skip experimental ports, generic families and entries without a guide", () => {
  const rs = fromWatches([
    watch("supported", ["LG G Watch"]),
    watch("rinato", ["Samsung Gear 2"], { status: "experimental" }),
    watch("missing", ["Asus Zenwatch 3"]),
    watch("generic", ["MTK6580 watches"]),
    watch("unknown", ["Huawei Watch"], { status: "unsupported" }),
    watch("bad", ["LG Watch"], { modelnumbers: [{ name: "LG Watch", num: "", codename: "bad" }] }),
  ], new Set(["supported", "rinato", "generic", "unknown", "bad"]), [], DATE);
  assert.deepEqual(rs.map((r) => r.id), ["lg/g-watch"]);
});

test("AsteroidOS: repeated model names aggregate their build constraints; known exact models are enriched", () => {
  const known = [{ id: "lemfo/les-1", vendor: "Lemfo", model: "LES 1", category: "wearable" }] as DeviceRecord[];
  const a = watch("harmony", ["Lemfo LES1"]);
  const b = watch("inharmony", ["Lemfo LES1"]);
  const rs = fromWatches([a, b], new Set(["harmony", "inharmony"]), known, DATE);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].id, "lemfo/les-1");
  assert.ok(rs[0].aliases?.includes("harmony"));
  assert.ok(rs[0].aliases?.includes("inharmony"));
  assert.match(rs[0].install![0].firmware_constraints!, /harmony, inharmony/);
  assert.equal(rs[0].projects?.length, 2);
  assert.deepEqual(validate(rs[0]), []);
});

test("AsteroidOS: retain upstream feature limits without inventing firmware freedom", () => {
  const rs = fromWatches([watch("catfish", ["TicWatch Pro 2018"], {
    features: [{ name: "Display", status: "good" }, { name: "NFC", status: "bad" }, { name: "GPS", status: "partial" }],
  })], new Set(["catfish"]), [], DATE);
  assert.match(rs[0].summary!, /NFC \(unavailable\).*GPS \(partial\)/);
  assert.equal(rs[0].projects![0].license, undefined);
  assert.equal(rs[0].projects![0].freedom, undefined);
  assert.equal(rs[0].install![0].reversible, undefined);
});
