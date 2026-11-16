import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWantedIssue, type DeviceRecord, type WantedRequest } from "@opendevicedb/core";
import { triage, lastMarker, type Issue, type Comment } from "./wanted-triage.ts";

const ON = "2026-10-17";
const issue = (n: number, vendor: string, model: string, goal = "control it locally", ids = "_No response_"): Issue => ({
  number: n, html_url: `https://github.com/opendevicedb/opendevicedb/issues/${n}`, title: `Wanted: ${vendor} ${model}`,
  body: `### Vendor\n\n${vendor}\n\n### Model\n\n${model}\n\n### Category\n\ndrone\n\n### Identifiers\n\n${ids}\n\n### What do you want to do with it?\n\n${goal}\n\n### Content policy\n\n- [X] Not about Remote ID or geofencing`,
  created_at: "2026-10-17T08:00:00Z", state: "open", labels: [{ name: "wanted" }],
});
const reqs = (...is: Issue[]) => is.map(parseWantedIssue).filter((r): r is WantedRequest => !!r);
const rec = (id: string, status: DeviceRecord["status"], extra: Partial<DeviceRecord> = {}): DeviceRecord =>
  ({ id, vendor: id.split("/")[0], model: id.split("/")[1], category: "drone", status, updated: ON, ...extra });
const bot = (body: string): Comment => ({ body, user: { login: "github-actions[bot]", type: "Bot" } });

test("a new request for an unknown device gets a welcome comment with a marker", () => {
  const i = issue(1, "Parrot", "Bebop 2");
  const a = triage(i, [], reqs(i), [], { on: ON });
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, "comment");
  assert.deepEqual(lastMarker([bot((a[0] as any).body)]), { id: "parrot/bebop-2", rank: -1 });
  // seen once: nothing more on edit
  assert.deepEqual(triage(i, [bot((a[0] as any).body)], reqs(i), [], { on: ON, event: "edited" }), []);
});

test("a duplicate is pointed to the first request and closed", () => {
  const a1 = issue(1, "Parrot", "Bebop 2"), a2 = issue(4, "parrot", "BEBOP-2");
  const a = triage(a2, [], reqs(a1, a2), [], { on: ON });
  assert.match((a[0] as any).body, /Duplicate of #1/);
  assert.deepEqual(a[1], { kind: "close", reason: "not_planned" });
  assert.equal(triage(a1, [], reqs(a1, a2), [], { on: ON })[0].kind, "comment"); // the first one is not a duplicate
});

test("a request closes only when a usable result arrives after it was seen", () => {
  const i = issue(1, "Parrot", "Bebop 2");
  const seen = [bot("Thanks\n\n<!-- odb-triage id=parrot/bebop-2 rank=-1 -->")];
  assert.deepEqual(triage(i, seen, reqs(i), [rec("parrot/bebop-2", "unknown")], { on: ON }), []);
  const done = triage(i, seen, reqs(i), [rec("parrot/bebop-2", "controllable")], { on: ON });
  assert.match((done[0] as any).body, /usable result is now in OpenDeviceDB.*devices\/parrot\/bebop-2\//);
  assert.deepEqual(done[1], { kind: "close", reason: "completed" });
});

test("a request for an already usable device stays open; reopening re-marks it", () => {
  const i = issue(1, "Ryze", "Tello");
  const a = triage(i, [], reqs(i), [rec("ryze/tello", "controllable")], { on: ON });
  assert.equal(a.length, 1);
  assert.match((a[0] as any).body, /already in OpenDeviceDB/);
  const seen = [bot((a[0] as any).body)];
  assert.deepEqual(triage(i, seen, reqs(i), [rec("ryze/tello", "controllable")], { on: ON }), []);
  assert.equal(triage(i, seen, reqs(i), [rec("ryze/tello", "controllable")], { on: ON, event: "reopened" }).length, 1);
});

test("identifiers match a record under another name", () => {
  const i = issue(1, "DJI", "Neo Two", "fly it", "FCC ID: SS3-NEO2");
  const a = triage(i, [], reqs(i), [rec("dji/neo-2", "partial-protocol", { identifiers: { fcc_id: ["SS3-NEO2"] } })], { on: ON });
  assert.match((a[0] as any).body, /dji\/neo-2/);
});

test("Alcatel 5033XR cannot be answered or auto-closed using Nokia's shared chipset", () => {
  const i = issue(47, "Alcatel", "5033xr", "use a Linux mobile OS", "5033XR\nMacau\nMT6739");
  const unrelated = rec("nokia/1", "partial-protocol", { category: "phone", identifiers: { chips: ["MT6739"] } });
  const actions = triage(i, [], reqs(i), [unrelated], { on: ON });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, "comment");
  assert.doesNotMatch((actions[0] as any).body, /Nokia|nokia\/1|already in OpenDeviceDB/);
  assert.deepEqual(lastMarker([bot((actions[0] as any).body)]), { id: "alcatel/5033xr", rank: -1 });
  assert.equal(triage(i, [bot('<!-- odb-triage id=alcatel/5033xr rank=-1 -->')], reqs(i), [unrelated], { on: ON }).some(a => a.kind === "close"), false);
});

test("a shared USB ID cannot select an arbitrary product for automatic closure", () => {
  const i = issue(48, "Acme", "Unknown", "control it", "USB: 1234:5678");
  const records = ["one", "two"].map(model => rec(`acme/${model}`, "controllable", { identifiers: { usb: ["1234:5678"] } }));
  const actions = triage(i, [bot('<!-- odb-triage id=acme/unknown rank=-1 -->')], reqs(i), records, { on: ON });
  assert.deepEqual(actions, []);
});

test("policy hits in the goal are labelled for review, not the form's own checkbox text", () => {
  const ok = issue(1, "Acme", "Sky");
  assert.equal(triage(ok, [], reqs(ok), [], { on: ON }).some((x) => x.kind === "label"), false);
  const bad = issue(2, "Acme", "Sky", "disable the geofencing");
  const a = triage(bad, [], reqs(bad), [], { on: ON });
  assert.deepEqual(a[0], { kind: "label", name: "policy" });
  assert.deepEqual(triage(bad, [bot("x <!-- odb-triage policy -->")], reqs(bad), [], { on: ON }), []);
});

test("unreadable requests get one note; closed or unlabelled issues are ignored", () => {
  const i = { ...issue(1, "A", "B"), body: "hello" };
  assert.equal(triage(i, [], [], [], { on: ON }).length, 1);
  assert.deepEqual(triage(i, [bot("<!-- odb-triage unreadable -->")], [], [], { on: ON }), []);
  assert.deepEqual(triage({ ...issue(2, "A", "B"), state: "closed" }, [], [], [], { on: ON }), []);
  assert.deepEqual(triage({ ...issue(3, "A", "B"), labels: [] }, [], [], [], { on: ON }), []);
});

test("human comments carrying a marker are not trusted", () => {
  assert.equal(lastMarker([{ body: "<!-- odb-triage id=a/b rank=4 -->", user: { login: "someone", type: "User" } }]), null);
});
