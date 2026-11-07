import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, type DeviceRecord } from "@opendevicedb/core";
import { cameraKey, cameraIdentity, existingCameras } from "../src/camera-ids.ts";
import { parsePorts, fromPorts as mlRecords } from "../src/sources/magiclantern.ts";
import { parseDevices, fromDevice } from "../src/sources/openmemories.ts";
import { parseModels, pentaxName, fromModel } from "../src/sources/pktriggercord.ts";
import { parseHeader, fromPorts as fujiRecords } from "../src/sources/fujihack.ts";

const D = "2026-11-01";
const cam = (id: string, vendor: string, model: string): DeviceRecord =>
  ({ id, vendor, model, category: "camera", status: "partial-protocol", provenance: { sources: ["libgphoto2"] }, updated: D }) as DeviceRecord;
const known = existingCameras([
  cam("canon/eos-7d-markii", "Canon", "EOS 7D MarkII"),
  cam("sony/alpha-a7r-ii", "Sony", "Alpha A7R II"),
  cam("sony/rx100m3", "Sony", "RX100M3"),
  cam("pentax/k3-ii", "Pentax", "K3 II"),
]);

test("camera keys: one body, many spellings", () => {
  assert.equal(cameraKey("EOS 7D Mark II"), cameraKey("EOS 7D MarkII"));
  assert.equal(cameraKey("ILCE-7RM2"), cameraKey("Alpha A7R II"));
  assert.equal(cameraKey("ILCE-7RM2"), cameraKey("ilce-7r-m2"));
  assert.equal(cameraKey("DSC-RX100M3"), cameraKey("RX100M3"));
  assert.equal(cameraKey("K-3 II"), cameraKey("K3 II"));
  assert.notEqual(cameraKey("EOS 5D Mark III"), cameraKey("EOS 5D Mark II"));
  assert.equal(cameraKey("Digital IXUS100"), cameraKey("Digital IXUS 100 IS"));
  assert.equal(cameraKey("PowerShot SX280 HS"), cameraKey("PowerShot SX280HS"));
  assert.equal(cameraKey("IXUS 310IS"), cameraKey("Digital IXUS310"));
  assert.notEqual(cameraKey("K-5 IIs"), cameraKey("K-5 II"));
  assert.notEqual(cameraKey("ILCE-7"), cameraKey("ILCE-7R"));
  // A match takes the existing record's id; no match keeps our spelling.
  assert.deepEqual(cameraIdentity("Canon", "EOS 7D Mark II", known), { id: "canon/eos-7d-markii", vendor: "Canon", model: "EOS 7D MarkII", aliases: ["EOS 7D Mark II"] });
  assert.equal(cameraIdentity("Canon", "EOS R5", known).id, "canon/eos-r5");
  // The strict key wins; a loose key shared by two cameras matches neither.
  const ixus = existingCameras([cam("canon/digital-ixus-300", "Canon", "Digital IXUS 300"), cam("canon/digital-ixus-300-hs", "Canon", "Digital IXUS 300 HS"), cam("canon/digital-ixus-100-is", "Canon", "Digital IXUS 100 IS")]);
  assert.equal(cameraIdentity("Canon", "Digital IXUS 300 HS", ixus).id, "canon/digital-ixus-300-hs");
  assert.equal(cameraIdentity("Canon", "Digital IXUS 300", ixus).id, "canon/digital-ixus-300");
  assert.equal(cameraIdentity("Canon", "Digital IXUS300 IS", ixus).id, "canon/digital-ixus300-is", "ambiguous: no merge");
  assert.equal(cameraIdentity("Canon", "Digital IXUS100", ixus).id, "canon/digital-ixus-100-is");
});

test("magiclantern: installable ports vs ports in development, firmwares merged", () => {
  const ports = parsePorts([
    "platform/5D3.113/ML-SETUP.FIR", "platform/5D3.113/stubs.S", "platform/5D3.123/ML-SETUP.FIR",
    "platform/7D2.112/ML-SETUP.FIR", "platform/R5.152/stubs.S", "platform/7D_MASTER.203/stubs.S",
    "platform/unmaintained/40D.111/stubs.S", "platform/Makefile",
  ]);
  assert.equal(ports.length, 5);
  const { records, unknown } = mlRecords(ports, known, D);
  assert.deepEqual(unknown, []);
  const by = new Map(records.map((r) => [r.id, r]));
  assert.equal(by.size, 3, "7D_MASTER is the 7D's second processor, unmaintained ports are left out");
  const d3 = by.get("canon/eos-5d-mark-iii")!;
  assert.equal(d3.status, "controllable");
  assert.match(d3.install![0].firmware_constraints!, /1\.1\.3 or 1\.2\.3/);
  assert.equal(by.get("canon/eos-7d-markii")!.model, "EOS 7D MarkII"); // merges with libgphoto2
  const r5 = by.get("canon/eos-r5")!;
  assert.equal(r5.status, "partial-protocol");
  assert.deepEqual(r5.install, []);
  for (const r of records) assert.deepEqual(validate(r), [], r.id);
});

