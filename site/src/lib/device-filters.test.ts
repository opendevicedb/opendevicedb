// Run: npm test -w site
import { test } from "node:test";
import assert from "node:assert/strict";
import type { IndexEntry } from "@opendevicedb/core/browser";
import { countOptions, filterEntries, matchesOption, noFilters, readFilters, writeFilters, type Filters, type FilterGroup } from "./device-filters.ts";

const entry = (e: Partial<IndexEntry> & { id: string }): IndexEntry =>
  ({ vendor: "v", model: e.id, aliases: [], category: "other", status: "unknown", sources: [], identifiers: {}, claims: 0, verified: false, updated: "", ...e }) as IndexEntry;
const records = [
  entry({ id: "a", category: "camera", status: "controllable", sources: ["one", "two"], install: "easy", cloud: "none" }),
  entry({ id: "b", category: "router", status: "open-firmware", sources: ["two"], install: "hard", cloud: "setup-only" }),
  entry({ id: "c", category: "phone", status: "unknown", sources: ["three"], cloud: "required" }),
];
const ids = (f: Partial<Filters>, except?: keyof Filters) => filterEntries(records, { ...noFilters(), ...f }, except).map((e) => e.id);

test("any value within a filter, every filter across them, no duplicates", () => {
  assert.deepEqual(ids({ category: ["camera", "router"], status: ["controllable", "open-firmware"], source: ["two", "three"] }), ["a", "b"]);
  assert.deepEqual(ids({ category: ["camera", "router"], source: ["one"] }), ["a"]);
  assert.deepEqual(ids({ source: ["one", "two"] }), ["a", "b"]);
});

test("no filters keeps everything; impossible combinations keep nothing", () => {
  assert.deepEqual(ids({}), ["a", "b", "c"]);
  assert.deepEqual(ids({ category: ["camera"], status: ["unknown"] }), []);
});

test("an option's count leaves its own filter out and keeps the others", () => {
  assert.deepEqual(ids({ category: ["camera"], source: ["two"] }, "category"), ["a", "b"]);
  assert.deepEqual(ids({ category: ["camera"], source: ["three"] }, "source"), ["a"]);
});

test("install and cloud keep the directory's meanings", () => {
  assert.deepEqual(ids({ install: ["easy"] }), ["a"]);
  assert.deepEqual(ids({ install: ["any"] }), ["a", "b"]);
  assert.deepEqual(ids({ cloud: ["none"] }), ["a"]);
  assert.deepEqual(ids({ cloud: ["setup-only"] }), ["a", "b"]);
});

test("the URL keeps other parameters, repeats keys for several values, and drops cleared filters", () => {
  const p = new URLSearchParams("q=hello&category=camera&status=unknown&page=3");
  const next = writeFilters(p, { ...noFilters(), category: ["camera", "router"] });
  assert.equal(next.toString(), "q=hello&page=3&category=camera&category=router");
  assert.equal(p.get("status"), "unknown"); // the input is left alone
});

test("reading the URL keeps known values only, once each, and one for single-choice filters", () => {
  const groups: FilterGroup[] = (["category", "status", "source", "install", "cloud"] as const).map((key) => ({
    key, label: key, placeholder: "", multiple: key !== "install" && key !== "cloud",
    options: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
  }));
  const f = readFilters(new URLSearchParams("category=a&category=b&category=a&category=bad&cloud=a&cloud=b&status=bad"), groups);
  assert.deepEqual(f, { ...noFilters(), category: ["a", "b"], cloud: ["a"] });
});

test("one-pass option counts equal checking each option on its own", () => {
  const opts = (values: string[]) => values.map((value) => ({ value, label: value }));
  const groups: FilterGroup[] = [
    { key: "category", label: "", placeholder: "", multiple: true, options: opts(["camera", "router", "phone", "tv"]) },
    { key: "status", label: "", placeholder: "", multiple: true, options: opts(["controllable", "open-firmware", "unknown"]) },
    { key: "source", label: "", placeholder: "", multiple: true, options: opts(["one", "two", "three"]) },
    { key: "install", label: "", placeholder: "", multiple: false, options: opts(["easy", "any"]) },
    { key: "cloud", label: "", placeholder: "", multiple: false, options: opts(["none", "setup-only"]) },
  ];
  for (const g of groups) {
    const expected = new Map(g.options.map((o) => [o.value, records.filter((e) => matchesOption(e, g.key, o.value)).length]));
    assert.deepEqual(countOptions(records, g), expected, g.key);
  }
});
