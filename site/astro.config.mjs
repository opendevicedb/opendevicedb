// OpenDeviceDB website. Static build of the repository: see SPEC.md "Static API".
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import deviceJson from "./src/integrations/device-json.ts";
import sitemap from "./src/integrations/sitemap.ts";

// The repository root. Core's own REPO_ROOT is derived from import.meta.url, which no
// longer points into packages/core once Vite has bundled it, so the site passes the root
// explicitly. ODB_REPO (same variable as the MCP server) overrides it at build time.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const dataRoot = () => process.env.ODB_REPO || repoRoot;

export default defineConfig({
  site: "https://opendevicedb.org",
  trailingSlash: "ignore",
  build: { format: "directory", concurrency: 4 },
  integrations: [deviceJson({ root: dataRoot }), sitemap({ site: "https://opendevicedb.org" })],
  vite: {
    define: { __ODB_ROOT__: JSON.stringify(repoRoot) },
    // core exports TypeScript source; let Vite transpile and bundle it.
    ssr: { noExternal: ["@opendevicedb/core"] },
    server: { fs: { allow: [repoRoot] } },
  },
});
