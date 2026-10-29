# site — opendevicedb.org

Static Astro build of the repository: directory, device pages, news, and the JSON API
described in SPEC.md ("Static API"). No client framework; one small vanilla-JS island
(`src/scripts/directory.ts`) for search.

```sh
npm run dev -w site       # http://localhost:4321
npm run build -w site     # -> site/dist
npm run preview -w site
```

`ODB_REPO=<path>` builds from another repository root (same variable as the MCP server).

## How it is put together

- **Data**: `src/lib/data.ts` calls `@opendevicedb/core` (`loadAll`, `loadSnapshots`,
  `toIndexEntry`, …) once per build. Core ships TypeScript source; Vite bundles it
  (`ssr.noExternal`). Because core's `REPO_ROOT` comes from `import.meta.url`, which is wrong
  once core is bundled, the site passes the repo root through `__ODB_ROOT__`.
- **Search**: the directory loads `/api/index.json` on first interaction and runs core's own
  `search()` in the browser, 50 results per page. core's `index.ts` imports `node:fs`, `yaml`
  and `ajv` at module level, so `astro.config.mjs` swaps those for a stub in the client
  build only (the client bundle is ~4 KB). Splitting core's pure functions into their own
  module would make that stub unnecessary.
- **Per-device JSON** (`/api/devices/<vendor>/<model>.json`) is written by the
  `src/integrations/device-json.ts` integration at `astro:build:done` (plain file writes),
  and served by a middleware in `astro dev`. `/api/index.json` and `/api/sources.json` are
  ordinary endpoints. `/api/sources.json` has the same shape as the MCP server's `list_sources`.
- **News**: content collection over the repository's `news/*.md`. Drafts are shown with a
  "draft" badge (prototype).

## Scale: one HTML page per record

Every record, imported or curated, gets a pre-rendered page. Measured with the dev-only
generator (`scripts/gen-fake-data.ts`, 20,003 records over three fake snapshots) on a
12-core laptop: **45–54 s** for the whole build (20k HTML pages + 20k JSON files, 40k files;
`build.concurrency: 4`). As Astro endpoints, the 20k JSON routes alone cost ~35 s, hence
the integration. If the data grows far past ~50k records, pre-render only curated records
and records with more than one source, and render the rest client-side from the JSON API.

```sh
node site/scripts/gen-fake-data.ts /tmp/odb-fake 20000   # never commit the output
ODB_REPO=/tmp/odb-fake ODB_TIMING=1 npm run build -w site
```

## Design system

The look comes from the Figma file "OpenDeviceDB Code". `src/styles/global.css` is still the
only stylesheet:

- **Tokens** are custom properties that mirror the Figma variables: primitives
  (`--purple-800`, `--radius-2xl`) and semantic tokens (`--color-bg-surface`,
  `--space-card-padding`, `--text-heading-1`). Responsive tokens take their mobile value by
  default and their desktop value from `48rem`.
- **Fonts** are self-hosted in `public/fonts` (Geist and Geist Mono, OFL). The display face is
  Technor (Indian Type Foundry, via Fontshare). Its files are **not committed** until its license
  for a public repository is confirmed; headings fall back to Geist.
- **Icons** are inline SVG paths from Hugeicons (MIT) in `src/lib/icons.ts`, rendered by
  `components/Icon.astro`. The directory script imports only `lib/icons-device.ts`.
- **Images** are WebP in `public/images`.
- **Scripts** stay vanilla: `scripts/code.ts` adds Copy buttons and edge fades to code blocks.
  The menus (`<details>`) and the mobile filter panel (checkbox toggle) work without JS.
