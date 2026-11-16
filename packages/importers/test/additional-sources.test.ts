import { test } from "node:test";
import assert from "node:assert/strict";
import { finalize } from "../src/lib.ts";
import { fromHardware, meshName, type MeshHardware } from "../src/sources/meshtastic.ts";
import { parseBoard, fromBoard as armbianBoard } from "../src/sources/armbian.ts";
import { boardValues, fromBoard as circuitBoard } from "../src/sources/circuitpython.ts";
import { parseDevices, prerequisites, fromDevice as ubuntuDevice } from "../src/sources/ubports.ts";
import { deviceFiles, featureStates, fromDevice as droidianDevice } from "../src/sources/droidian.ts";
import { mobileNames } from "../src/sources/mobile-names.ts";

const ref = "test-revision", date = "2026-11-16";
const mesh: MeshHardware = { hwModel: 69, hwModelSlug: "HELTEC_MESH_NODE_T114", displayName: "Heltec Mesh Node T114", architecture: "nrf52840", platformioTarget: "heltec-mesh-node-t114", activelySupported: true, tags: ["Heltec"], requiresDfu: true };

test("Meshtastic keeps active DFU targets distinct from inactive and DIY profiles", () => {
  const active = fromHardware([mesh], ref, date)[0];
  assert.equal(active.id, "heltec/mesh-node-t114");
  assert.equal(active.status, "open-firmware");
  assert.equal(active.install?.[0].method, "usb-bootloader");
  const inactive = fromHardware([{ ...mesh, activelySupported: false }], ref, date)[0];
  assert.equal(inactive.status, "unknown");
  assert.equal(inactive.install, undefined);
  assert.equal(meshName({ ...mesh, displayName: "DIY V1", tags: ["DIY"] }), null);
  assert.equal(finalize([active, inactive]).invalid, 0);
});

test("Meshtastic preserves product revisions and manufacturers absent from display names", () => {
  assert.deepEqual(meshName({ ...mesh, displayName: "ThinkNode M1", tags: ["Elecrow"] }), { vendor: "Elecrow", model: "ThinkNode M1" });
  assert.deepEqual(meshName({ ...mesh, displayName: "RAK3312", tags: ["RAK"] }), { vendor: "RAKwireless", model: "RAK3312" });
  const f = finalize(fromHardware([mesh, { ...mesh, displayName: "Heltec Mesh Node T114 V2" }], ref, date));
  assert.equal(f.records.length, 2);
  assert.deepEqual(meshName({ ...mesh, displayName: "unPhone", tags: [] }), { vendor: "Generic", model: "unPhone" });
  assert.equal(meshName({ ...mesh, displayName: "Hydra", tags: ["DIY"] }), null);
});

test("Meshtastic MeshPocket battery variants retain their exact firmware and pogo-cable prerequisite", () => {
  const records = fromHardware([5000, 10000].map((capacity) => ({ ...mesh, displayName: "Heltec MeshPocket", platformioTarget: `heltec-mesh-pocket-${capacity}` })), ref, date);
  assert.equal(finalize(records).records.length, 2);
  assert.match(records[0].model, /5000/);
  assert.match(records[0].install![0].firmware_constraints!, /pogo-pin/);
  assert.match(records[1].install![0].firmware_constraints!, /10000/);
});

test("Armbian reads literals without evaluating shell expressions or function overrides", () => {
  const d = parseBoard(`BOARD_NAME="Orange Pi 5"\nBOARD_VENDOR="xunlong"\nKERNEL_TARGET="current,edge,vendor"\nEVIL="$(touch /tmp/should-not-exist)"\nDYNAMIC="${'${VALUE}'}"\nfunction override() {\nBOARD_NAME="Wrong"\n}\n`);
  assert.equal(d.BOARD_NAME, "Orange Pi 5");
  assert.equal(d.EVIL, undefined);
  assert.equal(d.DYNAMIC, undefined);
  const record = armbianBoard("orangepi5.conf", d, ref, date)!;
  assert.equal(record.id, "orange-pi/5");
  assert.equal(record.status, "open-firmware");
  assert.match(record.projects![0].freedom!.notes!, /vendor binaries/);
  assert.equal(finalize([record]).invalid, 0);
});

test("Armbian preserves community, abandoned and WIP qualifications without invented image routes", () => {
  const d = { BOARD_NAME: "Rock 5B", BOARD_VENDOR: "radxa" };
  assert.equal(armbianBoard("rock-5b.csc", d, ref, date)!.status, "partial-protocol");
  assert.equal(armbianBoard("rock-5b.eos", d, ref, date)!.install, undefined);
  assert.equal(armbianBoard("rock-5b.wip", d, ref, date)!.install, undefined);
  assert.equal(armbianBoard("uefi.conf", { BOARD_NAME: "Generic UEFI", BOARD_VENDOR: "generic" }, ref), null);
  assert.equal(armbianBoard("unknown.conf", { BOARD_NAME: "Unknown board" }, ref), null);
  const handheld = parseBoard('declare -g BOARD_NAME="Ayn Odin2"\ndeclare -g BOARD_VENDOR="ayntec"\nif condition; then\nBOARD_NAME="wrong"\nfi');
  assert.equal(armbianBoard("ayn-odin2.csc", handheld, ref)!.category, "game-console");
  assert.equal(armbianBoard("ayn-odin2.csc", handheld, ref)!.vendor, "AYN");
  assert.equal(armbianBoard("ayn-odin2.csc", handheld, ref)!.id, "ayn/odin-2");
  assert.equal(armbianBoard("rpi4b.conf", { BOARD_NAME: "Raspberry Pi", BOARD_VENDOR: "rpi-foundation" }, ref), null);
});

