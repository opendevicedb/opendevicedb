import type { AstroIntegration } from "astro";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, registryAssets, repositoryFile, inspectComponent } from "@opendevicedb/components";

function files(root: string) {
  const registry = loadRegistry(root);
  const result = new Map<string, { type: string; bytes: Buffer }>();
  const json = (value: unknown) => ({ type: "application/json", bytes: Buffer.from(JSON.stringify(value, null, 2)) });
  result.set("/api/components.json", json(registry));
  for (const c of registry.components) result.set(`/api/components/${c.id}/${c.version}/inspection.json`, json(inspectComponent(c, root)));
  for (const path of registryAssets(registry)) result.set(`/_components/${path}`, {
    type: path.endsWith(".wasm") ? "application/wasm" : path.endsWith(".js") ? "text/javascript" : "text/plain; charset=utf-8",
    bytes: readFileSync(repositoryFile(root, path)),
  });
  return result;
}
export default function componentsIntegration(opts: { root: () => string }): AstroIntegration {
  return { name: "odb-components", hooks: {
    "astro:server:setup": ({ server }) => server.middlewares.use((req, res, next) => {
      const path = req.url?.split("?")[0] ?? "";
      if (!path.startsWith("/api/components") && !path.startsWith("/_components/")) return next();
      try {
        const file = files(opts.root()).get(path); if (!file) return next();
        res.setHeader("Content-Type", file.type); res.setHeader("X-Content-Type-Options", "nosniff"); res.end(file.bytes);
      } catch (e) { next(e); }
    }),
    "astro:build:done": ({ dir, logger }) => {
      const generated = files(opts.root());
      for (const [path, data] of generated) {
        const target = join(fileURLToPath(dir), path.slice(1)); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, data.bytes);
      }
      logger.info(`wrote ${generated.size} component registry, inspection and artifact files`);
    },
  } };
}
