import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, type DeviceRecord } from "@opendevicedb/core";
import { existingCameras } from "../src/camera-ids.ts";
import { CAMERA_MODS, fromMods, type CameraMod } from "../src/sources/camera-mods.ts";

const D = "2026-11-27";
const cam = (id: string, vendor: string, model: string) =>
  ({ id, vendor, model, category: "camera", status: "partial-protocol", provenance: { sources: ["libgphoto2"] }, updated: D }) as DeviceRecord;
const known = existingCameras([cam("nikon/z30", "Nikon", "Z30"), cam("nikon/j5", "Nikon", "J5"), cam("nikon/dsc-d5100", "Nikon", "DSC D5100")]);

const mod = (over: Partial<CameraMod>): CameraMod => ({
  project: "P", repo: "owner/p", rev: "a".repeat(40), license: "MIT", tier: "installable", does: "adds things",
  cameras: [], route: { method: "sd-card", difficulty: "medium", brick_risk: "medium", reversible: "yes" }, ...over,
});

test("camera-mods: tested bodies get a route pinned to the stock firmware, untested ones do not", () => {
  const [tested, untested] = fromMods([mod({ cameras: [
    { vendor: "Nikon", model: "Z 30", firmware: ["C 1.20"], tested: true },
    { vendor: "Nikon", model: "Z 50", firmware: ["C 2.00"], tested: false },
  ] })], known, D);
  assert.equal(tested.id, "nikon/z30", "merges with the libgphoto2 record");
  assert.equal(tested.status, "controllable");
  assert.equal(tested.install![0].firmware_constraints, "Stock firmware C 1.20 exactly.");
  assert.equal(tested.install![0].guide, `https://github.com/owner/p/tree/${"a".repeat(40)}`);
  assert.equal(untested.status, "partial-protocol");
  assert.deepEqual(untested.install, []);
  assert.match(untested.summary!, /not tested this body on hardware/);
});

test("camera-mods: research entries and narrow mods never claim control", () => {
  const [research] = fromMods([mod({ tier: "research", risk: "a build caused a boot loop", route: undefined,
    cameras: [{ vendor: "Nikon", model: "D5100", firmware: [], tested: false }] })], known, D);
  assert.equal(research.id, "nikon/dsc-d5100");
  assert.equal(research.status, "partial-protocol");
  assert.deepEqual(research.install, []);
  assert.match(research.summary!, /Research only: a build caused a boot loop/);
  assert.equal(research.projects![0].kind, "protocol-doc");
  const [lang] = fromMods([mod({ status: "partial-protocol", cameras: [{ vendor: "Nikon", model: "J5", firmware: ["C 1.01"], tested: true, aliases: ["Nikon 1 J5"] }] })], known, D);
  assert.equal(lang.status, "partial-protocol");
  assert.equal(lang.install!.length, 1, "still installable");
  assert.ok(lang.aliases!.includes("Nikon 1 J5"));
});

test("camera-mods: the reviewed table is consistent and every record validates", () => {
  for (const m of CAMERA_MODS) {
    assert.ok(/^https?:/.test(m.repo) || m.rev && /^[0-9a-f]{40}$/.test(m.rev), `${m.project}: pinned revision`);
    assert.ok(m.license, `${m.project}: licence stated`);
    if (m.tier === "installable") assert.ok(m.route, `${m.project}: installable needs a route`);
    for (const c of m.cameras) if (m.tier === "installable" && c.tested !== false) assert.ok(c.firmware.length, `${m.project} ${c.model}: firmware version`);
  }
  for (const r of fromMods(CAMERA_MODS, existingCameras([]), D)) assert.deepEqual(validate(r), [], r.id);
  // Deliberately absent: paid-feature key unlocks, closed executables, taken-down projects.
  const repos = CAMERA_MODS.map((m) => m.repo.toLowerCase()).join(" ");
  for (const banned of ["nikonunlock", "a6100-pp", "x2d"]) assert.ok(!repos.includes(banned), banned);
});
