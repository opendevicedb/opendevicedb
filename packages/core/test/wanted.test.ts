import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIssueForm, parseIdentifiers, parseWantedIssue, groupWanted, matchWanted, recordForRequest,
  wantedIssueUrl, fetchWanted, search, wantedToIndexEntry, type DeviceRecord,
} from "../src/index.ts";

const body = (vendor: string, model: string, ids = "_No response_", category = "drone") =>
  `### Vendor\n\n${vendor}\n\n### Model\n\n${model}\n\n### Category\n\n${category}\n\n### Identifiers\n\n${ids}\n\n### What do you want to do with it?\n\nFly it from Python\n\n### Content policy\n\n- [X] Not about Remote ID`;

const issue = (n: number, vendor: string, model: string, plus = 0, ids?: string) => ({
  number: n, html_url: `https://github.com/opendevicedb/opendevicedb/issues/${n}`, title: `Wanted: ${vendor} ${model}`,
  body: body(vendor, model, ids), created_at: `2026-10-${10 + n}T08:00:00Z`, reactions: { "+1": plus },
});

test("issue form body parses into fields, empty answers become empty strings", () => {
  const f = parseIssueForm(body("DJI", "Neo 2"));
  assert.equal(f.vendor, "DJI");
  assert.equal(f.model, "Neo 2");
  assert.equal(f.identifiers, "");
  assert.deepEqual(parseIdentifiers("FCC ID: SS3-NEO2\nUSB: 2ca3:001f, BLE name: NEO2-ABC\nplain"), ["SS3-NEO2", "2ca3:001f", "NEO2-ABC", "plain"]);
});

test("a request issue becomes a WantedRequest; votes = author + thumbs up", () => {
  const r = parseWantedIssue(issue(1, "DJI", "Neo 2", 3, "FCC ID: SS3-NEO2"))!;
  assert.equal(r.id, "dji/neo-2");
  assert.equal(r.votes, 4);
  assert.equal(r.category, "drone");
  assert.deepEqual(r.identifiers, ["SS3-NEO2"]);
  assert.equal(parseWantedIssue({ ...issue(2, "DJI", "Neo 2"), body: "free text" }), null);
  assert.equal(parseWantedIssue({ ...issue(3, "DJI", "Neo 2"), pull_request: {} }), null);
});

test("duplicates group by id, most wanted first, oldest issue is the one to vote on", () => {
  const g = groupWanted([issue(5, "DJI", "Neo 2", 1), issue(2, "dji", "NEO-2", 0), issue(3, "Acme", "Cam", 9)].map((i) => parseWantedIssue(i)!));
  assert.deepEqual(g.map((w) => [w.id, w.votes, w.issues]), [["acme/cam", 10, [3]], ["dji/neo-2", 3, [2, 5]]]);
  assert.match(g[1].url, /issues\/2$/);
  assert.equal(matchWanted(g, { vendor: "DJI", model: "Neo 2" })?.id, "dji/neo-2");
  assert.equal(matchWanted(g, { model: "neo 2" })?.id, "dji/neo-2"); // fuzzy
  assert.equal(matchWanted(g, { model: "neo 2" }, false), null);
  assert.equal(search(g.map(wantedToIndexEntry), "neo")[0].id, "dji/neo-2");
});

test("a request maps to a registry record by id or shared identifier only", () => {
  const recs = [{ id: "dji/neo", vendor: "DJI", model: "Neo", category: "drone", status: "unknown", identifiers: { fcc_id: ["SS3-NEO2"] }, updated: "2026-10-01" }] as DeviceRecord[];
  const r = parseWantedIssue(issue(1, "DJI", "Neo 2", 0, "FCC: ss3-neo2"))!;
  assert.equal(recordForRequest(recs, r)?.id, "dji/neo");
  assert.equal(recordForRequest(recs, { ...r, identifiers: [] }), null);
});

test("a chipset shared with another phone does not satisfy a device request", () => {
  const records = [{ id: "nokia/1", vendor: "Nokia", model: "1", category: "phone", status: "partial-protocol", identifiers: { chips: ["MT6739"] }, updated: "2026-11-16" }] as DeviceRecord[];
  assert.equal(recordForRequest(records, { id: "alcatel/5033xr", identifiers: ["5033XR", "Macau", "MT6739"] }), null);
  assert.equal(recordForRequest(records, { id: "nokia/1", identifiers: ["MT6739"] })?.id, "nokia/1");
});

test("shared device identifiers and conflicting identifiers leave exact-unit matching unresolved", () => {
  const a = { id: "acme/one", vendor: "Acme", model: "One", category: "phone", status: "controllable", updated: "2026-11-16", identifiers: { usb: ["1234:5678"], sku: ["ONE1"] } } as DeviceRecord;
  const b = { ...a, id: "acme/two", model: "Two", identifiers: { usb: ["1234:5678"], sku: ["TWO2"] } };
  for (const records of [[a, b], [b, a]]) {
    assert.equal(recordForRequest(records, { id: "acme/unknown", identifiers: ["1234:5678"] }), null);
    assert.equal(recordForRequest(records, { id: "acme/unknown", identifiers: ["ONE1", "TWO2"] }), null);
    assert.equal(recordForRequest(records, { id: "acme/unknown", identifiers: ["ONE1"] })?.id, a.id);
  }
});

test("the pre-filled issue link carries the template and fields", () => {
  const u = new URL(wantedIssueUrl({ vendor: "DJI", model: "Neo 2", identifiers: ["SS3-NEO2"] }));
  assert.equal(u.pathname, "/opendevicedb/opendevicedb/issues/new");
  assert.equal(u.searchParams.get("template"), "wanted.yml");
  assert.equal(u.searchParams.get("title"), "Wanted: DJI Neo 2");
  assert.equal(u.searchParams.get("model"), "Neo 2");
  assert.equal(u.searchParams.get("identifiers"), "SS3-NEO2");
});

test("fetchWanted pages through the GitHub API", async () => {
  const pages = [Array.from({ length: 100 }, (_, n) => issue(n + 1, "V", `M${n}`)), [issue(200, "DJI", "Neo 2")]];
  const seen: string[] = [];
  const fake = (async (url: string) => { seen.push(url); const p = pages[seen.length - 1]; return { ok: true, status: 200, json: async () => p }; }) as any;
  const all = await fetchWanted({ fetch: fake, token: "t" });
  assert.equal(all.length, 101);
  assert.match(seen[1], /labels=wanted&state=open&per_page=100&page=2/);
});
