import { test } from "node:test";
import assert from "node:assert/strict";
import { finalize } from "../src/lib.ts";
import { fromTablets, parseConfig, parseTabletsMd } from "../src/sources/opentabletdriver.ts";

const config = JSON.stringify({
  Name: "Wacom CTH-460",
  DigitizerIdentifiers: [{ VendorID: 1386, ProductID: 214, InputReportLength: 9 }, { VendorID: 1386, ProductID: 214, InputReportLength: 11 }],
  AuxiliaryDeviceIdentifiers: [{ VendorID: 1386, ProductID: 209 }],
});

const md = `| Tablet | Status | Notes |
| ------ | :----: | ----- |
| Wacom CTH-460 | Has Quirks | Touch is not supported. |
| Huion GT-220 V2 (2048) | Supported |
| Foo Bar | Questionable |
`;

test("opentabletdriver reads digitizer and auxiliary IDs as hex, deduplicated", () => {
  const t = parseConfig("Wacom/CTH-460.json", "﻿" + config)!;
  assert.equal(t.vendor, "Wacom");
  assert.deepEqual(t.usb, ["056a:00d1", "056a:00d6"]);
});

test("opentabletdriver keeps TABLETS.md status and notes, skips the header and separator rows", () => {
  const s = parseTabletsMd(md);
  assert.deepEqual([...s.keys()], ["Wacom CTH-460", "Huion GT-220 V2 (2048)", "Foo Bar"]);
  assert.deepEqual(s.get("Wacom CTH-460"), { status: "Has Quirks", notes: "Touch is not supported." });
});

test("opentabletdriver records carry the upstream status, encode file URLs and drop questionable entries", () => {
  const tablets = [
    parseConfig("Wacom/CTH-460.json", config)!,
    { file: "Huion/GT-220 V2 (2048).json", vendor: "Huion", name: "Huion GT-220 V2 (2048)", usb: ["256c:006e"] },
    { file: "Foo/Bar.json", vendor: "Foo", name: "Foo Bar", usb: ["1234:5678"] },
    { file: "Huion/New.json", vendor: "Huion", name: "Huion New", usb: [] },
  ];
  const f = finalize(fromTablets(tablets, parseTabletsMd(md), "v0.6.8.1", "2026-11-10"));
  assert.equal(f.invalid, 0);
  const byId = Object.fromEntries(f.records.map((r) => [r.id, r]));
  assert.deepEqual(Object.keys(byId).sort(), ["huion/gt-220-v2-2048", "huion/new", "wacom/cth-460"]);
  assert.match(byId["wacom/cth-460"].summary!, /"Has Quirks" \(Touch is not supported\)/);
  assert.match(byId["huion/new"].summary!, /Not yet listed/);
  assert.equal(byId["huion/new"].identifiers, undefined);
  assert.equal(byId["huion/gt-220-v2-2048"].projects![0].url, "https://github.com/OpenTabletDriver/OpenTabletDriver/blob/v0.6.8.1/OpenTabletDriver.Configurations/Configurations/Huion/GT-220%20V2%20(2048).json");
});