const header = `// SPDX-License-Identifier: MIT\n#define MICROPY_HW_BOARD_NAME "Raspberry Pi Pico W"\n#define MICROPY_HW_MCU_NAME "rp2040"\n`;
const make = `USB_VID = 0x239A\nUSB_PID = 0x8120\nUSB_PRODUCT = "Pico W"\nUSB_MANUFACTURER = "Raspberry Pi"\nCHIP_VARIANT = RP2040\n`;
test("CircuitPython firmware board identity and firmware-specific USB IDs validate", () => {
  const record = circuitBoard({ path: "ports/raspberrypi/boards/raspberry_pi_pico_w", header, make }, ref, date)!;
  assert.equal(record.id, "raspberry-pi/pico-w");
  assert.deepEqual(record.identifiers?.usb, ["239a:8120"]);
  assert.match(record.summary!, /do not uniquely prove a physical board/);
  assert.equal(record.projects![0].license, "MIT");
  assert.equal(finalize([record]).invalid, 0);
});

test("CircuitPython does not evaluate dynamic USB identifiers or infer wireless feature support", () => {
  const d = boardValues(header, make + "USB_PID = $(BOARD_PID)\nUSB_VID = 0x1234 + 1\n");
  assert.equal(d.USB_PID, undefined);
  const r = circuitBoard({ path: "ports/espressif/boards/test", header: '#define MICROPY_HW_BOARD_NAME "Adafruit Test"\n#define MICROPY_HW_MCU_NAME "ESP32S3"', make: 'USB_MANUFACTURER = "Adafruit"' }, ref, date)!;
  assert.deepEqual(r.projects![0].freedom!.nonfree, ["wifi", "bluetooth"]);
  assert.equal(r.identifiers?.usb?.length, 0);
  assert.equal(circuitBoard({ path: "x", header: '#define MICROPY_HW_BOARD_NAME "Generic board"', make }, ref), null);
});

test("CircuitPython preserves physical Wi-Fi/LTE and memory variants instead of phone-name normalisation", () => {
  const board = (name: string, id: string) => circuitBoard({ path: `ports/raspberrypi/boards/${id}`, header: `#define MICROPY_HW_BOARD_NAME "${name}"`, make: 'USB_MANUFACTURER = "Invector Labs"' }, ref, date)!;
  const records = [board("Challenger RP2040 WiFi", "challenger_rp2040_wifi"), board("Challenger RP2040 LTE", "challenger_rp2040_lte"), board("YD-ESP32-S3 (N16R8)", "yd_n16r8"), board("YD-ESP32-S3 (N8R8)", "yd_n8r8")];
  assert.equal(finalize(records).records.length, 4);
});

test("CircuitPython reads board-path makers and retains the 4 MB ESP32 UF2 prerequisite", () => {
  const r = circuitBoard({ path: "ports/espressif/boards/espressif_esp32c3_devkitm_1_n4", header: '#define MICROPY_HW_BOARD_NAME "ESP32-C3-DevKitM-1"', make: 'IDF_TARGET = esp32c3' }, ref)!;
  assert.equal(r.vendor, "Espressif");
  const s2 = circuitBoard({ path: "ports/espressif/boards/test", header: '#define MICROPY_HW_BOARD_NAME "Adafruit Test"\n#define MICROPY_HW_MCU_NAME "ESP32-S2"', make: 'USB_MANUFACTURER = "Adafruit"\nCIRCUITPY_ESP_FLASH_SIZE = 4MB' }, ref)!;
  assert.match(s2.install![0].firmware_constraints!, /TinyUF2 0\.33\.0/);
  assert.equal(circuitBoard({ path: "ports/renode/boards/renode_cortex_m0plus", header: '#define MICROPY_HW_BOARD_NAME "Renode Cortex-M0+"', make }, ref), null);
  const same = circuitBoard({ path: "ports/espressif/boards/01space_lcd042_esp32c3", header: '#define MICROPY_HW_BOARD_NAME "01Space 0.42 OLED ESP32C3"', make: '' }, ref)!;
  assert.equal(same.id, "01space/esp32-c3-0-42lcd");
});

