// Reproducible WAT assembly and source/artifact/manifest locks. No manifest build command is executed.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import wabtFactory from "wabt";
import { sha256, repositoryFile, loadRegistry } from "../packages/components/src/index.ts";
import { lockComposition, validateComponent, type RegisteredComponent, type Composition } from "../packages/components/src/browser.ts";
const root = fileURLToPath(new URL("..", import.meta.url));
const write = process.argv.includes("--write");
const walk = (dir: string, name: string): string[] => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name), name) : e.isFile() && e.name === name ? [join(dir, e.name)] : []);
const update = (file: string, bytes: Uint8Array | string) => {
  const data = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
  if (existsSync(file) && readFileSync(file).equals(data)) return;
  if (!write) throw Error(`Generated component file is stale: ${file}. Run npm run components:build`);
  writeFileSync(file, data);
};
const wabt = await wabtFactory();
const components: RegisteredComponent[] = [];
for (const file of walk(join(root, "components"), "component.json")) {
  const c = JSON.parse(readFileSync(file, "utf8"));
  const errors = validateComponent(c);
  if (errors.length) throw Error(`${file}: ${errors.join("; ")}`);
  if (c.artifact && !c.artifact.path.startsWith(`components/${c.id}/${c.version}/`)) throw Error(`Artifact must belong to its component version: ${c.id}`);
  const source = readFileSync(repositoryFile(root, c.source.path));
  if (c.runtime?.kind === "wasm" && c.runtime.abi === "odb.scalar-transform/1") {
    const wat = wabt.parseWat(c.source.path, source.toString("utf8"));
    try { wat.validate(); const { buffer } = wat.toBinary({ write_debug_names: true }); update(resolve(root, c.artifact.path), buffer); }
    finally { wat.destroy(); }
  }
  c.source.sha256 = sha256(source);
  for (const file of c.source.files ?? []) file.sha256 = sha256(readFileSync(repositoryFile(root, file.path)));
  if (c.artifact) c.artifact.sha256 = sha256(readFileSync(repositoryFile(root, c.artifact.path)));
  const raw = JSON.stringify(c, null, 2) + "\n";
  update(file, raw);
  components.push({ ...c, manifest_sha256: sha256(raw) });
}
const registry = { format: "odb-registry/1" as const, components, compositions: [] };
for (const file of walk(join(root, "compositions"), "composition.json")) {
  const c: Composition = JSON.parse(readFileSync(file, "utf8"));
  // Release regeneration is explicit; validation of a normal import never changes a supplied lock.
  delete c.lock;
  update(file, JSON.stringify(lockComposition(c, registry), null, 2) + "\n");
}
const checked = loadRegistry(root);
console.log(`${checked.components.length} component versions and ${checked.compositions.length} application locks ${write ? "generated and validated" : "reproducible"}`);
