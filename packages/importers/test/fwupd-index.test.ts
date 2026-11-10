import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFwupdSampleIndex, findFwupdDeclarations, fwupdPropertyValues, parseFwupdQuirks,
} from "../src/fwupd-index.ts";

const REV = "17b23256a336478d6b5d71b714e7b4be7570a50f";
// Small source-derived regression cases; full sources and README restrictions are
// linked in docs/fwupd-index.md. Values are not firmware availability assertions.
const LOGITECH = String.raw`# Unifying Receiver
[HIDRAW\VEN_046D&DEV_C52B]
GType = FuLogitechHidppRuntimeUnifying

[USB\VID_046D&PID_AAAA]
GType = FuLogitechHidppBootloaderNordic
CounterpartGuid = HIDRAW\VEN_046D&DEV_C52B
`;
const STEELSERIES = String.raw`# Rival 100: name is only a comment
[USB\VID_1038&PID_1702]
GType = FuSteelseriesMouse

[USB\VID_1038&PID_1838]
Name = Aerox 3 Wireless USB Receiver
CounterpartGuid = USB\VID_1038&PID_1839
Flags = is-receiver

[USB\VID_1038&PID_1839]
Flags = is-bootloader,is-receiver,~usable-during-update

[USB\VID_1038&PID_183A]
Name = Aerox 3 Wireless Mouse
CounterpartGuid = USB\VID_1038&PID_183B,HIDRAW\VEN_0111&DEV_183A

[HIDRAW\VEN_0111&DEV_183A]
Name = Aerox 3 Wireless Mouse via Bluetooth

[STEELSERIES\VID_1038&PID_1838&PROTOCOL_FIZZ_TUNNEL]
Name = Aerox 3 Wireless Mouse via USB Receiver
`;
const UF2 = String.raw`# Shared RP2 bootloader
[USB\VID_2E8A&PID_0003]
Guid = UF2\FAMILY_E48BFF56
Flags = updatable

[UF2\FAMILY_E48BFF56]
Name = RP2040
Vendor = Raspberry Pi
`;
const texts: Record<string, string> = { "logitech-hidpp": LOGITECH, steelseries: STEELSERIES, uf2: UF2 };
const sample = () => buildFwupdSampleIndex(REV, async (_repo, _revision, path) => texts[path.split("/")[1]]);

test("fwupd links HIDRAW runtime and USB bootloader without merging or converting identities", async () => {
  const index = await sample();
  const runtime = findFwupdDeclarations(index, String.raw`HIDRAW\VEN_046D&DEV_C52B`);
  const boot = findFwupdDeclarations(index, String.raw`USB\VID_046D&PID_AAAA`);
  assert.equal(runtime.length, 1);
  assert.equal(boot.length, 1);
  assert.equal(runtime[0].namespace, "HIDRAW");
  assert.equal(boot[0].namespace, "USB");
  assert.deepEqual(fwupdPropertyValues(boot[0], "CounterpartGuid"), [runtime[0].instance_id]);
  assert.deepEqual(findFwupdDeclarations(index, String.raw`USB\VID_046D&PID_C52B`), []);
  assert.deepEqual(findFwupdDeclarations(index, "046d:c52b"), []);
  assert.deepEqual(findFwupdDeclarations(index, String.raw`HIDRAW\VEN_046D`), []);
});

test("fwupd keeps receiver, peripheral, Bluetooth and tunnel declarations separate", async () => {
  const index = await sample();
  const receiver = findFwupdDeclarations(index, String.raw`USB\VID_1038&PID_1838`)[0];
  const mouse = findFwupdDeclarations(index, String.raw`USB\VID_1038&PID_183A`)[0];
  assert.deepEqual(fwupdPropertyValues(receiver, "Name"), ["Aerox 3 Wireless USB Receiver"]);
  assert.deepEqual(fwupdPropertyValues(receiver, "Flags"), ["is-receiver"]);
  assert.deepEqual(fwupdPropertyValues(mouse, "CounterpartGuid"), [String.raw`USB\VID_1038&PID_183B,HIDRAW\VEN_0111&DEV_183A`]);
  assert.equal(findFwupdDeclarations(index, String.raw`HIDRAW\VEN_0111&DEV_183A`)[0].namespace, "HIDRAW");
  assert.equal(findFwupdDeclarations(index, String.raw`STEELSERIES\VID_1038&PID_1838&PROTOCOL_FIZZ_TUNNEL`)[0].namespace, "STEELSERIES");
  assert.deepEqual(fwupdPropertyValues(findFwupdDeclarations(index, String.raw`USB\VID_1038&PID_1839`)[0], "Flags"), ["is-bootloader,is-receiver,~usable-during-update"]);
});

