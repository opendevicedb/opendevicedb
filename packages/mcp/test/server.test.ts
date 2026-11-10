// End to end: spawn the stdio server and talk to it with the official SDK client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { makeRepo } from "./fixture.ts";

const SERVER = fileURLToPath(new URL("../src/server.ts", import.meta.url));

test("stdio server lists the tools and answers lookup_device, claim_device", async () => {
  const root = makeRepo();
  const client = new Client({ name: "odb-test", version: "0.0.0" });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      env: { ...process.env, ODB_REPO: root, ODB_API_URL: "http://127.0.0.1:9" } as Record<string, string>,
      stderr: "ignore",
    }));
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["claim_device", "list_sources", "lookup_device", "publish_findings", "request_device", "search_devices",
      "search_components", "get_component", "inspect_component", "resolve_composition", "validate_composition", "get_integration_guide", "prepare_app_export"].sort());
    assert.ok(tools.filter(t => t.name.includes("component") || t.name.includes("composition") || t.name === "get_integration_guide" || t.name === "prepare_app_export").every(t => t.annotations?.readOnlyHint === true));
    assert.ok(tools.find((t) => t.name === "lookup_device")!.inputSchema.properties!.fcc_id);

    const found: any = await client.callTool({ name: "lookup_device", arguments: { vendor: "Acme", model: "Sky 1" } });
    assert.equal(found.isError, false);
    const body = JSON.parse(found.content[0].text);
    assert.equal(body.id, "acme/sky-1");
    assert.match(body.recommendation, /Part of the protocol/);

    const none: any = await client.callTool({ name: "lookup_device", arguments: { fcc_id: "NOPE-123" } });
    assert.equal(JSON.parse(none.content[0].text).found, false);

    const tooLong: any = await client.callTool({ name: "claim_device", arguments: { id: "acme/sky-1", who: "a", contact: "b", scope: "c", days: 365 } });
    assert.equal(tooLong.isError, true);
    assert.match(tooLong.content[0].text, /90 days/);

    const claim: any = await client.callTool({ name: "claim_device", arguments: { vendor: "Foo", model: "Bar", category: "toy", who: "a", contact: "b", scope: "c" } });
    assert.equal(claim.isError, false, claim.content[0].text);
    assert.match(readFileSync(join(root, "data/devices/foo/bar.yaml"), "utf8"), /who: a/);

    const sources: any = await client.callTool({ name: "list_sources", arguments: {} });
    assert.equal(JSON.parse(sources.content[0].text).curated, 3);
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
});
