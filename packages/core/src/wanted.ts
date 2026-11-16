// Device requests ("wanted"): GitHub issues opened from .github/ISSUE_TEMPLATE/wanted.yml.
// One issue = one request; 👍 reactions = more people interested. See SPEC.md "Requests".
// Browser-safe: parsing, grouping and matching are pure; fetchWanted only needs fetch().
import { makeId, compact, search, type IndexEntry, type DeviceRecord } from "./browser.ts";

export const ODB_REPO = "opendevicedb/opendevicedb";
export const ODB_REPO_URL = `https://github.com/${ODB_REPO}`;
export const WANTED_LABEL = "wanted";
export const WANTED_TEMPLATE = "wanted.yml";

/** One request issue. `votes` counts the author plus every 👍. */
export interface WantedRequest {
  issue: number;
  url: string;
  title: string;
  opened: string;
  id: string;
  vendor: string;
  model: string;
  category?: string;
  identifiers: string[];
  votes: number;
}

/** Requests for the same device id, grouped (duplicates add up). Published as /api/wanted.json. */
export interface WantedEntry {
  id: string;
  vendor: string;
  model: string;
  category?: string;
  identifiers: string[];
  votes: number;
  /** Oldest open request: where to add a 👍. */
  url: string;
  issues: number[];
  opened: string;
}

const NO_RESPONSE = /^_?no response_?$/i;

/** Issue-form body ("### Label\n\nvalue") → { label: value }. */
export function parseIssueForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = (body ?? "").replace(/\r\n/g, "\n").split(/^### +(.+)$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const v = parts[i + 1].trim();
    out[parts[i].trim().toLowerCase()] = NO_RESPONSE.test(v) ? "" : v;
  }
  return out;
}

/** "FCC ID: 2ABCD-X\nUSB 2ca3:001f, BLE: Foo" → ["2ABCD-X", "2ca3:001f", "Foo"] (labels dropped). */
export function parseIdentifiers(text: string): string[] {
  return (text ?? "").split(/[\n,;]+/)
    .map((s) => s.replace(/^\s*[-*]?\s*(fcc(\s*id)?|usb(\s*(vid:pid|id))?|ble(\s*name)?|bluetooth(\s*name)?|zigbee(\s*model)?|sku|chips?)\s*[:=]?\s+/i, "").trim())
    .filter((s) => s && !NO_RESPONSE.test(s));
}

interface GitHubIssue {
  number: number;
  html_url: string;
  title: string;
  body?: string | null;
  created_at: string;
  reactions?: { "+1"?: number };
  pull_request?: unknown;
}

/** A request issue → WantedRequest, or null when vendor/model are missing or unusable. */
export function parseWantedIssue(issue: GitHubIssue): WantedRequest | null {
  if (issue.pull_request) return null;
  const f = parseIssueForm(issue.body ?? "");
  const vendor = (f["vendor"] ?? "").split("\n")[0].trim();
  const model = (f["model"] ?? "").split("\n")[0].trim();
  if (!vendor || !model) return null;
  const id = makeId(vendor, model);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return null;
  const category = (f["category"] ?? "").trim();
  return {
    issue: issue.number,
    url: issue.html_url,
    title: issue.title,
    opened: issue.created_at.slice(0, 10),
    id, vendor, model,
    ...(category && category !== "other / not sure" ? { category } : {}),
    identifiers: parseIdentifiers(f["identifiers"] ?? ""),
    votes: 1 + (issue.reactions?.["+1"] ?? 0),
  };
}

/** Group requests by device id, most wanted first. */
export function groupWanted(requests: WantedRequest[]): WantedEntry[] {
  const byId = new Map<string, WantedEntry>();
  for (const r of [...requests].sort((a, b) => a.issue - b.issue)) {
    const e = byId.get(r.id);
    if (!e) {
      byId.set(r.id, {
        id: r.id, vendor: r.vendor, model: r.model, ...(r.category ? { category: r.category } : {}),
        identifiers: [...r.identifiers], votes: r.votes, url: r.url, issues: [r.issue], opened: r.opened,
      });
      continue;
    }
    e.votes += r.votes;
    e.issues.push(r.issue);
    e.identifiers = [...new Set([...e.identifiers, ...r.identifiers])];
    if (!e.category && r.category) e.category = r.category;
  }
  return [...byId.values()].sort((a, b) => b.votes - a.votes || a.opened.localeCompare(b.opened) || a.id.localeCompare(b.id));
}

