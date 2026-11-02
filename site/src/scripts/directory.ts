// Directory search island. Loads /api/index.json lazily (first interaction, or at once when
// the URL already carries a query), then runs core's own `search` in the browser and renders
// one page of results at a time — never the whole index in the DOM. Open device requests
// (/api/wanted.json) are searched along with the devices and badged "👍 N want it".
import { search, wantedToIndexEntry, wantedIssueUrl, type IndexEntry, type WantedEntry } from "@opendevicedb/core/browser";
import { deviceBadges, deviceRowHtml, esc } from "../lib/device-row.ts";

const PAGE = 50;
const root = document.getElementById("directory")!;
const form = root.querySelector<HTMLFormElement>("form")!;
const qEl = form.querySelector<HTMLInputElement>("#q")!;
const list = root.querySelector<HTMLElement>("#results")!;
const count = root.querySelector<HTMLElement>("#count")!;
const pager = root.querySelector<HTMLElement>("#pager")!;
const request = root.querySelector<HTMLElement>("#request")!;
const sourceNames: Record<string, string> = JSON.parse(root.dataset.sources || "{}");
const chips = root.querySelector<HTMLElement>("#active-filters")!;
const filterCount = root.querySelector<HTMLElement>("#filter-count")!;
const resetBtn = root.querySelector<HTMLButtonElement>("#reset-filters")!;
const panelToggle = root.querySelector<HTMLInputElement>("#filters-toggle")!; // opens the mobile panel

// Filters: desktop applies a change at once; on mobile (panel behind a toggle) changes are
// staged until "Apply filters". `applied` is what the results use; the selects may be ahead.
const desktop = window.matchMedia("(min-width: 48rem)");
const select = (id: string) => form.querySelector<HTMLSelectElement>(`#${id}`)!;
const selects = { category: select("category"), status: select("status"), source: select("source"), install: select("install"), cloud: select("cloud") };
type FilterKey = keyof typeof selects;
const applied: Record<FilterKey, string> = { category: "", status: "", source: "", install: "", cloud: "" };
const KEYS = Object.keys(selects) as FilterKey[];
const staged = () => KEYS.some((k) => selects[k].value !== applied[k]);
function applyStaged() {
  for (const k of KEYS) applied[k] = selects[k].value;
  markEdited();
}
function markEdited() {
  for (const k of KEYS) selects[k].closest(".field")!.classList.toggle("edited", selects[k].value !== applied[k]);
}

let index: IndexEntry[] | null = null;
let wantedById = new Map<string, WantedEntry>();
let requestsOnly = 0; // requests for devices not in the directory, appended to the index
let loading: Promise<IndexEntry[]> | null = null;
let page = 1;

function load(): Promise<IndexEntry[]> {
  if (index) return Promise.resolve(index);
  if (!loading) {
    count.textContent = "Loading the index…";
    // Requests are optional: the directory still works if wanted.json is missing.
    const wanted = fetch("/api/wanted.json").then((r) => (r.ok ? r.json() : []), () => []);
    loading = Promise.all([
      fetch("/api/index.json").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      wanted,
    ])
      .then(([data, w]: [IndexEntry[], WantedEntry[]]) => {
        wantedById = new Map(w.map((x) => [x.id, x]));
        const known = new Set(data.map((e) => e.id));
        // Requests for devices not in the directory become searchable entries of their own.
        const extra = w.filter((x) => !known.has(x.id)).map(wantedToIndexEntry);
        requestsOnly = extra.length;
        return (index = [...data, ...extra]);
      })
      .catch((e) => { count.textContent = `Could not load the index (${e.message}).`; loading = null; throw e; });
  }
  return loading;
}

const wantedBadge = (w: WantedEntry) =>
  `<a class="badge wanted" href="${esc(w.url)}" title="Add a 👍 on the request to count yourself in">👍 ${w.votes} want${w.votes === 1 ? "s" : ""} it</a>`;

// Statuses at which a device counts as usable: its request no longer gets a 👍 badge.
const USABLE = new Set(["partial-protocol", "controllable", "open-firmware"]);

function row(e: IndexEntry): string {
  const w = wantedById.get(e.id);
  const html = e.sources.includes("wanted") && w
    ? deviceRowHtml(e, {
        href: w.url,
        category: w.category ?? "uncategorised",
        badges: `<span class="badge neutral">Requested, not in the directory yet</span>${wantedBadge(w)}`,
        meta: [`requested ${w.opened}`],
      })
    : deviceRowHtml(e, {
        badges: deviceBadges(e) + (w && !USABLE.has(e.status) ? wantedBadge(w) : ""),
        meta: [
          e.sources.length > 0 && `from ${e.sources.map((s) => sourceNames[s] ?? s).join(", ")}`,
          e.claims > 0 && `${e.claims} live claim${e.claims > 1 ? "s" : ""}`,
        ],
      });
  return `<li>${html}</li>`;
}

/** Pre-filled request for what was typed: "vendor model…", or a USB vid:pid as identifier. */
function requestUrl(): string {
  const q = qEl.value.trim();
  if (!q) return wantedIssueUrl({});
  if (/^[0-9a-f]{4}:[0-9a-f]{4}$/i.test(q)) return wantedIssueUrl({ identifiers: [`USB: ${q.toLowerCase()}`] });
  const [vendor, ...rest] = q.split(/\s+/);
  return rest.length ? wantedIssueUrl({ vendor, model: rest.join(" ") }) : wantedIssueUrl({ model: q });
}