test("fwupd Rival 100 stays a source declaration with a README, without inferred name or support status", async () => {
  const r = findFwupdDeclarations(await sample(), String.raw`USB\VID_1038&PID_1702`)[0];
  assert.deepEqual(fwupdPropertyValues(r, "Name"), []);
  assert.deepEqual(fwupdPropertyValues(r, "Flags"), []);
  assert.equal("status" in r, false);
  assert.equal("install" in r, false);
  assert.equal(r.documentation_url, `https://github.com/fwupd/fwupd/blob/${REV}/plugins/steelseries/README.md`);
});

test("fwupd shared UF2 bootloader and family are not expanded into retail products", async () => {
  const index = await sample();
  const boot = findFwupdDeclarations(index, String.raw`USB\VID_2E8A&PID_0003`)[0];
  const family = findFwupdDeclarations(index, String.raw`UF2\FAMILY_E48BFF56`)[0];
  assert.deepEqual(fwupdPropertyValues(boot, "Guid"), [family.instance_id]);
  assert.equal(family.namespace, "UF2");
  assert.deepEqual(fwupdPropertyValues(family, "Name"), ["RP2040"]);
  assert.equal("model" in family, false);
  assert.equal("identifiers" in boot, false);
  assert.equal(index.kind, "fwupd-quirk-declarations");
});

test("fwupd preserves duplicate sections/keys, equals signs and empty values with exact source lines", () => {
  const rows = parseFwupdQuirks("\uFEFF# header\r\n[USB\\VID_1234&PID_5678]\r\nName = A=B # literal\r\nName = \r\n; comment\r\n[USB\\VID_1234&PID_5678]\r\nFlags = ~updatable\r\n", "plugins/uf2/uf2.quirk", REV);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].properties, [{ key: "Name", value: "A=B # literal", line: 3 }, { key: "Name", value: "", line: 4 }]);
  assert.equal(rows[0].source_url, `https://github.com/fwupd/fwupd/blob/${REV}/plugins/uf2/uf2.quirk#L2`);
  assert.equal(rows[1].line, 6);
});

test("fwupd rejects unsupported syntax and unpinned or unexpected sources", () => {
  for (const text of ["Name = orphan", "[USB\\VID_1234]\nnot-an-assignment", "[unclosed\nName=x"]) {
    assert.throws(() => parseFwupdQuirks(text, "plugins/uf2/uf2.quirk", REV), /Unsupported/);
  }
  assert.throws(() => parseFwupdQuirks(UF2, "plugins/uf2/uf2.quirk", "main"), /full lowercase commit SHA/);
  assert.throws(() => parseFwupdQuirks(UF2, "../uf2.quirk", REV), /Unexpected/);
});

test("fwupd sample reads all three plugins at one immutable revision and fails incomplete builds", async () => {
  const reads: string[][] = [];
  const index = await buildFwupdSampleIndex(REV, async (repo, revision, path) => {
    reads.push([repo, revision, path]);
    return texts[path.split("/")[1]];
  });
  assert.deepEqual(reads, index.scope.map((p) => ["fwupd/fwupd", REV, `plugins/${p}/${p}.quirk`]));
  assert.equal(index.declarations.length, 10);
  await assert.rejects(buildFwupdSampleIndex(REV, async () => { throw new Error("source unavailable"); }), /source unavailable/);
});
