import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPONENT_REPO_ROOT, loadRegistry, inspectComponent } from "@opendevicedb/components";
import { LocalBackend, RemoteBackend } from "../src/backend.ts";
import { COMPONENT_TOOLS } from "../src/components-tools.ts";

const registry = loadRegistry();
const local = new LocalBackend(COMPONENT_REPO_ROOT);
const run = (name: string, args: Record<string, unknown> = {}, backend = local as any) => COMPONENT_TOOLS.find(t => t.name === name)!.run({ backend }, args) as Promise<any>;

test("component MCP discovery and inspection expose exact sources without execution", async () => {
  const result = await run("search_components", { query: "examples/scale", target: "browser" });
  assert.equal(result.total, 1); assert.equal(result.components[0].id, "examples/scale");
  const inspected = await run("inspect_component", { id: "examples/scale", version: "1.0.0" });
  assert.equal(inspected.inspection.executed, false); assert.equal(inspected.inspection.wasm.executed, false);
  assert.match(inspected.inspection.source.text, /f64.mul/);
  assert.equal((await run("get_component", { id: "examples/scale", version: "9.0.0" })).ok, false);
});

test("MCP resolution checks locks, reports missing targets and never promises a desktop package", async () => {
  const composition = registry.compositions[0];
  const result = await run("resolve_composition", { composition, target: "browser" });
  assert.equal(result.valid, true); assert.ok(result.composition.lock.length);
  const unavailable = await run("prepare_app_export", { composition, target: "desktop-linux-x64" });
  assert.equal(unavailable.package_available, false); assert.equal(unavailable.build_started, false);
  assert.ok(unavailable.blockers.length); assert.equal(unavailable.hardware_validation, "not-performed");
  const corrupt = structuredClone(composition); corrupt.lock![0].manifest_sha256 = "0".repeat(64);
  assert.equal((await run("validate_composition", { composition: corrupt, target: "browser" })).valid, false);
});

test("remote registry and inspection preserve local API contracts", async () => {
  const requests: string[] = [];
  const backend = new RemoteBackend("https://registry.example", { fetch: async url => {
    requests.push(url);
    const body = url.endsWith("/api/components.json") ? registry : url.endsWith("/inspection.json") ? inspectComponent(registry.components.find(c => c.id === "examples/scale")!) : null;
    return { ok: body !== null, status: body ? 200 : 404, json: async () => body };
  } });
  assert.equal((await run("search_components", { query: "examples/scale" }, backend)).total, 1);
  assert.equal((await run("inspect_component", { id: "examples/scale", version: "1.0.0" }, backend)).inspection.executed, false);
  assert.equal(await backend.inspectComponent("../../secret", "1.0.0"), null);
  assert.ok(requests.every(url => !url.includes("..")));
  assert.equal(requests.filter(url => url.endsWith("/api/components.json")).length, 1);
});


test("video integration guidance uses the frame SDK and read-only bridge", async () => {
  const result = await run("get_integration_guide", { id: "ultrasound/preview-source", version: "1.0.0" });
  assert.equal(result.sdk, "@opendevicedb/components/video");
  assert.match(result.steps.join(" "), /cannot start acquisition/);
});

test("recording and original profile integration guides never route replay into acquisition", async () => {
  for (const [id, version] of [["ultrasound/recorded-data", "1.0.0"], ["ultrasound/convex-open-image", "0.1.0"]]) {
    const result = await run("get_integration_guide", { id, version });
    assert.equal(result.sdk, "@opendevicedb/components/probe-replay");
    assert.match(result.steps.join(" "), /reconstruction-only/);
    assert.match(result.steps.join(" "), /No USB access or command binding/);
    assert.doesNotMatch(result.steps.join(" "), /Use ProbeCaptureSession/);
  }
});