function syncUrl() {
  const p = new URLSearchParams();
  if (qEl.value.trim()) p.set("q", qEl.value.trim());
  for (const k of KEYS) if (applied[k]) p.set(k, applied[k]);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

function render() {
  if (!index) return;
  const { install: inst, cloud, source: src } = applied;
  // "setup-only" also keeps devices that need no cloud at all (IndexEntry.cloud is the best project's).
  const cloudOk = (e: IndexEntry) => !cloud || e.cloud === "none" || (cloud === "setup-only" && e.cloud === "setup-only");
  const pool = src || inst || cloud
    ? index.filter((e) => (!src || e.sources.includes(src)) && (!inst || (inst === "any" ? !!e.install : e.install === inst)) && cloudOk(e))
    : index;
  const hits = search(pool, qEl.value, {
    category: applied.category || undefined,
    status: (applied.status || undefined) as IndexEntry["status"] | undefined,
    limit: Infinity,
  });
  const pages = Math.max(1, Math.ceil(hits.length / PAGE));
  if (page > pages) page = pages;
  const slice = hits.slice((page - 1) * PAGE, page * PAGE);
  list.innerHTML = slice.length ? slice.map(row).join("") :
    `<li class="empty">Nothing matches. <a href="${esc(requestUrl())}">Request this device</a> so others can add a 👍 and whoever reverse engineers it knows people are waiting. ` +
    `Working on it yourself? <a href="/contribute/#claims">Claim it</a> before you start.</li>`;
  request.hidden = !slice.length || !qEl.value.trim();
  request.innerHTML = `Not the device you are looking for? <a href="${esc(requestUrl())}">Request it</a>.`;
  const devices = index.length - requestsOnly;
  const n = hits.length.toLocaleString("en");
  count.textContent = hits.length === index.length
    ? `${devices.toLocaleString("en")} devices${requestsOnly ? ` and ${requestsOnly} request${requestsOnly === 1 ? "" : "s"}` : ""}`
    : `${n} result${hits.length === 1 ? "" : "s"} (${devices.toLocaleString("en")} devices searched)`;
  pager.innerHTML = pages > 1
    ? `<button class="btn" data-go="${page - 1}" ${page === 1 ? "disabled" : ""}>← Previous</button>` +
      `<span class="muted">Page ${page} of ${pages.toLocaleString("en")}</span>` +
      `<button class="btn" data-go="${page + 1}" ${page === pages ? "disabled" : ""}>Next →</button>`
    : "";
  renderChips();
  syncUrl();
}

/** Active-filter chips (mobile), the count on the Filters button, and Reset. */
function renderChips() {
  const active = KEYS.filter((k) => applied[k]);
  const label = (k: FilterKey) => [...selects[k].options].find((o) => o.value === applied[k])?.dataset.label ?? applied[k];
  chips.innerHTML = active.map((k) =>
    `<button type="button" class="filter-chip" data-clear="${k}" aria-label="Remove filter: ${esc(label(k))}">${esc(label(k))} <span aria-hidden="true">✕</span></button>`,
  ).join("") + (active.length > 1 ? `<button type="button" class="filter-chip clear" data-clear="*">Clear all</button>` : "");
  filterCount.hidden = active.length === 0;
  filterCount.textContent = String(active.length);
  resetBtn.hidden = active.length === 0;
}

function clearFilters(keys: FilterKey[]) {
  for (const k of keys) selects[k].value = "";
  applyStaged();
  update();
}

let timer: number | undefined;
function update(resetPage = true) {
  if (resetPage) page = 1;
  clearTimeout(timer);
  timer = window.setTimeout(() => load().then(render, () => {}), index ? 80 : 0);
}

// Apply filters / Search: apply what's staged and fold the mobile panel away to show the results.
form.addEventListener("submit", (ev) => { ev.preventDefault(); applyStaged(); panelToggle.checked = false; update(); });
qEl.addEventListener("input", () => update());
for (const el of Object.values(selects)) {
  el.addEventListener("change", () => {
    if (desktop.matches) { applyStaged(); update(); } else markEdited();
  });
}
chips.addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-clear]");
  if (!b) return;
  const k = b.dataset.clear!;
  clearFilters(k === "*" ? KEYS : [k as FilterKey]);
});
resetBtn.addEventListener("click", () => clearFilters(KEYS));
// Rotating a tablet to desktop width hides the Apply button: apply anything still staged.
desktop.addEventListener("change", (ev) => {
  if (ev.matches && staged()) { applyStaged(); update(); }
});
qEl.addEventListener("focus", () => { load().catch(() => {}); }, { once: true });
pager.addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-go]");
  if (!b || b.disabled) return;
  page = Number(b.dataset.go);
  update(false);
  root.scrollIntoView({ block: "start" });
});

// Restore state from the URL (links from the home page, category links on device pages).
const params = new URLSearchParams(location.search);
const setIf = (el: HTMLInputElement | HTMLSelectElement, k: string) => { const v = params.get(k); if (v !== null) el.value = v; };
setIf(qEl, "q");
for (const k of KEYS) setIf(selects[k], k);
applyStaged();
renderChips(); // chips depend only on the URL, so show them before the index loads
page = Math.max(1, Number(params.get("page")) || 1);
if ([...params.keys()].length) update(false);
