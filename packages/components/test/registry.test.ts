import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import wabtFactory from "wabt";
import { loadRegistry, COMPONENT_REPO_ROOT, inspectComponent, repositoryFile, sha256 } from "../src/index.ts";
import { validateComposition, lockComposition, inspectWasm, parameterValues, compatibleApplications } from "../src/browser.ts";
import { ScalarSession } from "../src/host.ts";

const registry = loadRegistry();
const app = () => structuredClone(registry.compositions.find(c => c.id === "examples/measurements")!);
const wasm = registry.components.find(c => c.id === "examples/scale")!;

test("registry pins real sources, exact versions and executable WAT fixture behavior", async () => {
  assert.equal(registry.components.length, 10); assert.equal(registry.compositions.length, 5);
  for (const c of registry.components) assert.equal(sha256(readFileSync(repositoryFile(COMPONENT_REPO_ROOT, c.source.path))), c.source.sha256);
  const bytes = readFileSync(repositoryFile(COMPONENT_REPO_ROOT, wasm.artifact!.path));
  const { instance } = await WebAssembly.instantiate(bytes);
  for (const f of wasm.fixtures) assert.equal((instance.exports.process as Function)(f.input, f.factor), f.expected);
  assert.equal(inspectComponent(wasm).executed, false);
  assert.equal(inspectComponent(wasm).wasm!.signature, "(f64, f64) -> f64");
});

test("the same versioned processing and interface components are reused with two sources", () => {
  for (const c of registry.compositions) assert.equal(validateComposition(c, registry, "browser", true).valid, true);
  assert.deepEqual(registry.compositions.filter(c => c.id.startsWith("examples/")).map(c => c.nodes.filter(n => n.id !== "source").map(n => `${n.component}@${n.version}`)), [
    ["examples/scale@1.0.0", "examples/number-display@1.0.0"], ["examples/scale@1.0.0", "examples/number-display@1.0.0"],
  ]);
  assert.deepEqual(compatibleApplications(registry, { usb: true }).map(c => c.id), ["examples/usb-revision"]);
  assert.deepEqual(compatibleApplications(registry, { deviceId: "unknown/device" }), []);
});

test("validation rejects invalid contracts, cycles, disconnected inputs and duplicate node IDs", () => {
  const disconnected = app(); disconnected.connections.pop();
  assert.ok(validateComposition(disconnected, registry).diagnostics.some(d => d.code === "unconnected"));
  const duplicate = app(); duplicate.nodes.push(structuredClone(duplicate.nodes[0]));
  assert.ok(validateComposition(duplicate, registry).diagnostics.some(d => d.code === "duplicate-node"));
  const cycle = app(); cycle.connections.push({ from: "scale.scaled", to: "scale.samples" });
  assert.ok(validateComposition(cycle, registry).diagnostics.some(d => d.code === "cycle"));
  const changed = structuredClone(registry); changed.components.find(c => c.id === "examples/number-display")!.ports.samples.contract = "odb.other/1";
  assert.ok(validateComposition(app(), changed).diagnostics.some(d => d.code === "contract"));
  const layout = app(); layout.layout.application.display.x = 11;
  assert.ok(validateComposition(layout, registry).diagnostics.some(d => d.code === "layout"));
});

test("locked imports are never silently upgraded, including manifest-only permission changes", () => {
  const altered = structuredClone(registry); altered.components.find(c => c.id === wasm.id)!.manifest_sha256 = "f".repeat(64);
  assert.equal(validateComposition(app(), altered).valid, false);
  assert.throws(() => lockComposition(app(), altered), /Locked release changed/);
  const unlocked = app(); delete unlocked.lock;
  assert.ok(validateComposition(unlocked, registry, "browser", true).diagnostics.some(d => d.code === "missing-lock"));
  assert.equal(validateComposition(app(), registry, "desktop-linux-x64").valid, false);
});

test("parameters reject NaN, infinity, unknown fields, invalid defaults and out-of-range values", () => {
  for (const factor of [NaN, Infinity, 1000001, "2", null]) assert.throws(() => parameterValues(wasm, { factor }));
  assert.throws(() => parameterValues(wasm, { execute: true }));
  assert.deepEqual({ ...parameterValues(wasm) }, { factor: 2 });
});

test("inspection rejects imports, start functions and wrong signatures without running them", async () => {
  const wabt = await wabtFactory();
  for (const wat of [
    '(module (import "host" "effect" (func)) (func (export "process") (param f64 f64) (result f64) f64.const 0))',
    '(module (func $start unreachable) (start $start) (func (export "process") (param f64 f64) (result f64) f64.const 0))',
    '(module (func (export "process") (param i32 i32) (result i32) local.get 0))',
  ]) {
    const parsed = wabt.parseWat("adversarial.wat", wat);
    try { assert.throws(() => inspectWasm(parsed.toBinary({}).buffer)); } finally { parsed.destroy(); }
  }
});

test("registry rejects tampered sources and filesystem escapes", () => {
  const root = mkdtempSync(join(tmpdir(), "odb-components-"));
  try {
    for (const dir of ["components", "compositions", "packages/components/src"]) cpSync(join(COMPONENT_REPO_ROOT, dir), join(root, dir), { recursive: true, filter: source => basename(source) !== "target" });
    writeFileSync(join(root, wasm.source.path), "tampered");
    assert.throws(() => loadRegistry(root), /Digest mismatch/);
    assert.throws(() => repositoryFile(root, "../outside"), /Invalid repository path/);
    assert.throws(() => repositoryFile(root, ".env"), /Invalid repository path/);
    assert.throws(() => repositoryFile(root, "private-config.json"), /Not a public component/);
    symlinkSync("/etc/hosts", join(root, "components/escape"));
    assert.throws(() => repositoryFile(root, "components/escape"), /Path leaves repository/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("SDK stop cancels in-flight processing, releases consumers and never replays a session", async () => {
  let finish: ((value: number) => void) | undefined, closes = 0, samples = 0;
  const session = new ScalarSession(app(), registry, {
    prepareTransform: async () => ({ process: () => new Promise(resolve => { finish = resolve; }), close: () => { closes++; } }),
    prepareInterface: async () => ({ update: () => { samples++; }, close: () => { closes++; } }),
  });
  await session.start(); assert.ok(finish); session.stop(); finish!(100);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(samples, 0); assert.equal(closes, 2);
  await assert.rejects(() => session.start(), /cannot be restarted/);
});

test("SDK releases a resource prepared after cancellation and does not start producers", async () => {
  let finish: ((handle: any) => void) | undefined, closes = 0;
  const session = new ScalarSession(app(), registry, {
    prepareTransform: async () => { throw Error("must not prepare producer after cancellation"); },
    prepareInterface: () => new Promise(resolve => { finish = resolve; }),
  });
  const started = session.start(); session.stop(); finish!({ update() {}, close() { closes++; } });
  await assert.rejects(started, /stopped during preparation/); assert.equal(closes, 1);
});
