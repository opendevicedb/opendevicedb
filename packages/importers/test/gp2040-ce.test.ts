import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "@opendevicedb/core";
import { parseBoards, fromBoards, type Board } from "../src/sources/gp2040-ce.ts";
const board = (name: string, config: string, category = "open"): Board => ({ name, config, website: "https://example.org/board", category });

test("GP2040-CE reads only metadata and excludes generic MCU boards and unsupported entries", () => {
  const boards = parseBoards(`const boards = { items: [
    { name: 'Raspberry Pi Pico', configName: 'Pico', website: 'https://example.org/pico', supported: true, desc: () => <p>Generic board</p> },
    { name: 'Flatbox Rev 4', configName: 'FlatboxRev4', website: 'https://example.org/flatbox', category: 'open', desc: () => <p>{dangerousCode()}</p> },
    { name: 'Future', configName: 'Future', website: 'https://example.org/future', category: 'open', supported: false, desc: () => <p>Not ready</p> },
  ] };`);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].name, "Flatbox Rev 4");
});

test("GP2040-CE keeps hardware revisions separate and requires the matching build configuration", () => {
  const boards = [board("Flatbox Rev 4", "FlatboxRev4"), board("Flatbox Rev 5", "FlatboxRev5"), board("Stress", "Stress")];
  const rs = fromBoards(boards, new Set(["FlatboxRev4", "FlatboxRev5"]));
  assert.deepEqual(rs.map((r) => r.id), ["flatbox/rev-4", "flatbox/rev-5"]);
  assert.match(rs[0].install![0].firmware_constraints!, /FlatboxRev4/);
  for (const r of rs) { assert.deepEqual(validate(r), []); assert.equal(r.verification, undefined); }
});

test("GP2040-CE excludes multi-product families, retaining closed hardware with open firmware honestly", () => {
  const rs = fromBoards([
    board("Haute42 Series", "Haute42COSMOX", "closed"), board("SGF Devices", "SGFDevices", "closed"),
    board("ScrubTier BentoBox", "BentoBox", "closed"), board("Unknown board", "Unknown"),
    board("HautePad M Lite", "Haute42COSMOXMLite", "closed"), board("ARC Accessibility Controller", "ARCController", "official"),
  ], new Set(["Haute42COSMOX", "SGFDevices", "BentoBox", "Unknown", "Haute42COSMOXMLite", "ARCController"]));
  assert.equal(rs.length, 2);
  assert.match(rs[0].summary!, /hardware design as closed/);
  assert.equal(rs[0].projects![0].license, "MIT");
  assert.equal(rs[0].projects![1].license, undefined);
  assert.equal(rs[0].projects![0].freedom, undefined);
  assert.equal(rs[1].vendor, "OpenStickCommunity");
});
