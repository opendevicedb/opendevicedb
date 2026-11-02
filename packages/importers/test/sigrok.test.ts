import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "@opendevicedb/core";
import { finalize } from "../src/lib.ts";
import { parseSigrok, fromInstruments } from "../src/sources/sigrok.ts";

test("sigrok serial DMM importer reads registrations, excludes comments and placeholder families", () => {
  const rs = parseSigrok("serial-dmm", `
    SR_REGISTER_DEV_DRIVER_LIST(serial_dmm_drivers,
    DMM("digitech-qm1578", qm1578, "Digitech", "QM1578", "115200/8n1", OTHER),
    /* DMM("not-ready", chip, "Foo", "Future", OTHER) */
    // DMM("planned", chip, "Foo", "Planned", OTHER)
    DMM_CONN("brymen-bm25x", chip, "Brymen", "BM25x", OTHER),
    DMM_LEN("vendor-one", chip, "Vendor", "One/Two", OTHER),
    DMM("metrix-mx56c", chip, "Metrix", "MX56C", OTHER));`);
  assert.deepEqual(rs.map((r) => r.model), ["QM1578", "MX56C"]);
  assert.match(rs[0].details!, /digitech-qm1578/);
  assert.throws(() => parseSigrok("serial-dmm", "format changed"), /missing/);
});

test("sigrok combines original USB IDs for one Hantek model without importing a shared runtime ID", () => {
  const items = parseSigrok("hantek-6xxx", `static const struct profile dev_profiles[] = {
    { 0x04b4, 0x6022, 0x1d50, 0x608e, 0x0001, "Hantek", "6022BE", "fx2lafw-hantek-6022be.fw", EXTRA },
    { 0x04b5, 0x6022, 0x1d50, 0x608e, 0x0001, "Hantek", "6022BE", "fx2lafw-hantek-6022be.fw", EXTRA },
};`);
  const f = finalize(fromInstruments(items));
  assert.equal(f.invalid, 0);
  assert.equal(f.records.length, 1);
  assert.deepEqual(f.records[0].identifiers?.usb, ["04b4:6022", "04b5:6022"]);
  assert.match(f.records[0].install![0].firmware_constraints!, /volatile RAM/);
  assert.equal(f.records[0].projects![0].freedom, undefined);
});

test("sigrok FX2 import excludes generic chips, generic profiles and clones mentioned only in comments", () => {
  const items = parseSigrok("fx2lafw", `static const struct profile supported_fx2[] = {
    /* Not supported: HT USBee-DxPro */
    {0x08a9, 0x0015, "CWAV", "USBee DX", NULL, "cwav.fw", OTHER},
    {0x04b4, 0x8613, "Cypress", "FX2", NULL, "generic.fw", OTHER},
    {0x1d50, 0x608c, "sigrok", "FX2 LA (8ch)", NULL, "generic.fw", OTHER},
};`);
  assert.deepEqual(items.map((r) => r.vendor), ["CWAV"]);
  assert.equal(items[0].usb, "08a9:0015");
});

test("sigrok joins Rigol/Agilent model-to-series-to-vendor tables without expanding series names", () => {
  const items = parseSigrok("rigol-ds", `static const struct vendor supported_vendors[] = {
    [RIGOL] = {"Rigol", "Rigol Technologies"},
    [AGILENT] = {"Agilent", "Agilent Technologies"},
};
static const struct series supported_series[] = {
    [DS1000] = {VENDOR(RIGOL), "DS1000", OTHER},
    [MSO7000A] = {VENDOR(AGILENT), "MSO7000A", OTHER},
};
static const struct model supported_models[] = {
    {SERIES(DS1000), "DS1052D", {5, 1000000000}, CH_INFO(2, true), std_cmd},
    {SERIES(MSO7000A), "MSO7034A", {2, 1000000000}, CH_INFO(4, false), special_cmd},
};`);
  assert.deepEqual(items.map((r) => [r.vendor, r.model]), [["Rigol", "DS1052D"], ["Agilent", "MSO7034A"]]);
  assert.match(items[0].details!, /0\.2\.4/);
  assert.match(items[1].details!, /digital acquisition not enabled/);
  for (const r of fromInstruments(items)) {
    assert.deepEqual(validate(r), []);
    assert.equal(r.status, "controllable");
    assert.equal(r.projects![0].freedom?.nonfree, undefined, "stock firmware licensing must not be inferred from driver support");
    assert.equal(r.verification, undefined);
  }
});
