// Source declarations, not DeviceRecords: a quirk section may identify a mode,
// receiver, family or component rather than a retail device.
import { githubRaw, mapLimit } from "./lib.ts";

export const FWUPD_REPO = "fwupd/fwupd";
export const FWUPD_SAMPLE_PLUGINS = ["logitech-hidpp", "steelseries", "uf2"] as const;

export interface QuirkProperty { key: string; value: string; line: number }
export interface FwupdDeclaration {
  plugin: string;
  path: string;
  line: number;
  instance_id: string;
  namespace?: string;
  properties: QuirkProperty[];
  source_url: string;
  documentation_url: string;
}
export interface FwupdIndex {
  schema_version: 1;
  kind: "fwupd-quirk-declarations";
  repository: string;
  revision: string;
  upstream_license_url: string;
  scope: string[];
  declarations: FwupdDeclaration[];
}

export function checkFwupdRevision(revision: string): void {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("fwupd revision must be a full lowercase commit SHA");
}

/** Keep each section occurrence and property in source order, including duplicates.
 * Do not evaluate fwupd inheritance, flags or GUID matching, or infer names from comments.
 * Unknown syntax fails instead of silently dropping source data.
 */
export function parseFwupdQuirks(text: string, path: string, revision: string): FwupdDeclaration[] {
  checkFwupdRevision(revision);
  const plugin = path.match(/^plugins\/([a-z0-9-]+)\/[a-z0-9-]+\.quirk$/)?.[1];
  if (!plugin) throw new Error(`Unexpected fwupd quirk path: ${path}`);
  const base = `https://github.com/${FWUPD_REPO}/blob/${revision}`;
  const out: FwupdDeclaration[] = [];
  let current: FwupdDeclaration | undefined;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const heading = line.match(/^\[([^\[\]]+)\]$/);
    if (heading) {
      const instance = heading[1];
      const namespace = instance.match(/^([A-Z][A-Z0-9_]*)\\/)?.[1];
      current = {
        plugin, path, line: i + 1, instance_id: instance,
        ...(namespace ? { namespace } : {}), properties: [],
        source_url: `${base}/${path}#L${i + 1}`,
        documentation_url: `${base}/plugins/${plugin}/README.md`,
      };
      out.push(current);
      continue;
    }
    const property = line.match(/^([^=\s]+)\s*=\s*(.*)$/);
    if (!current || !property) throw new Error(`Unsupported fwupd quirk syntax at ${path}:${i + 1}`);
    current.properties.push({ key: property[1], value: property[2], line: i + 1 });
  }
  return out;
}

/** Values stay raw: e.g. a comma-separated CounterpartGuid is not a device merge. */
export const fwupdPropertyValues = (entry: FwupdDeclaration, key: string): string[] =>
  entry.properties.filter((p) => p.key === key).map((p) => p.value);

/** Exact source-instance lookup. No bare VID/PID, prefix, inheritance or GUID matching. */
export const findFwupdDeclarations = (index: FwupdIndex, instance: string): FwupdDeclaration[] =>
  index.declarations.filter((entry) => entry.instance_id === instance);

/** A reviewed three-plugin sample. Every network read uses the same immutable revision. */
export async function buildFwupdSampleIndex(revision: string, read = githubRaw): Promise<FwupdIndex> {
  checkFwupdRevision(revision);
  const files = await mapLimit(FWUPD_SAMPLE_PLUGINS, 3, async (plugin) => {
    const path = `plugins/${plugin}/${plugin}.quirk`;
    return parseFwupdQuirks(await read(FWUPD_REPO, revision, path), path, revision);
  });
  return {
    schema_version: 1, kind: "fwupd-quirk-declarations", repository: FWUPD_REPO,
    revision, upstream_license_url: `https://github.com/${FWUPD_REPO}/blob/${revision}/COPYING`,
    scope: [...FWUPD_SAMPLE_PLUGINS], declarations: files.flat(),
  };
}
