#!/usr/bin/env node
// OpenDeviceDB MCP server (stdio). Backend from ODB_REPO / ODB_API_URL, see backend.ts.
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { backendFromEnv, type Backend } from "./backend.ts";
import { TOOLS, type Context } from "./tools.ts";

const READ_ONLY = new Set(["lookup_device", "search_devices", "list_sources", "request_device",
  "search_components", "get_component", "inspect_component", "resolve_composition", "validate_composition", "get_integration_guide", "prepare_app_export"]);

export function createServer(backend: Backend, opts: { today?: string } = {}): McpServer {
  const server = new McpServer(
    { name: "opendevicedb", version: "0.3.0" },
    {
      instructions:
        "OpenDeviceDB is a directory of devices whose protocols or firmware have already been reverse engineered. " +
        "It also hosts reusable free processing and UI components, including uses with no connected device: search_components, get_component and inspect_component discover them without executing code. " +
        "Before reverse engineering any device, call lookup_device (identifiers such as FCC id or USB vid:pid match best). " +
        "If nothing is known, call claim_device before starting (or request_device if the user only wants the device to exist). When you finish, call publish_findings, then open a pull request. " +
        `Backend: ${backend.kind} (${backend.location})${backend.root ? "" : ", read-only"}.`,
    },
  );
  const ctx: Context = { backend, today: opts.today };
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.shape,
        annotations: { readOnlyHint: READ_ONLY.has(t.name), destructiveHint: false, openWorldHint: false },
      },
      async (args: any) => {
        try {
          const result = await t.run(ctx, args ?? {});
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
        } catch (e: any) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: String(e?.message ?? e) }) }], isError: true };
        }
      },
    );
  }
  return server;
}

// Entry point check that survives the npm bin symlink (import.meta.main needs Node >= 24.2).
const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const backend = backendFromEnv();
  await createServer(backend).connect(new StdioServerTransport());
  console.error(`opendevicedb-mcp: ${backend.kind} backend at ${backend.location}`);
}
