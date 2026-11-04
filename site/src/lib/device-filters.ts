// Directory filters: which devices an option keeps, and the filter state in the URL.
// Pure functions, shared by scripts/directory.ts and device-filters.test.ts.
import type { IndexEntry } from "@opendevicedb/core/browser";

export const FILTER_KEYS = ["category", "status", "source", "install", "cloud"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
/** Selected values per filter: any of them may match (OR); every filter must match (AND). */
export type Filters = Record<FilterKey, string[]>;
export interface FilterOption { value: string; label: string }
export interface FilterGroup { key: FilterKey; label: string; placeholder: string; multiple: boolean; options: FilterOption[] }

export const noFilters = (): Filters => ({ category: [], status: [], source: [], install: [], cloud: [] });

export function matchesOption(e: IndexEntry, key: FilterKey, value: string): boolean {
  switch (key) {
    case "category": return e.category === value;
    case "status": return e.status === value;
    case "source": return e.sources.includes(value);
    // "any": the record has an install route at all. "setup-only" also keeps devices needing no cloud.
    case "install": return value === "any" ? !!e.install : e.install === value;
    case "cloud": return e.cloud === "none" || (value === "setup-only" && e.cloud === "setup-only");
  }
}

/** Entries matching every filter. `except` leaves one filter out: an option's count is then the
 *  number of results choosing it would give, with the other filters kept. */
export function filterEntries<T extends IndexEntry>(entries: T[], f: Filters, except?: FilterKey): T[] {
  const keys = FILTER_KEYS.filter((k) => k !== except && f[k].length);
  if (!keys.length) return entries;
  return entries.filter((e) => keys.every((k) => f[k].some((v) => matchesOption(e, k, v))));
}

/** Filters from the URL: known values only, no repeats, one value for single-choice filters. */
export function readFilters(params: URLSearchParams, groups: FilterGroup[]): Filters {
  const f = noFilters();
  for (const g of groups) {
    const known = new Set(g.options.map((o) => o.value));
    const values = [...new Set(params.getAll(g.key))].filter((v) => known.has(v));
    f[g.key] = g.multiple ? values : values.slice(0, 1);
  }
  return f;
}

/** Writes the filters into `params` (repeated keys for several values), keeping everything else. */
export function writeFilters(params: URLSearchParams, f: Filters): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const k of FILTER_KEYS) {
    next.delete(k);
    for (const v of f[k]) next.append(k, v);
  }
  return next;
}

/** How many entries each of a filter's options keeps: one pass, tallying as it goes. */
export function countOptions(entries: IndexEntry[], g: FilterGroup): Map<string, number> {
  const counts = new Map(g.options.map((o) => [o.value, 0]));
  const add = (v: string) => { const n = counts.get(v); if (n !== undefined) counts.set(v, n + 1); };
  if (g.key === "category" || g.key === "status") for (const e of entries) add(e[g.key]);
  else if (g.key === "source") for (const e of entries) for (const s of e.sources) add(s);
  else for (const o of g.options) counts.set(o.value, entries.filter((e) => matchesOption(e, g.key, o.value)).length);
  return counts;
}
