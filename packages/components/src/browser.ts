// Host-independent component contracts, graph validation and locking. No filesystem or hardware access.
import Ajv2020 from "ajv/dist/2020.js";
import componentSchema from "../schema/component.schema.json" with { type: "json" };
import compositionSchema from "../schema/composition.schema.json" with { type: "json" };

export interface Port { direction: "in" | "out"; kind: "stream" | "value" | "action"; contract: string; required?: boolean }
export interface Parameter { type: "number" | "integer" | "boolean" | "string"; default: number | boolean | string; minimum?: number; maximum?: number }
export interface Component {
  format: "odb-component/1";
  id: string; version: string; title: string; description: string;
  status: "source-referenced" | "port-in-progress" | "available" | "deprecated";
  roles: ("source" | "adapter" | "processing" | "interface")[];
  license: string; authors: string[]; targets: string[];
  source: { path: string; sha256: string; build: string; files?: { path: string; sha256: string }[] };
  artifact?: { path: string; sha256: string };
  runtime?: { kind: "host" | "wasm" | "web-component"; entry: string; abi: string };
  ports: Record<string, Port>; parameters: Record<string, Parameter>;
  permissions: string[];
  devices?: string[];
  behavior: string;
  fixtures: { input: number; factor: number; expected: number }[];
  evidence: { kind: "fixture" | "hardware-report" | "hardware-reproduction"; reference: string }[];
}
export interface RegisteredComponent extends Component { manifest_sha256: string }
export interface Composition {
  purpose?: "application" | "example"; devices?: string[];
  format: "odb-composition/1";
  id: string; title: string; description: string;
  nodes: { id: string; component: string; version: string; parameters: Record<string, number | string | boolean> }[];
  connections: { from: string; to: string }[];
  layout: { application: Record<string, { x: number; y: number; width: number; height: number }> };
  lock?: { component: string; version: string; manifest_sha256: string; artifact_sha256?: string }[];
}
export interface Registry { format: "odb-registry/1"; components: RegisteredComponent[]; compositions: Composition[] }
export interface Diagnostic { code: string; message: string; node?: string; port?: string }
const ajv = new (Ajv2020 as any)({ allErrors: true, strict: false, ownProperties: true });
const checkComponent = ajv.compile(componentSchema), checkComposition = ajv.compile(compositionSchema);
const errors = (validator: any, value: unknown): string[] => validator(value) ? [] :
  validator.errors.map((e: any) => `${e.instancePath || "/"} ${e.message}`);
export const validateComponent = (value: unknown) => errors(checkComponent, value);
export const validateCompositionShape = (value: unknown) => errors(checkComposition, value);
export const componentKey = (c: Pick<Component, "id" | "version">) => `${c.id}@${c.version}`;
export const findComponent = (registry: Registry, id: string, version: string) =>
  registry.components.find(c => c.id === id && c.version === version);

export function parameterValues(component: Component, supplied: Record<string, unknown> = {}): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = Object.create(null);
  for (const key of Object.keys(supplied)) if (!Object.hasOwn(component.parameters, key)) throw Error(`Unknown parameter ${component.id}.${key}`);
  for (const [key, spec] of Object.entries(component.parameters)) {
    const value = Object.hasOwn(supplied, key) ? supplied[key] : spec.default;
    const numeric = spec.type === "number" || spec.type === "integer";
    if ((numeric ? typeof value !== "number" || !Number.isFinite(value) : typeof value !== spec.type) ||
        (spec.type === "integer" && !Number.isInteger(value)) ||
        (numeric && (spec.minimum !== undefined && (value as number) < spec.minimum || spec.maximum !== undefined && (value as number) > spec.maximum)) ||
        (typeof value === "string" && value.length > 4096)) throw Error(`Invalid parameter ${component.id}.${key}`);
    out[key] = value as number | string | boolean;
  }
  return out;
}

