import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import type { Server } from "node:http";
import { createPreviewBridge } from "../../../scripts/ultrasound-bridge.ts";
import { UltrasoundPreviewSource, previewOrigin, pngDimensions, boundedResponse } from "../../../components/ultrasound/preview-source/1.0.0/source.ts";
import { loadRegistry, compatibleApplications } from "../src/index.ts";
import { VideoSession } from "../src/video.ts";

// Synthetic PNG header only: protocol validation is separate from browser image decoding.
const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(13,8); png.write("IHDR",12); png.writeUInt32BE(4,16); png.writeUInt32BE(3,20);
const raw = { session: 3, frame: 7, replay_only: true, phase: "finished", config: { private: "/private/no-publication" }, serial: "PRIVATE" };
const listen = async (server: Server) => { await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); return `http://127.0.0.1:${(server.address() as any).port}`; };
const close = async (server: Server) => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); };

test("bridge requires its exact origin, projects metadata and forwards no control operations", async () => {
  const paths: string[] = [];
  const upstream = createServer((req,res) => { paths.push(`${req.method} ${req.url}`); res.setHeader("Content-Type", req.url === "/api/status" ? "application/json" : "image/png"); res.end(req.url === "/api/status" ? JSON.stringify(raw) : png); });
  const upstreamUrl = await listen(upstream), origin = "http://127.0.0.1:4335";
  const bridge = createPreviewBridge({ upstream: upstreamUrl, allowedOrigin: origin }); const url = await listen(bridge);
  const headers = { Origin: origin };
  try {
    for (const forbidden of [undefined, "null", "https://other.invalid"]) {
      assert.equal((await fetch(`${url}/status`, { headers: forbidden ? { Origin: forbidden } : {} })).status, 403);
    }
    assert.equal(await new Promise<number>(resolve => { const req = request(`${url}/status`, { headers: { ...headers, Host: "attacker.invalid" } }, res => { res.resume(); resolve(res.statusCode!); }); req.end(); }), 403);
    for (const route of ["/api/start", "/start", "/settings", "/image/3/7?other=1", "/image/3/0"]) assert.equal((await fetch(`${url}${route}`, { headers })).status, 404);
    assert.equal((await fetch(`${url}/status`, { method: "POST", headers })).status, 405);
    const response = await fetch(`${url}/status`, { headers });
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    const status = await response.json();
    assert.deepEqual(status, { format: "odb.ultrasound-preview/1", profile: "unknown", phase: "finished", session: 3, frame: 7, replay: true });
    assert.equal(JSON.stringify(status).includes("PRIVATE"), false);
    const source = new UltrasoundPreviewSource(url, "convex-01", (input, init) => fetch(input, { ...init, headers }));
    const first = await source.poll(new AbortController().signal);
    assert.equal(first.frame?.mode, "replay"); assert.equal(first.frame?.profile, "unknown"); assert.equal(first.frame?.width, 4);
    assert.equal((await source.poll(new AbortController().signal)).frame, undefined);
    assert.equal(paths.filter(p => p.includes("/image/")).length, 1);
    assert.ok(paths.every(p => p === "GET /api/status" || p === "GET /api/image/3/7"));
  } finally { await close(bridge); await close(upstream); }
});

test("source rejects mismatched live profiles, oversized images and remote origins", async () => {
  for (const url of ["https://127.0.0.1:80", "http://example.com", "http://localhost:10", "http://127.0.0.1/x", "http://user@127.0.0.1:9"]) assert.throws(() => previewOrigin(url));
  const status = { format: "odb.ultrasound-preview/1", profile: "unknown", phase: "acquiring", session: 1, frame: 1, replay: false };
  const source = new UltrasoundPreviewSource("http://127.0.0.1:4337", "convex-01", async () => Response.json(status));
  await assert.rejects(source.poll(new AbortController().signal), /expects convex-01/);
  const dimensions = Buffer.from(png); dimensions.writeUInt32BE(100000,16); assert.throws(() => pngDimensions(dimensions.buffer.slice(dimensions.byteOffset, dimensions.byteOffset + dimensions.length)), /dimensions/);
  await assert.rejects(boundedResponse(new Response(new Uint8Array(100)), 10), /size limit/);
  const knownWrong = { ...status, replay: true, profile: "linear-01" };
  const wrong = new UltrasoundPreviewSource("http://127.0.0.1:4337", "convex-01", async () => Response.json(knownWrong));
  await assert.rejects(wrong.poll(new AbortController().signal), /expects convex-01/);
});

test("empty previews do not request images and completed acquisitions are labelled snapshots", async () => {
  let count = 0, frame: number | null = null;
  const source = new UltrasoundPreviewSource("http://127.0.0.1:4337", "convex-01", async input => {
    count++; return String(input).endsWith("/status") ? Response.json({ format: "odb.ultrasound-preview/1", profile: "convex-01", phase: "finished", session: 1, frame, replay: false }) : new Response(png);
  });
  assert.equal((await source.poll(new AbortController().signal)).frame, undefined); assert.equal(count,1);
  frame = 1; assert.equal((await source.poll(new AbortController().signal)).frame?.mode, "snapshot");
});

test("video discovery is device-specific and late prepared consumers are released after stop", async () => {
  const registry = loadRegistry(), composition = registry.compositions.find(c => c.id === "ultrasound/convex-preview")!;
  assert.equal(compatibleApplications(registry, { usb: true }).some(c => c.id === composition.id), false);
  assert.ok(compatibleApplications(registry, { deviceId: composition.devices![0], usb: true }).some(c => c.id === composition.id));
  let finish!: (value: any) => void, closes = 0;
  const session = new VideoSession(composition, registry, { bridgeUrl: "http://127.0.0.1:4337", prepareInterface: () => new Promise(r => { finish = r; }) });
  const pending = session.start(); session.stop(); finish({ update: async () => {}, close: () => { closes++; } });
  await assert.rejects(pending, /stopped during preparation/); assert.equal(closes, 1);
  await assert.rejects(() => session.start(), /new video session/);
});
