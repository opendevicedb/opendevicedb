// OKF v0.2 structural conformance, plus non-blocking local link diagnostics.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
const root = fileURLToPath(new URL("../knowledge", import.meta.url));
let errors = 0, concepts = 0;
const fail = (file: string, message: string) => { console.error(`${file}: ${message}`); errors++; };
function visit(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (!entry.isFile() || !file.endsWith(".md")) continue;
    const text = readFileSync(file, "utf8"), frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    try {
      if (entry.name === "index.md") {
        if (frontmatter) {
          const metadata = parse(frontmatter[1]);
          if (dir !== root || metadata?.okf_version !== "0.2" || Object.keys(metadata).length !== 1) fail(file, "Only the bundle-root index may declare okf_version frontmatter");
        }
      } else if (entry.name === "log.md") {
        if (frontmatter) fail(file, "Reserved log files have no frontmatter");
        for (const heading of text.matchAll(/^## (.+)$/gm)) if (!/^\d{4}-\d{2}-\d{2}$/.test(heading[1])) fail(file, "Log date headings must be YYYY-MM-DD");
      } else {
        concepts++;
        const metadata = frontmatter ? parse(frontmatter[1]) : undefined;
        if (typeof metadata?.type !== "string" || !metadata.type.trim()) fail(file, "A concept requires parseable YAML frontmatter with a non-empty type");
      }
    } catch (e) { fail(file, (e as Error).message); }
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1]; if (link.includes(":") || link.startsWith("#")) continue;
      const target = link.split("#")[0];
      if (!existsSync(link.startsWith("/") ? resolve(root, "." + target) : resolve(dirname(file), target))) console.warn(`${file}: unresolved local link ${link}`);
    }
  }
}
visit(root);
console.log(`${concepts} OKF concepts; ${errors} structural error(s)`);
if (errors) process.exitCode = 1;