const html = (attrs: string) => `<li class="device-name" data-name="Google Pixel 3a" data-codename="sargo" data-release="noble" data-deviceType="phone" data-portType="Halium" data-progressStage="5" ${attrs}><a href="/device/sargo">Google Pixel 3a</a></li><footer>License CC-BY-SA-4.0</footer>`;
test("UBports distinguishes missing/empty support flags and outdated releases", () => {
  const d = parseDevices(html('data-supported="1" data-installerAvailable="1"'))[0];
  const r = ubuntuDevice(d, undefined, date)[0];
  assert.equal(r.id, "google/pixel-3a");
  assert.equal(r.status, "open-firmware");
  assert.deepEqual(r.projects![0].freedom!.nonfree, ["vendor-blobs"]);
  assert.equal(ubuntuDevice(parseDevices(html("data-supported"))[0])[0].install, undefined);
  assert.equal(ubuntuDevice({ ...d, release: "xenial" })[0].status, "partial-protocol");
  assert.equal(ubuntuDevice({ ...d, stage: 0 })[0].install, undefined);
  assert.equal(finalize([r]).invalid, 0);
  assert.throws(() => parseDevices(html("").replace("CC-BY-SA-4.0", "other")), /licence/);
});

test("UBports retains exact Android prerequisites without mixing other OS prompts", () => {
  const c = { unlock: ["downgrade", "support"], user_actions: { downgrade: { description: "Requires stock Android 9 build PQ3B.190801.002." }, support: { description: "Check the device forum." }, cutie_notice: { description: "Unrelated OS prompt." } } };
  assert.deepEqual(prerequisites(c), ["Requires stock Android 9 build PQ3B.190801.002.", "Check the device forum."]);
  const d = parseDevices(html('data-supported="1" data-installerAvailable="1"'))[0];
  const r = ubuntuDevice(d, { file: "v2/devices/sargo.yml", ref, data: c }, date)[0];
  assert.match(r.install![0].firmware_constraints!, /PQ3B/);
  assert.doesNotMatch(r.install![0].firmware_constraints!, /Unrelated/);
});

test("mobile names expand explicit grouped products, retain individual variants and reject unknown makers", () => {
  assert.deepEqual(mobileNames("Google Pixel 3a/3a XL (sargo)", "sargo"), [{ vendor: "Google", model: "Pixel 3a" }, { vendor: "Google", model: "Pixel 3a XL" }]);
  assert.equal(mobileNames("Xiaomi Poco M2 Pro / Redmi Note 9 Pro / Pro Max / 9S (miatoll)", "miatoll").length, 4);
  assert.deepEqual(mobileNames("Xiaomi Poco X3 NFC (surya)", "surya"), [{ vendor: "Xiaomi", model: "Poco X3 NFC" }]);
  assert.deepEqual(mobileNames("F(x)tec Pro1-X (qx1050)", "pro1x"), [{ vendor: "F(x)tec", model: "Pro1 X" }]);
  assert.deepEqual(mobileNames("F(x)tec Pro1 (pro1x)", "pro1x"), [{ vendor: "F(x)tec", model: "Pro1 X" }]);
  assert.deepEqual(mobileNames("Fairphone 3 and 3+", "FP3").map((x) => x.model), ["3", "3+"]);
  assert.deepEqual(mobileNames("Desktop PC", "x86"), []);
  assert.throws(() => mobileNames("Unreviewed phone", "new"), /unreviewed/);
});

test("Droidian reads only registered JSON files and does not copy prose/contact details", () => {
  assert.deepEqual(deviceFiles("import a from './sargo.json';\nimport b from './template.json';\nimport c from './sargo.json';"), ["src/devices/sargo.json"]);
  const d = { name: "Google Pixel 3a/3a XL (sargo)", code: "sargo", category: "official", features: { Cellular: { working: ["Calls"], notWorking: ["MMS"] } }, Notes: { "Before you proceed": [{ data: "COPYRIGHTED PROSE" }], Credits: [{ data: "PRIVATE CONTACT" }] } };
  const records = droidianDevice(d, "src/devices/sargo.json", ref, date);
  assert.equal(records.length, 2);
  assert.match(records[0].projects![0].freedom!.notes!, /MMS/);
  assert.doesNotMatch(JSON.stringify(records), /COPYRIGHTED|PRIVATE CONTACT/);
  assert.equal(records[0].projects![0].license, undefined);
  assert.equal(finalize(records).invalid, 0);
});

test("Droidian potential ports get no working-OS claim or installation route", () => {
  const record = droidianDevice({ name: "Google Pixel 3a", code: "sargo", category: "potential" }, "src/devices/sargo.json", ref, date)[0];
  assert.notEqual(record.status, "open-firmware");
  assert.equal(record.install, undefined);
  assert.match(record.summary!, /does not establish a working port/);
  assert.match(featureStates({ Misc: { partly: ["Encryption"] } }), /Encryption/);
  assert.throws(() => droidianDevice({ name: "Google Pixel 3a", code: "sargo", category: "new-status" }, "x", ref), /unknown category/);
});
