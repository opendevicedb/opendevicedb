import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "@opendevicedb/core";
import { parseNut, fromNut, identifiableNut, type NutRow } from "../src/sources/nut.ts";
const row = (extra: Partial<NutRow> = {}): NutRow => ({ vendor: "Eaton", type: "ups", level: "3", model: "5E1100iUSB", extra: "USB port", driver: "usbhid-ups", ...extra });

test("NUT parses quoted tab-separated fields, comments and empty details without treating stars as test ratings", () => {
  const text = '# version=2\n"Eaton"\t"ups"\t"3"\t"5E1100iUSB"\t""\t"usbhid-ups" # comment\n';
  assert.deepEqual(parseNut(text), [row({ extra: "" })]);
  assert.throws(() => parseNut('"Broken" "row"'), /unrecognized/);
  assert.equal(identifiableNut(row({ level: "9" })), false);
});

test("NUT excludes uncertain support and ambiguous model families instead of expanding them", () => {
  for (const model of ["(various)", "9PX series", "PM525A/-625A", "BX****MI", "All models", "RT 1000-3000VA"]) assert.equal(identifiableNut(row({ model })), false, model);
  for (const value of ["experimental", "untested", "no report, but should be supported"]) assert.equal(identifiableNut(row({ extra: value })), false, value);
  for (const model of ["Back-UPS", "Smart-UPS (USB)", "5P", "9PX"]) assert.equal(identifiableNut(row({ model })), false, model);
  assert.equal(identifiableNut(row({ vendor: "NUT", model: "Simulated devices", driver: "dummy-ups" })), false);
  assert.equal(identifiableNut(row({ vendor: "PiJuice", model: "PiJuice HAT" })), true);
  assert.equal(identifiableNut(row()), true);
});

test("NUT aggregates connections and driver alternatives while retaining all parameters", () => {
  const [r] = fromNut([row(), row({ extra: "Serial cable", driver: "driver=nutdrv_qx port=auto or blazer_ser baudrate=2400" }), row({ driver: "usbhid-ups option=1" })], "2026-11-01");
  assert.deepEqual(validate(r), []);
  assert.equal(r.category, "ups");
  assert.equal(r.projects?.length, 4);
  assert.equal(r.install?.length, 3);
  assert.match(r.install![0].firmware_constraints!, /USB port.*option=1/);
  assert.match(r.install![1].firmware_constraints!, /port=auto/);
  assert.match(r.install![2].firmware_constraints!, /baudrate=2400/);
  assert.match(r.install![0].firmware_constraints!, /published protocol/);
  assert.equal(r.verification, undefined);
  assert.equal(r.projects![0].freedom?.nonfree, undefined, "a host-side driver does not establish whether a particular UPS firmware is proprietary");
  assert.equal(r.projects![0].freedom?.cloud, undefined);
});

test("NUT keeps different hardware years separate and preserves exact HCL model links", () => {
  const rs = fromNut([row({ model: "F6H375-USB", extra: "USB (<= 2005 models, vendor id: 050d)" }), row({ model: "F6H375-USB", extra: "USB (2007 models, vendor id: 0665)" })]);
  assert.equal(rs.length, 2);
  assert.notEqual(rs[0].id, rs[1].id);
  assert.equal(new URL(rs[0].projects!.at(-1)!.url).searchParams.get("model"), "F6H375-USB");
  const [r] = fromNut([row({ model: "Back-UPS 1200BR (Microsol)" })]);
  assert.equal(new URL(r.projects!.at(-1)!.url).searchParams.get("model"), "Back-UPS 1200BR (Microsol)");
  assert.throws(() => fromNut([row({ model: "A1-B" }), row({ model: "A1 B" })]), /identity collision/);
});

test("NUT retains historical driver evidence and links the documented replacement for current installs", () => {
  const [r] = fromNut([row({ driver: "megatec_usb", extra: "USB" })]);
  assert.equal(r.install![0].project, "NUT blazer_usb");
  assert.equal(r.install![0].guide, "https://networkupstools.org/docs/man/blazer_usb.html");
  assert.match(r.install![0].firmware_constraints!, /Historical HCL driver megatec_usb was replaced by blazer_usb/);
  assert.ok(r.projects!.some((p) => p.name === "NUT driver migration notes"));
});
