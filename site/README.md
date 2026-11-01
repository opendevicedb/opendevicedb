# site — opendevicedb.org

Static Astro build of the repository: directory, device pages, news, and the JSON API
described in SPEC.md ("Static API"). No client framework; small vanilla-JS modules handle directory search, device
detection, responsive navigation and code copying.

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

## Design and responsive checks

The site follows the OpenDeviceDB Figma “Hifi Desktop” design. Shared colours,
typography, controls and page layouts live in `src/styles/global.css`; the home
and detection pages have their own stylesheets. The navigation collapses below
1100px, and cards, filters and tables adapt below 700px.

Original Figma illustrations are kept in `src/assets/design/` and exported SVGs
in `public/design/`. `DesignImage.astro` uses Astro's image pipeline to serve
WebP variants at appropriate sizes. Fonts and their licenses are hosted in
`public/fonts/`; no external font or script service is loaded.

Build the production site before running the UI checks:

```sh
npm run build
npx playwright install chromium  # unnecessary when /usr/bin/chromium is available
npm run check:ui -w site
```

The Playwright checks cover all page templates at 1920, 820, 390 and 320 pixels,
horizontal overflow, WCAG accessibility checks with axe, mobile/keyboard
navigation, search/filter/pagination state, failed downloads, clipboard copy,
and detection results using simulated browser APIs. Physical device detection
still needs a compatible browser and real hardware. Failure screenshots and
traces go to `/tmp/opendevicedb-ui-results` (override with `ODB_UI_RESULTS`).
Use `ODB_SITE_URL` to check an already running server, or
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to select another Chromium binary.
