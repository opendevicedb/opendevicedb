import { loadRegistry } from "./index.ts";
try {
  const registry = loadRegistry();
  console.log(`${registry.components.length} component versions, ${registry.compositions.length} applications; schemas, digests and locked graphs valid`);
} catch (e) { console.error((e as Error).message); process.exitCode = 1; }
