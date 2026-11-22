// Verify packet order and exercise the shipped decoder across fragmented USB reads.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL(name, import.meta.url));
const rows = read('profile/command-rows.bin');
const order = read('profile/command-index.bin');
const packets = Array.from(order, index => rows.subarray(index * 512, (index + 1) * 512));
assert.equal(packets.length, 39);
assert.equal(createHash('sha256').update(Buffer.concat(packets)).digest('hex'),
  'dae91ab18824860f95f219531204f39c88ac96cc42c1aead526c28d3ff29fedc');

const module = await WebAssembly.compile(process.argv[2] ? readFileSync(process.argv[2]) : read('probe.wasm'));
assert.deepEqual(WebAssembly.Module.imports(module), []);
const {exports: decoder} = await WebAssembly.instantiate(module);
assert.equal(decoder.reset(), 0);
const bytes = Buffer.alloc(3840 * 80 + 8);
for (let line = 0; line <= 80; line++) {
  bytes.writeUInt32LE(0x7fff0000, line * 3840);
  bytes[line * 3840 + 5] = 1 + line % 80;
}
let frames = 0;
for (let offset = 0; offset < bytes.length; offset += 16383) {
  const chunk = bytes.subarray(offset, offset + 16383);
  new Uint8Array(decoder.memory.buffer, decoder.input(), chunk.length).set(chunk);
  const result = decoder.push(chunk.length);
  assert.ok(result >= 0);
  if (result) {
    assert.equal(decoder.size(), 512 * 512 * 4);
    frames++;
  }
}
assert.equal(frames, 1);
