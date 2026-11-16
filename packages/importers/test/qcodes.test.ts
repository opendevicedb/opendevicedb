import { test } from "node:test";
import assert from "node:assert/strict";
import { finalize } from "../src/lib.ts";
import { DRIVERS, EXCLUDED, drivers, fromDrivers, instrumentClasses, pythonClasses } from "../src/sources/qcodes.ts";

test("qcodes table names concrete models only, never a reviewed exclusion", () => {
  const classes = DRIVERS.map((d) => d[1]);
  assert.equal(new Set(classes).size, classes.length, "each driver class appears once");
  for (const c of classes) assert.ok(!EXCLUDED.has(c), `${c} is both imported and excluded`);
  for (const d of drivers()) {
    assert.doesNotMatch(d.model, /x{2,}|series|Base$/i, `${d.cls} maps to a family name`);
    assert.ok(d.file.endsWith(".py"));
  }
});

test("qcodes driver naming two products gives one record per product, each naming the other", () => {
  const items = drivers([["rigol/Rigol_DP832.py", "RigolDP832", ["DP832", "DP832A"]]]);
  const f = finalize(fromDrivers(items, "v0.62.0", "2026-11-10"));
  assert.equal(f.invalid, 0);
  assert.deepEqual(f.records.map((r) => r.id), ["rigol/dp832", "rigol/dp832a"]);
  assert.match(f.records[0].summary!, /also covers the DP832A/);
  assert.equal(f.records[0].projects![0].url, "https://github.com/microsoft/Qcodes/blob/v0.62.0/src/qcodes/instrument_drivers/rigol/Rigol_DP832.py");
  assert.equal(f.records[0].install![0].guide, "https://microsoft.github.io/Qcodes/drivers_api/Rigol.html");
});

test("qcodes records validate and do not claim a hardware test", () => {
  const f = finalize(fromDrivers(drivers(), "v0.62.0", "2026-11-10"));
  assert.equal(f.invalid, 0);
  assert.equal(f.records.length, drivers().length);
  for (const r of f.records) {
    assert.equal(r.status, "controllable");
    assert.match(r.summary!, /not an OpenDeviceDB hardware test/);
  }
});

test("qcodes class scanners read top-level classes and flag only instrument subclasses for review", () => {
  const src = `class Keithley2400(VisaInstrument):\n    pass\nclass Keithley2450Buffer(InstrumentChannel):\n    pass\nclass _Private(Instrument):\n    pass\nclass Helper:\n    pass\n    class Nested(Instrument):\n        pass\n`;
  assert.deepEqual(pythonClasses(src), ["Keithley2400", "Keithley2450Buffer", "_Private", "Helper"]);
  assert.deepEqual(instrumentClasses(src), ["Keithley2400"]);
});