export function validateComposition(value: unknown, registry: Registry, target = "browser", requireLock = false): { valid: boolean; diagnostics: Diagnostic[]; order: string[] } {
  const diagnostics: Diagnostic[] = validateCompositionShape(value).map(message => ({ code: "structure", message }));
  if (diagnostics.length) return { valid: false, diagnostics, order: [] };
  const c = value as Composition;
  const locked = new Set<string>();
  for (const lock of c.lock ?? []) {
    const key = `${lock.component}@${lock.version}`;
    if (locked.has(key) || !c.nodes.some(n => n.component === lock.component && n.version === lock.version)) diagnostics.push({ code: "lock", message: `Duplicate or unrelated lock ${key}` });
    locked.add(key);
  }
  const nodes = new Map<string, RegisteredComponent>();
  const ids = new Set<string>();
  for (const n of c.nodes) {
    if (ids.has(n.id)) diagnostics.push({ code: "duplicate-node", node: n.id, message: `Duplicate node ${n.id}` });
    ids.add(n.id);
    const component = findComponent(registry, n.component, n.version);
    if (!component) { diagnostics.push({ code: "missing-component", node: n.id, message: `Missing ${n.component}@${n.version}` }); continue; }
    nodes.set(n.id, component);
    if (component.status !== "available") diagnostics.push({ code: "unavailable", node: n.id, message: `${componentKey(component)} is ${component.status}` });
    if (!component.targets.includes(target)) diagnostics.push({ code: "target", node: n.id, message: `${componentKey(component)} does not support ${target}` });
    try { parameterValues(component, n.parameters); } catch (e) { diagnostics.push({ code: "parameter", node: n.id, message: (e as Error).message }); }
    const lock = c.lock?.find(l => l.component === n.component && l.version === n.version);
    if (requireLock && !lock) diagnostics.push({ code: "missing-lock", node: n.id, message: `Missing artifact lock for ${n.id}` });
    if (lock && (lock.manifest_sha256 !== component.manifest_sha256 || lock.artifact_sha256 !== component.artifact?.sha256)) diagnostics.push({ code: "integrity", node: n.id, message: `Locked release changed for ${n.id}` });
  }
  const incoming = new Set<string>(), adjacency = new Map(c.nodes.map(n => [n.id, [] as string[]]));
  const inDegree = new Map(c.nodes.map(n => [n.id, 0]));
  for (const edge of c.connections) {
    const [from, outPort] = edge.from.split("."), [to, inPort] = edge.to.split(".");
    const source = nodes.get(from)?.ports[outPort], sink = nodes.get(to)?.ports[inPort];
    if (!source || !sink || source.direction !== "out" || sink.direction !== "in") { diagnostics.push({ code: "port", message: `Invalid connection ${edge.from} → ${edge.to}` }); continue; }
    if (source.contract !== sink.contract || source.kind !== sink.kind) diagnostics.push({ code: "contract", node: to, port: inPort, message: `Incompatible contracts: ${edge.from} → ${edge.to}` });
    if (incoming.has(edge.to)) diagnostics.push({ code: "multiple-producers", node: to, port: inPort, message: `Several producers for ${edge.to}` });
    incoming.add(edge.to);
    if (source.kind !== "action") { adjacency.get(from)?.push(to); inDegree.set(to, (inDegree.get(to) ?? 0) + 1); }
  }
  for (const [id, component] of nodes) for (const [port, p] of Object.entries(component.ports)) {
    if (p.direction === "in" && p.required !== false && !incoming.has(`${id}.${port}`)) diagnostics.push({ code: "unconnected", node: id, port, message: `Missing input ${id}.${port}` });
  }
  for (const id of Object.keys(c.layout.application)) {
    if (!nodes.get(id)?.roles.includes("interface")) diagnostics.push({ code: "layout", node: id, message: `Layout refers to a missing interface ${id}` });
    const box = c.layout.application[id];
    if (box.x + box.width > 12) diagnostics.push({ code: "layout", node: id, message: `Layout exceeds the 12-column grid for ${id}` });
  }
  const queue = [...inDegree].filter(([, n]) => !n).map(([id]) => id), order: string[] = [];
  while (queue.length) { const id = queue.shift()!; order.push(id); for (const next of adjacency.get(id) ?? []) { inDegree.set(next, inDegree.get(next)! - 1); if (!inDegree.get(next)) queue.push(next); } }
  if (order.length !== c.nodes.length) diagnostics.push({ code: "cycle", message: "Data connections contain a cycle" });
  return { valid: !diagnostics.length, diagnostics, order };
}

export function lockComposition(value: Composition, registry: Registry, target = "browser"): Composition {
  const result = validateComposition(value, registry, target);
  if (!result.valid) throw Error(result.diagnostics.map(d => d.message).join("; "));
  const lock = [...new Map(value.nodes.map(n => {
    const c = findComponent(registry, n.component, n.version)!;
    return [componentKey(c), { component: c.id, version: c.version, manifest_sha256: c.manifest_sha256, ...(c.artifact ? { artifact_sha256: c.artifact.sha256 } : {}) }];
  })).values()];
  return { ...structuredClone(value), lock };
}

export function compatibleApplications(registry: Registry, context: { deviceId?: string; usb?: boolean }): Composition[] {
  return registry.compositions.filter(app => app.devices?.length ? !!context.deviceId && app.devices.includes(context.deviceId) : app.nodes.some(n => {
    const c = findComponent(registry, n.component, n.version);
    return c?.status === "available" && (context.deviceId && c.devices?.includes(context.deviceId) || context.usb && c.permissions.includes("usb.descriptors"));
  }));
}

