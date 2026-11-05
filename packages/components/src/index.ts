// Repository registry. Never evaluates contributor JavaScript or instantiates WASM.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateComponent, validateComposition, parameterValues, inspectWasm, inspectProbeWasm, type Registry, type RegisteredComponent, type Component, type Composition } from "./browser.ts";
export * from "./browser.ts";

export const COMPONENT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export function repositoryFile(root: string, path: string): string {
  if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith("/") || path.split("/").some(p => p.startsWith("."))) throw Error(`Invalid repository path: ${path}`);
  if (!path.startsWith("components/") && path !== "packages/components/src/host.ts") throw Error(`Not a public component source/artifact path: ${path}`);
  const file = realpathSync(resolve(root, path));
  if (relative(realpathSync(root), file).startsWith("..")) throw Error(`Path leaves repository: ${path}`);
  return file;
}

function manifests(root: string, name: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(e =>
    e.isSymbolicLink() ? (() => { throw Error(`Symlinks are not accepted in the component registry: ${join(root, e.name)}`); })() :
    e.isDirectory() ? manifests(join(root, e.name), name) : e.name === name ? [join(root, name)] : []);
}

function checkedBytes(root: string, asset: { path: string; sha256: string }, limit = 262144): Buffer {
  const data = readFileSync(repositoryFile(root, asset.path));
  if (data.length > limit) throw Error(`Pilot source/artifact exceeds 256 KiB: ${asset.path}`);
  if (sha256(data) !== asset.sha256) throw Error(`Digest mismatch: ${asset.path}`);
  return data;
}

export function inspectComponent(component: Component, root = COMPONENT_REPO_ROOT) {
  const source = checkedBytes(root, component.source);
  const probe = component.runtime?.abi === "odb.ultrasound.decode/1";
  const sources = component.source.files?.map(file => ({ ...file, text: checkedBytes(root, file).toString("utf8") }));
  const artifact = component.artifact ? checkedBytes(root, component.artifact, probe ? 2097152 : 262144) : undefined;
  return {
    format: "odb-inspection/1", executed: false,
    source: { ...component.source, text: source.toString("utf8"), ...(sources ? { files: sources } : {}) },
    behavior: component.behavior, ports: component.ports, parameters: component.parameters,
    fixtures: component.fixtures, evidence: component.evidence,
    ...(component.runtime?.kind === "wasm" && artifact ? { wasm: probe ? inspectProbeWasm(artifact) : inspectWasm(artifact, component.runtime.entry) } : {}),
  };
}

export function loadRegistry(root = COMPONENT_REPO_ROOT): Registry {
  const components: RegisteredComponent[] = manifests(join(root, "components"), "component.json").map(file => {
    const raw = readFileSync(file), c: Component = JSON.parse(raw.toString("utf8"));
    const problems = validateComponent(c);
    if (problems.length) throw Error(`${relative(root, file)}: ${problems.join("; ")}`);
    if (relative(root, file) !== `components/${c.id}/${c.version}/component.json`) throw Error(`Component identity does not match its path: ${file}`);
    if (c.artifact && !c.artifact.path.startsWith(`components/${c.id}/${c.version}/`)) throw Error(`Artifact must belong to its component version: ${c.id}`);
    parameterValues(c);
    const inspection = inspectComponent(c, root);
    if (c.status === "available") {
      const runtime = c.runtime!;
      const ports = Object.values(c.ports), inputs = ports.filter(p => p.direction === "in"), outputs = ports.filter(p => p.direction === "out");
      const decoder = runtime.abi === "odb.ultrasound.decode/1", usb = runtime.entry === "probe-usb" || runtime.entry === "probe-recording";
      const video = runtime.abi === "odb.video-source/1" || runtime.abi === "odb.video-ui/1";
      if (ports.some(p => p.kind !== "stream" || p.contract !== (decoder ? p.direction === "in" ? "odb.usb.bytes/1" : "odb.video.frame/1" : usb ? "odb.usb.bytes/1" : video ? "odb.video.frame/1" : "odb.scalar/1")) || inputs.length !== (runtime.kind === "host" ? 0 : 1) || outputs.length !== (runtime.kind === "web-component" ? 0 : 1)) throw Error(`Ports do not match the declared stream ABI for ${c.id}`);
      if (runtime.kind === "wasm" && (!["odb.scalar-transform/1", "odb.ultrasound.decode/1"].includes(runtime.abi) || c.permissions.length)) throw Error(`Unsupported WASM ABI or permissions for ${c.id}`);
      if (runtime.kind === "web-component" && (!["odb.scalar-ui/1", "odb.video-ui/1"].includes(runtime.abi) || !/^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(runtime.entry) || c.permissions.length)) throw Error(`Unsupported interface ABI or permissions for ${c.id}`);
      if (runtime.kind === "host") {
        const permissions = runtime.entry === "probe-recording" ? ["file.probe-recording"] : usb ? ["usb.capture"] : runtime.entry === "ultrasound-preview" ? ["ultrasound.preview"] : runtime.entry === "recorded-scalars" ? ["file.scalar-values"] : runtime.entry === "usb-descriptors" ? ["usb.descriptors"] : undefined;
        if (runtime.abi !== (usb ? "odb.usb-source/1" : runtime.entry === "ultrasound-preview" ? "odb.video-source/1" : "odb.scalar-source/1") || !permissions || JSON.stringify(c.permissions) !== JSON.stringify(permissions)) throw Error(`Unknown host service or permissions for ${c.id}`);
      }
      for (const file of c.source.files ?? []) if (!file.path.startsWith(`components/${c.id}/${c.version}/`)) throw Error(`Source file must belong to its component version: ${file.path}`);

      if (runtime.kind === "wasm" && !inspection.wasm) throw Error(`Missing WASM artifact for ${c.id}`);
    }
    return { ...c, manifest_sha256: sha256(raw) };
  });
  const compositions: Composition[] = manifests(join(root, "compositions"), "composition.json").map(file => JSON.parse(readFileSync(file, "utf8")));
  const registry: Registry = { format: "odb-registry/1", components, compositions };
  const keys = components.map(c => `${c.id}@${c.version}`);
  if (new Set(keys).size !== keys.length) throw Error("Duplicate component version");
  if (new Set(compositions.map(c => c.id)).size !== compositions.length) throw Error("Duplicate application identifier");
  for (const app of compositions) {
    const result = validateComposition(app, registry, "browser", true);
    if (!result.valid) throw Error(`${app.id}: ${result.diagnostics.map(d => d.message).join("; ")}`);
  }
  return registry;
}

export function registryAssets(registry: Registry): string[] {
  return [...new Set(registry.components.flatMap(c => [c.source.path, ...(c.source.files ?? []).map(f => f.path), ...(c.artifact ? [c.artifact.path] : [])]))];
}
