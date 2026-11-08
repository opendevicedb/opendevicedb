// npm run fwupd:index -- <immutable-fwupd-sha> <output.json>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REPO_ROOT } from "@opendevicedb/core";
import { buildFwupdSampleIndex } from "./fwupd-index.ts";

const [revision, output, ...extra] = process.argv.slice(2);
if (!revision || !output || extra.length) {
  console.error("usage: npm run fwupd:index -- <40-character-fwupd-sha> <output.json>");
  process.exit(2);
}
try {
  const index = await buildFwupdSampleIndex(revision);
  // Fetch and parse everything before touching the output; failures preserve it.
  const destination = resolve(REPO_ROOT, output);
  mkdirSync(dirname(destination), { recursive: true });
  const { declarations, ...metadata } = index;
  const head = JSON.stringify(metadata, null, 1).slice(0, -2);
  const json = `${head},\n "declarations": [\n${declarations.map((d) => "  " + JSON.stringify(d)).join(",\n")}\n ]\n}\n`;
  writeFileSync(destination, json);
  console.log(`${index.declarations.length} source declarations written to ${destination}`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
