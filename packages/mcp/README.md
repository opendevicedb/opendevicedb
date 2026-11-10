# @opendevicedb/mcp

MCP server that lets AI agents (Claude Code, Codex, Cursor, REA…) ask OpenDeviceDB
**before** reverse engineering a device — "has this been done already, is someone on it?" —
and record their work **after**. Stdio transport, official `@modelcontextprotocol/sdk`.

Requires Node ≥ 22.18 (runs the `.ts` sources directly, no build step) and a checkout of
this repository with `npm install` done at its root.

## Tools

Component discovery and integration also expose `search_components`, `get_component`,
`inspect_component`, `validate_composition`, `resolve_composition`,
`get_integration_guide` and `prepare_app_export`. These tools are read-only and
never run contributor code or access hardware. See the
[pilot contracts and integration guide](../../knowledge/implementation/component-pilot.md).
Desktop export currently reports preparation blockers; it does not return an
installable application.

| tool | use it to |
|---|---|
| `lookup_device(id?, vendor?, model?, fcc_id?, usb?, ble_name?, zigbee_model?)` | check one device: full record, effective status, live claims and a one-line recommendation; says explicitly when nothing is known |
| `search_devices(query, category?, status?, limit?)` | explore: ranked matches over names, aliases and identifiers (with the easiest `install` difficulty when there is one) |
| `claim_device(id? \| vendor+model, category?, who, contact, scope, days=30)` | announce you are working on it (max 90 days); creates a stub record if needed |
| `publish_findings(id, patch, allow_downgrade?, release_claim_of?)` | merge your results into the record (validated, status only moves forward, policy-screened) |
| `request_device(vendor, model, fcc_id?, usb?, ble_name?, zigbee_model?, goal?)` | your user wants the device but will not reverse engineer it: the existing request to add a 👍 to, or a pre-filled link to a new public GitHub issue they submit themselves (read-only, never posts) |
| `list_sources()` | imported databases with license, snapshot date and record count, plus the curated count |

**Install routes.** A record may carry `install`: ways to put its open firmware or software on
the device (method such as `web-serial`, `ota-exploit`, `usb-bootloader`, `pairing`; the
project's official `guide` and `installer`; `difficulty`; `tools`; `opens_device`,
`mains_powered`, `brick_risk`, `reversible`/`revert`, `firmware_constraints`). `lookup_device`
returns them in `record.install` and its recommendation tells the agent to walk the user
through the easiest one with the official guide (never step by step when a mains-powered device
must be opened); `search_devices` gives the easiest `difficulty` as `install`; `publish_findings`
accepts routes in `patch.install`, merged by method + guide. Nothing is flashed or hosted here.

Writes go to `data/devices/<vendor>/<model>.yaml` in the local checkout. The server never
runs git: each write result names the changed file and gives the next step
(`git checkout -b … && git add … && git commit … && gh pr create --fill`).

## Backends (environment)

| variable | effect |
|---|---|
| `ODB_REPO=/path/to/opendevicedb` | local checkout: reads curated + imported records, **writes allowed** |
| `ODB_API_URL=https://…` | read-only: the site's static API (`/api/index.json`, `/api/devices/<id>.json`), cached 10 min; claim/publish return an error asking for `ODB_REPO` |
| neither | the checkout this package lives in (same as `ODB_REPO` pointing at it) |

`ODB_REPO` wins when both are set.

## Register it

Replace `/path/to/opendevicedb` with your checkout.

**Claude Code**

```sh
claude mcp add opendevicedb -e ODB_REPO=/path/to/opendevicedb -- node /path/to/opendevicedb/packages/mcp/src/server.ts
```

(`--scope user` to have it in every project.)

**Codex** (`~/.codex/config.toml`, or `codex mcp add opendevicedb -- node …/server.ts`)

```toml
[mcp_servers.opendevicedb]
command = "node"
args = ["/path/to/opendevicedb/packages/mcp/src/server.ts"]
env = { ODB_REPO = "/path/to/opendevicedb" }
```

**Cursor** (`.cursor/mcp.json` in a project, or `~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "opendevicedb": {
      "command": "node",
      "args": ["/path/to/opendevicedb/packages/mcp/src/server.ts"],
      "env": { "ODB_REPO": "/path/to/opendevicedb" }
    }
  }
}
```

Read-only use without a checkout of your own data: set `ODB_API_URL` to the site's base URL
instead of `ODB_REPO`.

## Agent workflow

1. **lookup** — `lookup_device` with whatever is on the label (FCC id, USB vid:pid from
   `lsusb`, BLE name) or vendor + model. Follow the recommendation: if open firmware or an
   SDK exists, use it; if someone holds a live claim, contact them.
   Nothing known and your user only wants the device to exist? Give them the request link
   (`request` / `request_url` in the lookup result, or `request_device`) so the interest counts.
2. **claim** — nothing known (or only part)? `claim_device` with who/contact/scope before
   starting, then commit the file and open the PR so the claim is visible to others.
3. **work** — reverse engineer. Never touch Remote ID, geofencing or other safety
   functions; never copy firmware images or vendor code ([POLICY.md](../../POLICY.md)).
4. **publish** — `publish_findings` with summary, status, interfaces (link your protocol
   doc as `spec`), projects (your code, hosted elsewhere), install routes, verification and
   `provenance.ai_assisted`. Pass `release_claim_of` to end your claim.
5. **PR** — run the git / `gh pr create` command from the result. Maintainers review.

[SKILL.md](SKILL.md) is the same workflow as an agent skill, ready to drop into a skills
directory (or embed in another tool).

## CLI

The same functions from a shell (same env vars), printing the tool result as JSON:

```sh
node src/cli.ts lookup --vendor DJI --model "Neo 2"
node src/cli.ts lookup --usb 2ca3:001f
node src/cli.ts search tello --category drone
node src/cli.ts claim --vendor Acme --model "X1" --category toy --who alice --contact @alice --scope "BLE control" --days 30
node src/cli.ts publish acme/x1 --patch '{"status":"partial-protocol","summary":"…"}'   # or --patch-file findings.json
node src/cli.ts sources
```

## Development

```sh
npm test -w @opendevicedb/mcp   # node:test; uses temporary fake repositories, plus a stdio end-to-end test
npm run mcp                     # from the repo root: start the server on stdio
```

Code: AGPL-3.0-or-later (see the repository LICENSE). `SKILL.md` alone is CC0-1.0 so other tools can embed it.