/** A wanted entry shaped like an index entry, so core `search` ranks it with the devices. */
export function wantedToIndexEntry(w: WantedEntry): IndexEntry {
  return {
    id: w.id, vendor: w.vendor, model: w.model, aliases: [], category: w.category ?? "other",
    status: "unknown", sources: [WANTED_LABEL], identifiers: { sku: w.identifiers },
    claims: 0, verified: false, updated: w.opened,
  };
}

export interface WantedQuery { id?: string; vendor?: string; model?: string; identifiers?: string[] }

/** The request matching a device: same id, a shared identifier, or (fuzzy) a close name. */
export function matchWanted(wanted: WantedEntry[], q: WantedQuery, fuzzy = true): WantedEntry | null {
  const id = q.id ?? (q.vendor && q.model ? makeId(q.vendor, q.model) : undefined);
  if (id) { const hit = wanted.find((w) => w.id === id); if (hit) return hit; }
  const ids = (q.identifiers ?? []).map(compact).filter(Boolean);
  if (ids.length) {
    const hit = wanted.find((w) => w.identifiers.some((x) => ids.includes(compact(x))));
    if (hit) return hit;
  }
  if (!fuzzy || !q.model) return null;
  const best = search(wanted.map(wantedToIndexEntry), `${q.vendor ?? ""} ${q.model}`, { limit: 1 })[0];
  return best && best.score >= 20 ? wanted.find((w) => w.id === best.id) ?? null : null;
}

/** Same id, or a unique match on a device identifier. Shared chips do not identify a product. */
export function recordForRequest(records: DeviceRecord[], r: Pick<WantedRequest, "id" | "identifiers">): DeviceRecord | null {
  const byId = records.find((x) => x.id === r.id);
  if (byId) return byId;
  const ids = r.identifiers.map(compact).filter((x) => x.length >= 4);
  if (!ids.length) return null;
  const matches = records.filter((x) => Object.entries(x.identifiers ?? {})
    .filter(([kind]) => kind !== "chips")
    .some(([, values]) => values?.some((v) => ids.includes(compact(v)))));
  // USB IDs, SKUs and advertised names can cover multiple products. Do not
  // choose one arbitrarily or close a request using an ambiguous match.
  return matches.length === 1 ? matches[0] : null;
}

/** Link to a new request issue, pre-filled (GitHub issue forms read field ids from the query). */
export function wantedIssueUrl(q: { vendor?: string; model?: string; identifiers?: string[]; goal?: string }, repoUrl = ODB_REPO_URL): string {
  const p = new URLSearchParams({ template: WANTED_TEMPLATE });
  const name = [q.vendor, q.model].filter(Boolean).join(" ").trim();
  p.set("title", `Wanted: ${name || "<vendor> <model>"}`);
  if (q.vendor) p.set("vendor", q.vendor);
  if (q.model) p.set("model", q.model);
  if (q.identifiers?.length) p.set("identifiers", q.identifiers.join("\n"));
  if (q.goal) p.set("goal", q.goal);
  return `${repoUrl}/issues/new?${p}`;
}

/** All open request issues of the repository (GitHub REST, paginated). */
export async function fetchWanted(opts: { repo?: string; token?: string; fetch?: typeof fetch } = {}): Promise<WantedRequest[]> {
  const f = opts.fetch ?? fetch;
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "opendevicedb" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const out: WantedRequest[] = [];
  for (let page = 1; page <= 50; page++) {
    const url = `https://api.github.com/repos/${opts.repo ?? ODB_REPO}/issues?labels=${WANTED_LABEL}&state=open&per_page=100&page=${page}`;
    const res = await f(url, { headers });
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
    const batch: GitHubIssue[] = await res.json();
    for (const i of batch) { const r = parseWantedIssue(i); if (r) out.push(r); }
    if (batch.length < 100) break;
  }
  return out;
}