/** Inspect a module without instantiation. The pilot scalar ABI forbids all imports. */
export function inspectWasm(bytes: Uint8Array, expectedExport = "process") {
  if (bytes.byteLength > 262144) throw Error("Pilot WASM artifact exceeds 256 KiB");
  const module = new WebAssembly.Module(bytes as BufferSource);
  const imports = WebAssembly.Module.imports(module), exports = WebAssembly.Module.exports(module);
  if (imports.length) throw Error("The scalar ABI does not permit host imports");
  if (exports.length !== 1 || exports[0].name !== expectedExport || exports[0].kind !== "function") throw Error("The scalar ABI requires exactly one declared function export");
  // Parse validated type/function/export sections to check the exact (f64, f64) -> f64 ABI.
  let pos = 8;
  const read = () => { let n = 0, shift = 0, b: number; do { b = bytes[pos++]; n |= (b & 127) << shift; shift += 7; } while (b & 128); return n >>> 0; };
  const types: { args: number[]; results: number[] }[] = [], funcs: number[] = [];
  let exportedIndex = -1;
  const vector = () => Array.from({ length: read() }, () => bytes[pos++]);
  while (pos < bytes.length) {
    const id = bytes[pos++], size = read(), end = pos + size;
    if (id === 1) { const count = read(); for (let i = 0; i < count; i++) { if (bytes[pos++] !== 0x60) throw Error("Unsupported scalar function type"); types.push({ args: vector(), results: vector() }); } }
    else if (id === 3) { const count = read(); for (let i = 0; i < count; i++) funcs.push(read()); }
    else if (id === 7) { const count = read(); for (let i = 0; i < count; i++) { const length = read(); pos += length; const kind = bytes[pos++], index = read(); if (kind === 0) exportedIndex = index; } }
    else if ([4, 5, 6, 8, 9, 11, 12].includes(id)) throw Error("The scalar ABI does not permit memory, tables, globals, start functions or data");
    pos = end;
  }
  const signature = types[funcs[exportedIndex]];
  if (JSON.stringify(signature) !== JSON.stringify({ args: [0x7c, 0x7c], results: [0x7c] })) throw Error("Expected process(f64, f64) -> f64");
  return { imports, exports, signature: "(f64, f64) -> f64", bytes: bytes.byteLength, executed: false };
}

/** Compile-only inspection of the fixed browser probe ABI; no module code is run. */
export function inspectProbeWasm(bytes:Uint8Array){
 if(bytes.length>2097152)throw Error("Probe WASM exceeds 2 MiB");
 const module=new WebAssembly.Module(bytes as BufferSource),imports=WebAssembly.Module.imports(module),exports=WebAssembly.Module.exports(module);
 const allowed=new Set(["environ_get","environ_sizes_get","fd_close","fd_fdstat_get","fd_filestat_get","fd_prestat_get","fd_prestat_dir_name","fd_read","fd_write","path_filestat_get","path_open","proc_exit"]);
 if(imports.some(i=>i.module!=="wasi_snapshot_preview1"||i.kind!=="function"||!allowed.has(i.name)))throw Error("Probe ABI permits only its in-memory WASI imports");
 const names=["memory","odb_alloc","odb_free","odb_call","odb_output_ptr","odb_output_len"];
 const optional=["odb_builtin_profile","odb_live_api"];
 if(exports.some(e=>!names.includes(e.name)&&(!optional.includes(e.name)||e.kind!=="function"))||names.some(name=>!exports.some(e=>e.name===name&&e.kind===(name==="memory"?"memory":"function"))))throw Error("Unexpected probe ABI exports");
 let position=8,memoryMaximum=0;
 const leb=()=>{let n=0,shift=0,b:number;do{b=bytes[position++];n|=(b&127)<<shift;shift+=7;}while(b&128);return n>>>0;};
 while(position<bytes.length){const section=bytes[position++],size=leb(),end=position+size;
  if(section===8)throw Error("Probe ABI forbids automatic start functions");
  if(section===5){if(leb()!==1||leb()!==1)throw Error("Probe ABI requires one bounded unshared memory");const initial=leb();memoryMaximum=leb();if(initial>memoryMaximum||memoryMaximum>4096)throw Error("Probe memory exceeds 256 MiB");}
  position=end;
 }
 if(!memoryMaximum)throw Error("Probe memory maximum must be explicit");
 return{imports,exports,signature:"odb_call(i32,i32,i32) -> i32",maximum_memory_bytes:memoryMaximum*65536,bytes:bytes.length,executed:false};
}
