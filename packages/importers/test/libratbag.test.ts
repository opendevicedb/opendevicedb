import { test } from "node:test";
import assert from "node:assert/strict";
import { finalize } from "../src/lib.ts";
import { fromDevices, parseDevice, splitName } from "../src/sources/libratbag.ts";

const file = (name: string, match: string, type = "mouse") => `[Device]\nName=${name}\nDeviceMatch=${match}\nDriver=hidpp20\nDeviceType=${type}\n\n[Driver/hidpp20]\nQuirk=INDEX_OFFSET\n`;

test("libratbag parses USB and Bluetooth IDs from the Device section only", () => {
  const d = parseDevice("logitech-mx-master-3.device", file("Logitech MX Master 3", "bluetooth:046d:b023;usb:046d:4082;usb:046D:4082"))!;
  assert.deepEqual(d.usb, ["046d:4082"]);
  assert.deepEqual(d.bluetooth, ["046d:b023"]);
  assert.equal(d.driver, "hidpp20");
  assert.equal(parseDevice("x.device", "[Driver/foo]\nName=Nope\n"), null);
});

test("libratbag splits slash lists of model numbers, keeps product names and drops generic entries", () => {
  assert.deepEqual(splitName("Logitech Gaming Mouse G102/G103/G203"), { vendor: "Logitech", models: ["G102", "G103", "G203"] });
  assert.deepEqual(splitName("SteelSeries Rival 100/105"), { vendor: "SteelSeries", models: ["Rival 100", "Rival 105"] });
  assert.deepEqual(splitName("Logitech M585/M590"), { vendor: "Logitech", models: ["M585", "M590"] });
  assert.deepEqual(splitName("Glorious Model O/O-"), { vendor: "Glorious", models: ["Model O"] });
  assert.deepEqual(splitName("ASUSTeK TUF GAMING M3 GEN II"), { vendor: "ASUS", models: ["TUF GAMING M3 GEN II"] });
  assert.deepEqual(splitName("G9x [Original]"), { vendor: "Logitech", models: ["G9x"] });
  assert.deepEqual(splitName("Logitech G402 Gaming Mouse"), { vendor: "Logitech", models: ["G402"] });
  assert.deepEqual(splitName("Mars Gaming MM4"), { vendor: "Mars Gaming", models: ["MM4"] });
  assert.equal(splitName("SinoWealth Generic Mouse (0027)"), null);
  assert.equal(splitName("openinput"), null);
  assert.equal(splitName("SteelSeries Rival"), null);
});

test("libratbag records share grouped IDs, name the upstream entry and merge duplicate files", () => {
  const devices = [
    parseDevice("a.device", file("SteelSeries Rival 100/105", "usb:1038:1702;usb:1038:1814"))!,
    parseDevice("g5.device", file("G5", "usb:046d:c041"))!,
    parseDevice("g5-2007.device", file("G5", "usb:046d:c049"))!,
  ];
  const f = finalize(fromDevices(devices, "abc123", "2026-11-10"));
  assert.equal(f.invalid, 0);
  const byId = Object.fromEntries(f.records.map((r) => [r.id, r]));
  assert.deepEqual(Object.keys(byId).sort(), ["logitech/g5", "steelseries/rival-100", "steelseries/rival-105"]);
  assert.deepEqual(byId["steelseries/rival-105"].identifiers?.usb, ["1038:1702", "1038:1814"]);
  assert.match(byId["steelseries/rival-100"].summary!, /covers Rival 100, Rival 105/);
  assert.deepEqual(byId["logitech/g5"].identifiers?.usb, ["046d:c041", "046d:c049"]);
  assert.equal(byId["steelseries/rival-100"].projects![0].url, "https://github.com/libratbag/libratbag/blob/abc123/data/devices/a.device");
});