test("openmemories: apps make it controllable, signed firmware is left out", () => {
  const devices = parseDevices("DSC-RX100M3:\n  arch: CXD90014\n  model: 0x1\n  apps: '2.4'\nILCE-7RM2:\n  arch: CXD90014\n  apps: '2.5'\nILCE-7M3:\n  arch: CXD90045\n  apps: '2.6'\nDSC-HX20:\n  arch: CXD4132\nHDR-AS100V:\n  arch: CXD90014\n  apps: '1.0'\n");
  assert.equal(devices.length, 5);
  const rs = devices.map((d) => fromDevice(d, known, D));
  assert.equal(rs[2], null);
  assert.equal(rs[0]!.id, "sony/rx100m3");
  assert.equal(rs[0]!.status, "controllable");
  assert.equal(rs[1]!.id, "sony/alpha-a7r-ii");
  assert.equal(rs[3]!.status, "partial-protocol");
  assert.equal(rs[4]!.category, "action-camera");
  for (const r of rs) if (r) assert.deepEqual(validate(r), [], r.id);
});

test("pktriggercord: table parsing, Samsung GX bodies, Pentax names", () => {
  const c = `static ipslr_model_info_t camera_models[] = {\n  { 0x12aa2, "*ist DS",     true,  true, 0 },\n  { 0x12b9c, "K-3II", false, true },\n  { 0x12b80, "GX20", true },\n  { 0x12b80, "GX20", true },\n};`;
  assert.deepEqual(parseModels(c), ["*ist DS", "K-3II", "GX20"]);
  assert.deepEqual(pentaxName("GX20"), { vendor: "Samsung", model: "GX-20" });
  assert.deepEqual(pentaxName("K-5IIs"), { vendor: "Pentax", model: "K-5 IIs" });
  const k3 = fromModel("K-3II", known, D);
  assert.equal(k3.id, "pentax/k3-ii");
  assert.equal(k3.status, "controllable");
  assert.ok(k3.aliases!.includes("K-3II"));
  assert.equal(fromModel("*ist DS", known, D).id, "pentax/ist-ds");
  assert.deepEqual(validate(k3), []);
});

test("fujihack: model headers remain research evidence without a documented debugger port", () => {
  assert.deepEqual(parseHeader("xt2_440.h", '#define MODEL_NAME "Fujifilm X-T2"\n'), { file: "xt2_440.h", name: "Fujifilm X-T2", firmware: "4.40" });
  assert.equal(parseHeader("stub.h", "#define X 1"), null);
  const rs = fujiRecords([{ file: "xt2_440.h", name: "Fujifilm X-T2", firmware: "4.40" }, { file: "xt2_410.h", name: "Fujifilm X-T2", firmware: "4.10" }], known, D);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].id, "fujifilm/x-t2");
  assert.equal(rs[0].status, "partial-protocol");
  assert.deepEqual(rs[0].install, []);
  assert.match(rs[0].summary!, /research definitions for firmware 4\.40, 4\.10/);
  assert.deepEqual(validate(rs[0]), []);
});

test("fujihack: documented debugger routes apply only to the documented firmware", () => {
  const rs = fujiRecords([
    { file: "xa2_130.h", name: "Fujifilm X-A2", firmware: "1.30" },
    { file: "xa2_131.h", name: "Fujifilm X-A2", firmware: "1.31" },
    { file: "xf1_101.h", name: "Fujifilm XF-1", firmware: "1.01" },
    { file: "xf1_102.h", name: "Fujifilm XF-1", firmware: "1.02" },
  ], known, D);
  assert.equal(rs.length, 2);
  for (const [r, fw] of [[rs[0], "1.30"], [rs[1], "1.01"]] as const) {
    assert.equal(r.install![0].brick_risk, "high");
    assert.equal(r.install![0].firmware_constraints, `Built against Fujifilm firmware ${fw}.`);
    assert.deepEqual(validate(r), [], r.id);
  }
  const [unknown] = fujiRecords([{ file: "xa2_131.h", name: "Fujifilm X-A2", firmware: "1.31" }], known, D);
  assert.deepEqual(unknown.install, []);
});
