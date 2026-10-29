// Checks the built site (site/dist) for problems a successful build doesn't catch:
//   - internal links and assets that point to a file that doesn't exist
//   - <img> without an alt attribute (decorative images use alt="")
//   - pages without exactly one <h1>
// No dependencies. Run after `npm run build`: node site/scripts/check-dist.ts [distDir]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dist = process.argv[2] ?? new URL("../dist", import.meta.url).pathname;
// Files copied verbatim from public/ (e.g. search-engine verification pages) aren't site pages.
const publicDir = new URL("../public", import.meta.url).pathname;
if (!existsSync(dist)) {
  console.error(`No build output at ${dist}. Run "npm run build" first.`);
  process.exit(1);
}

function* htmlFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith(".html")) yield p;
  }
}

/** /devices/ → dist/devices/index.html; /api/index.json → dist/api/index.json */
function resolves(url: string): boolean {
  const path = decodeURIComponent(url.split(/[?#]/)[0]);
  const base = join(dist, path);
  return existsSync(base) && statSync(base).isFile()
    || existsSync(join(base, "index.html"))
    || existsSync(`${base}.html`);
}

const problems: string[] = [];
const checked = new Set<string>(); // each internal URL is resolved once
let pages = 0;

for (const file of htmlFiles(dist)) {
  if (existsSync(join(publicDir, relative(dist, file)))) continue;
  pages++;
  const html = readFileSync(file, "utf8");
  const page = "/" + relative(dist, file).replace(/index\.html$/, "");

  for (const [, url] of html.matchAll(/\s(?:href|src)="(\/(?!\/)[^"]*)"/g)) {
    if (checked.has(url)) continue;
    checked.add(url);
    if (!resolves(url)) problems.push(`${page}: broken link ${url}`);
  }
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(tag)) problems.push(`${page}: <img> without alt: ${tag.slice(0, 80)}`);
  }
  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1 && !page.startsWith("/404")) problems.push(`${page}: ${h1s} <h1> elements (expected 1)`);
}

console.log(`Checked ${pages.toLocaleString("en")} pages and ${checked.size.toLocaleString("en")} internal URLs.`);
if (problems.length) {
  console.error(`${problems.length} problem(s):\n` + problems.slice(0, 50).join("\n"));
  process.exit(1);
}
console.log("No problems found.");
