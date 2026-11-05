// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { recordedProbeBytes } from "../../../components/ultrasound/recorded-data/1.0.0/source.ts";
import { ProbeReplaySession } from "../src/probe-replay.ts";
import { loadRegistry } from "../src/index.ts";
const signal = () => new AbortController().signal;
const collect = async (file: File) => { const chunks = []; for await (const b of recordedProbeBytes(file, signal())) chunks.push(b); return Buffer.concat(chunks); };
const row = (ordinal: number, bytes: number[]) => ({ ordinal, kind: "data", bytes: bytes.length, base64: Buffer.from(bytes).toString("base64") });
function stream(rows: any[], changes = {}) {
  const header = { format: "odb-probe-stream/1", snapshot_last_ordinal: rows.length, stored_bytes: rows.reduce((n, r) => n + (r.kind === "data" ? r.bytes : 0), 0), omitted_bytes: 0, storage_error: null, ...changes };
  return new File([[header, ...rows].map(r => JSON.stringify(r)).join("\n") + "\n"], "test.odb-stream");
}
test("recording imports preserve DATA order and ignore command-shaped journal entries", async () => {
  const rows = [{ ordinal: 1, kind: "journal", value: { command: "Start", endpoint: 2 } }, row(2, [1, 2]), { ordinal: 3, kind: "display", value: { sequence: 7 } }, row(4, [3])];
  assert.deepEqual(await collect(stream(rows)), Buffer.from([1, 2, 3]));
  const legacy = { format: "odb-probe-capture/1", received_bytes: 3, data_reads: [row(1, [1, 2]), row(2, [3])] };
  assert.deepEqual(await collect(new File([JSON.stringify(legacy)], "test.odb-capture")), Buffer.from([1, 2, 3]));
  assert.deepEqual(await collect(new File([Buffer.from([1, 2, 3])], "test.bin")), Buffer.from([1, 2, 3]));
});
test("stream reader bounds memory, handles UTF8 across chunks and stops on cancellation", async () => {
  class StreamingOnly extends File { text(): Promise<string> { throw Error("Whole file read"); } arrayBuffer(): Promise<ArrayBuffer> { throw Error("Whole file read"); } }
  const file = new StreamingOnly([new Uint8Array(200000)], "test.bin"), controller = new AbortController();
  const reader = recordedProbeBytes(file, controller.signal);
  assert.equal((await reader.next()).value!.length, 65536); controller.abort();
  await assert.rejects(() => reader.next(), /abort/i);
  const journal = { ordinal: 1, kind: "journal", value: "é".repeat(50000) };
  assert.deepEqual(await collect(stream([journal, row(2, [11])])), Buffer.from([11]));
  const serialized = await stream([row(1, [42])]).text();
  assert.deepEqual(await collect(new StreamingOnly([serialized], "test.odb-stream")), Buffer.from([42]));
});
test("archives reject omissions, truncation, duplicate ordinals, malformed encodings and excessive lines", async () => {
  for (const f of [
    stream([row(1, [1])], { omitted_bytes: 1 }), stream([row(1, [1])], { storage_error: "disk full" }),
    stream([row(1, [1])], { stored_bytes: 2 }), stream([row(1, [1])], { snapshot_last_ordinal: 2 }),
    stream([row(2, [1])]), stream([row(1, [1]), row(1, [2])]),
    stream([{ ...row(1, [1]), base64: "AB==" }]), stream([{ ...row(1, [1]), bytes: 2 }]),
    stream([{ ordinal: 1, kind: "execute", value: "Start" }]),
    stream([{ ordinal: 1, kind: "journal", value: "x".repeat(262145) }]),
    new File(["{bad json"], "test.odb-stream"), new File([new Uint8Array([255])], "test.odb-stream"),
    new File(["{}"], "test.json"), new File([JSON.stringify({ format: "odb-probe-capture/1", received_bytes: 2, data_reads: [row(1, [1])] })], "test.odb-capture"),
  ]) await assert.rejects(() => collect(f));
  assert.deepEqual(await collect(stream([])), Buffer.alloc(0));
});
const registry = loadRegistry(), composition = registry.compositions.find(c => c.id === "ultrasound/convex-replay")!;
const png = () => Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64")).buffer;
test("replay backpressure delivers all frames as uncalibrated recordings and retains the final display", async () => {
  const events: string[] = [], frames: any[] = []; let closed = 0, uiClosed = 0, sequence = 0, inflight = false;
  const session = new ProbeReplaySession(composition, registry, {
    recording: stream([row(1, [1]), row(2, [2])]),
    prepareDecoder: async () => ({ push: async () => { assert.equal(inflight, false); return [{ sequence: ++sequence, data: png() }]; }, finish: async () => [], close: () => { closed++; } }),
    prepareInterface: async () => ({ update: async f => { inflight = true; await new Promise(r => setImmediate(r)); frames.push(f); inflight = false; }, close: () => { uiClosed++; } }),
    onState: s => { events.push(s); },
  });
  await session.start(); await session.done;
  assert.deepEqual(frames.map(f => [f.sequence, f.mode, f.calibrated, f.profile]), [[1, "replay", false, "unknown"], [2, "replay", false, "unknown"]]);
  assert.deepEqual(events, ["running", "complete"]); assert.equal(closed, 1); assert.equal(uiClosed, 0);
  session.stop(); session.stop(); assert.equal(uiClosed, 1); assert.equal(closed, 1);
  await assert.rejects(() => session.start(), /new replay session/);
});
test("stopping during decoder preparation releases late resources and never reads a recording", async () => {
  let resolve!: (d: any) => void, closed = 0, uiClosed = 0, pushes = 0;
  const session = new ProbeReplaySession(composition, registry, {
    recording: new File([new Uint8Array([1])], "test.bin"),
    prepareInterface: async () => ({ update: async () => {}, close: () => { uiClosed++; } }),
    prepareDecoder: () => new Promise(r => { resolve = r; }),
  });
  const start = session.start(); await new Promise(r => setImmediate(r)); session.stop();
  resolve({ push: async () => { pushes++; return []; }, finish: async () => [], close: () => { closed++; } });
  await assert.rejects(start, /abort/i); assert.equal(closed, 1); assert.equal(uiClosed, 1); assert.equal(pushes, 0);
});
test("corrupt archives cannot finish successfully or flush a truncated prefix into new frames", async () => {
  let finished = 0, state = "", closed = 0;
  const session = new ProbeReplaySession(composition, registry, {
    recording: stream([row(1, [1])], { snapshot_last_ordinal: 2 }),
    prepareInterface: async () => ({ update: async () => {}, close: () => {} }),
    prepareDecoder: async () => ({ push: async () => [], finish: async () => { finished++; return []; }, close: () => { closed++; } }),
    onState: s => { state = s; },
  });
  await session.start(); await session.done; assert.equal(state, "error"); assert.equal(finished, 0); assert.equal(closed, 1);
});
