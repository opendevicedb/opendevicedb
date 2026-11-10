import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "@opendevicedb/core";
import { fromDefinitions, z2mInstall } from "../src/sources/zigbee2mqtt.ts";

const D = "2026-10-17";

test("zigbee2mqtt install route: pairing, guided by the device's docs page", () => {
  const recs = fromDefinitions([{
    vendor: "IKEA", model: "LED1545G12", description: "TRADFRI bulb E26/E27", exposes: ["light"], zigbeeModel: ["TRADFRI bulb E27 WS opal 980lm"],
    whiteLabel: [{ vendor: "IKEA", model: "LED1546G12", fingerprint: [{ modelID: "TRADFRI bulb E27 WS clear 950lm" }] }, { vendor: "Other", model: "X1" }],
  }], D);
  for (const r of recs) assert.deepEqual(validate(r), [], JSON.stringify(r));
  assert.deepEqual(recs[0].install, [{
    project: "Zigbee2MQTT", method: "pairing", guide: "https://www.zigbee2mqtt.io/devices/LED1545G12.html", difficulty: "medium",
    tools: ["Zigbee USB coordinator", "Computer or Raspberry Pi running Zigbee2MQTT"], brick_risk: "none", reversible: "yes",
    notes: "Pair the device with your Zigbee network after any preparation required by its device guide. This route covers pairing; remove the device from Zigbee2MQTT to undo the pairing.",
  }]);
  // the guide is the docs page the record links to: its own for a fingerprinted white label, else the base model's
  assert.deepEqual(recs.map((r) => r.install![0].guide), recs.map((r) => r.projects![0].url));
  for (const r of recs) assert.deepEqual(r.projects![0].freedom, { nonfree: ["device-firmware"], cloud: "none" });
  assert.equal(recs[1].install![0].guide, "https://www.zigbee2mqtt.io/devices/LED1546G12.html");
  assert.equal(recs[2].install![0].guide, "https://www.zigbee2mqtt.io/devices/LED1545G12.html");
  assert.equal(z2mInstall("ZNCZ02LM/ZNCZ03LM").guide, "https://www.zigbee2mqtt.io/devices/ZNCZ02LM_ZNCZ03LM.html");
  assert.equal(z2mInstall("FUT035Z+").guide, "https://www.zigbee2mqtt.io/devices/FUT035Z_.html", "the site publishes + and & as _");
  assert.equal(z2mInstall("L1(ZW)").guide, "https://www.zigbee2mqtt.io/devices/L1(ZW).html");
  assert.equal(z2mInstall("_TZ3000_o1jzcxou").guide, "https://www.zigbee2mqtt.io/devices/TZ3000_o1jzcxou.html", "leading _ dropped");
});

test("zigbee2mqtt preserves the LYWSD03MMC firmware conversion prerequisite separately from native Zigbee models", () => {
  const records = fromDefinitions([
    { vendor: "Custom devices (DiY)", model: "LYWSD03MMC", description: "Xiaomi temperature & humidity sensor with custom firmware", exposes: ["temperature"], zigbeeModel: ["LYWSD03MMC"] },
    { vendor: "Xiaomi", model: "LYWSD03MMC-z", description: "Temperature and humidity sensor", exposes: ["temperature"], zigbeeModel: ["LYWSD03MMC-z"] },
    { vendor: "IKEA", model: "LED1545G12", description: "TRADFRI bulb", exposes: ["light"] },
    { vendor: "Example", model: "Native", description: "Sensor does not require custom firmware", exposes: ["temperature"] },
  ], D);
  for (const r of records) assert.deepEqual(validate(r), []);
  const [custom, native, ordinary, negative] = records;
  const route = custom.install![0];
  assert.equal(custom.id, "custom-devices-diy/lywsd03mmc");
  assert.equal(route.method, "pairing");
  assert.equal(route.guide, "https://www.zigbee2mqtt.io/devices/LYWSD03MMC.html");
  assert.match(route.firmware_constraints!, /original LYWSD03MMC is Bluetooth-only/);
  assert.match(route.firmware_constraints!, /custom Zigbee firmware before pairing/);
  assert.match(route.notes!, /does not restore the original firmware/);
  assert.equal(route.brick_risk, undefined, "no blanket end-to-end risk claim for firmware preparation");
  assert.equal(route.reversible, undefined, "pairing removal is not a firmware rollback guarantee");
  assert.equal(custom.projects![0].freedom!.nonfree, undefined, "do not label an unspecified custom image as proprietary stock firmware");
  assert.match(custom.summary!, /custom Zigbee firmware/);
  assert.equal(native.id, "xiaomi/lywsd03mmc-z");
  for (const r of [native, ordinary, negative]) {
    assert.equal(r.install![0].firmware_constraints, undefined);
    assert.equal(r.install![0].brick_risk, "none");
    assert.equal(r.install![0].reversible, "yes");
    assert.deepEqual(r.projects![0].freedom!.nonfree, ["device-firmware"]);
  }
});

test("zigbee2mqtt retains custom firmware context through white-label descriptions and page fallback", () => {
  const records = fromDefinitions([
    { vendor: "Maker", model: "Base", description: "Sensor with Custom Firmware", exposes: ["temperature"],
      whiteLabel: [{ vendor: "Brand", model: "White", description: "A renamed sensor", fingerprint: [{ modelID: "White" }] }] },
    { vendor: "Maker", model: "Normal", description: "Sensor", exposes: ["temperature"],
      whiteLabel: [{ vendor: "Brand", model: "Custom", description: "Sensor with custom-firmware" }] },
  ], D, new Set());
  for (const r of records) assert.deepEqual(validate(r), []);
  for (const r of [records[0], records[1], records[3]]) {
    assert.match(r.install![0].firmware_constraints!, /requires compatible custom Zigbee firmware/);
    assert.equal(r.install![0].guide, "https://www.zigbee2mqtt.io/guide/usage/pairing_devices.html");
    assert.equal(r.install![0].reversible, undefined);
  }
  assert.equal(records[2].install![0].firmware_constraints, undefined);
  assert.equal(records[1].projects![0].url, "https://www.zigbee2mqtt.io/devices/White.html");
});

test("zigbee2mqtt install guide: the general pairing guide while the docs site has no page yet", () => {
  const pages = new Set(["FUT035Z+", "ZNCZ02LM_ZNCZ03LM", "_TZ3000_o1jzcxou"]);
  assert.equal(z2mInstall("_TZ3000_o1jzcxou", pages).guide, "https://www.zigbee2mqtt.io/devices/TZ3000_o1jzcxou.html");
  assert.equal(z2mInstall("FUT035Z+", pages).guide, "https://www.zigbee2mqtt.io/devices/FUT035Z_.html");
  assert.equal(z2mInstall("ZNCZ02LM/ZNCZ03LM", pages).guide, "https://www.zigbee2mqtt.io/devices/ZNCZ02LM_ZNCZ03LM.html");
  assert.equal(z2mInstall("MS01", pages).guide, "https://www.zigbee2mqtt.io/guide/usage/pairing_devices.html");
  const [r] = fromDefinitions([{ vendor: "Besisglas", model: "MS01", exposes: ["occupancy"] }], D, pages);
  assert.deepEqual(validate(r), []);
  assert.equal(r.install![0].guide, "https://www.zigbee2mqtt.io/guide/usage/pairing_devices.html");
  assert.equal(r.projects![0].url, "https://www.zigbee2mqtt.io/devices/MS01.html", "the project link is unchanged");
});
