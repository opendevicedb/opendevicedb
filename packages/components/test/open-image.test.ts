// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { loadRegistry, repositoryFile, COMPONENT_REPO_ROOT, inspectComponent } from "../src/index.ts";
import { createProbeDecoder } from "../src/probe/decoder.ts";

const component = loadRegistry().components.find(c => c.id === "ultrasound/convex-open-image")!;
const bytes = readFileSync(repositoryFile(COMPONENT_REPO_ROOT, component.artifact!.path));

test("original image artifact has bounded memory and no file, USB or network imports", () => {
  const inspected = inspectComponent(component);
  assert.equal(inspected.executed, false);
  assert.equal(inspected.wasm!.maximum_memory_bytes, 268435456);
  assert.deepEqual(component.permissions, []);
  assert.ok(inspected.wasm!.imports.every(i => i.module === "wasi_snapshot_preview1" &&
    ["environ_get", "environ_sizes_get", "fd_write", "proc_exit"].includes(i.name)));
});

test("resource-free image runtime rejects acquisition and preserves exact RGBA snapshots", async () => {
  await assert.rejects(() => createProbeDecoder(bytes), /reconstruction only/);
  await assert.rejects(() => createProbeDecoder(bytes, undefined, { purpose: "acquisition" }), /reconstruction only/);
  const decoder = await createProbeDecoder(bytes, undefined, { purpose: "reconstruction", continuous: true });
  assert.equal(decoder.initialized.external_resource_files, 0);
  assert.equal(decoder.initialized.transmit_commands, 0);
  assert.equal(decoder.initialized.calibrated, false);
  assert.throws(() => decoder.bind(new Uint8Array(512)), /cannot produce/);
  assert.deepEqual(decoder.advance(new Uint8Array()), []);
  assert.deepEqual(decoder.finishRgba(), []);
  const rgba = Uint8Array.from({ length: 512 * 512 * 4 }, (_, i) => i % 4 === 3 ? 255 : (i >>> 2) % 256);
  const png = Buffer.from(decoder.encodePng(rgba));
  const idat = [];
  for (let offset = 8; offset < png.length;) {
    const n = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + n));
    offset += n + 12;
  }
  const raster = inflateSync(Buffer.concat(idat));
  for (let y = 0; y < 512; y++) {
    assert.equal(raster[y * 2049], 0);
    assert.deepEqual(raster.subarray(y * 2049 + 1, (y + 1) * 2049), Buffer.from(rgba.subarray(y * 2048, (y + 1) * 2048)));
  }
  assert.throws(() => decoder.encodePng(new Uint8Array(8)), /RGBA/);
});
