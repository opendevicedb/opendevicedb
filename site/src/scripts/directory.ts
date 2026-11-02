// Directory search island. Loads /api/index.json lazily (first interaction, or at once when
// the URL already carries a query), then runs core's own `search` in the browser and renders
// one page of results at a time — never the whole index in the DOM. Open device requests
// (/api/wanted.json) are searched along with the devices and badged "👍 N want it".
import { search, wantedToIndexEntry, wantedIssueUrl, type IndexEntry, type WantedEntry } from "@opendevicedb/core/browser";
import { deviceBadges, deviceRowHtml, esc } from "../lib/device-row.ts";
import { FILTER_KEYS, countOptions, filterEntries, readFilters, writeFilters, type FilterGroup, type FilterKey, type Filters } from "../lib/device-filters.ts";

const PAGE = 50;
const root = document.getElementById("directory")!;
const form = root.querySelector<HTMLFormElement>("form")!;
const qEl = form.querySelector<HTMLInputElement>("#q")!;
const list = root.querySelector<HTMLElement>("#results")!;
const count = root.querySelector<HTMLElement>("#count")!;
const pager = root.querySelector<HTMLElement>("#pager")!;
const request = root.querySelector<HTMLElement>("#request")!;
const sourceNames: Record<string, string> = JSON.parse(root.dataset.sources || "{}");
const groups: FilterGroup[] = JSON.parse(root.dataset.groups || "[]");
const groupOf = (k: FilterKey) => groups.find((g) => g.key === k)!;
const optionLabel = (k: FilterKey, v: string) => groupOf(k).options.find((o) => o.value === v)?.label ?? v;

// Filters apply as they change, on every screen size. Desktop: a dropdown per filter. Phones:
// chips + a bottom sheet (#filter-sheet). Both hold the same FilterOptions, kept in step here.
const chips = root.querySelector<HTMLElement>("#active-filters")!;
const filterCount = root.querySelector<HTMLElement>("#filter-count")!;
const resetBtns = root.querySelectorAll<HTMLButtonElement>(".reset-filters");
const openBtn = root.querySelector<HTMLButtonElement>("#filters-open")!;
const sheet = root.querySelector<HTMLDialogElement>("#filter-sheet")!;
const desktop = window.matchMedia("(min-width: 48rem)");
let applied: Filters = readFilters(new URLSearchParams(location.search), groups);
const activeCount = () => FILTER_KEYS.reduce((n, k) => n + applied[k].length, 0);

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
  if (page > 1) p.set("page", String(page));
  const qs = writeFilters(p, applied).toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

function render() {
  if (!index) return;
  const searched = search(index, qEl.value, { limit: Infinity });
  const hits = filterEntries(searched, applied);
  renderCounts(searched, hits.length);
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
  syncUrl();
}

/** Each option's count: the results choosing it would give, with the other filters kept. */
function renderCounts(searched: IndexEntry[], results: number) {
  for (const g of groups) {
    const counts = countOptions(filterEntries(searched, applied, g.key), g);
    for (const o of g.options) {
      const n = counts.get(o.value) ?? 0;
      for (const el of root.querySelectorAll<HTMLElement>(`.fopts[data-key="${g.key}"] .fopt-count[data-value="${CSS.escape(o.value)}"]`)) {
        el.textContent = n.toLocaleString("en");
        el.closest(".fopt")!.classList.toggle("zero", n === 0);
      }
    }
  }
  root.querySelector("#sheet-show")!.textContent = `Show ${results.toLocaleString("en")} ${results === 1 ? "device" : "devices"}`;
  root.querySelectorAll<HTMLFieldSetElement>(".fopts").forEach(refreshList);
}

/** Which options a list shows: those matching the find box that would still give results, plus
 *  any ticked one (so it can be unticked). Says so when nothing is left. */
function refreshList(fs: HTMLFieldSetElement) {
  const q = fs.querySelector<HTMLInputElement>(".fopts-find")?.value.trim().toLowerCase() ?? "";
  let shown = 0;
  for (const opt of fs.querySelectorAll<HTMLElement>(".fopt[data-find]")) {
    const ticked = opt.querySelector("input")!.checked;
    opt.hidden = !opt.dataset.find!.includes(q) || (opt.classList.contains("zero") && !ticked);
    if (!opt.hidden) shown++;
  }
  const none = fs.querySelector<HTMLElement>(".fopts-none")!;
  none.hidden = shown > 0;
  none.textContent = q ? "No options match." : "No other options for these results.";
}

/** Puts `applied` into every control: checkboxes in both copies, dropdown labels, chips, counts. */
function renderFilters() {
  for (const fs of root.querySelectorAll<HTMLFieldSetElement>(".fopts")) {
    const values = applied[fs.dataset.key as FilterKey];
    for (const input of fs.querySelectorAll<HTMLInputElement>("input[type=checkbox], input[type=radio]")) {
      input.checked = input.value ? values.includes(input.value) : !values.length;
    }
    fs.querySelector<HTMLElement>(".fopts-clear")!.hidden = !values.length;
    refreshList(fs);
  }
  for (const g of groups) {
    const values = applied[g.key];
    const fsel = root.querySelector<HTMLElement>(`.fsel[data-key="${g.key}"]`)!;
    fsel.classList.toggle("active", values.length > 0);
    fsel.querySelector(".fsel-value")!.textContent =
      !values.length ? g.placeholder : values.length === 1 ? optionLabel(g.key, values[0]) : `${values.length} selected`;
    root.querySelector(`.sheet-group-count[data-key="${g.key}"]`)!.textContent = values.length ? ` (${values.length})` : "";
  }
  chips.innerHTML = FILTER_KEYS.flatMap((k) => applied[k].map((v) =>
    `<button type="button" class="filter-chip" data-key="${k}" data-value="${esc(v)}" aria-label="Remove filter: ${esc(optionLabel(k, v))}">${esc(optionLabel(k, v))} <span aria-hidden="true">✕</span></button>`,
  )).join("");
  const n = activeCount();
  filterCount.hidden = n === 0;
  filterCount.textContent = String(n);
  root.querySelector("#sheet-count")!.textContent = n ? ` (${n})` : "";
  for (const b of resetBtns) b.hidden = n === 0;
}

function setFilter(k: FilterKey, values: string[]) {
  applied = { ...applied, [k]: values };
  renderFilters();
  update();
}

let timer: number | undefined;
function update(resetPage = true) {
  if (resetPage) page = 1;
  clearTimeout(timer);
  timer = window.setTimeout(() => load().then(render, () => {}), index ? 80 : 0);
}

form.addEventListener("submit", (ev) => { ev.preventDefault(); update(); });
qEl.addEventListener("input", () => update());

// A choice in either copy of a filter's options.
root.addEventListener("change", (ev) => {
  const input = ev.target as HTMLInputElement;
  const fs = input.closest<HTMLFieldSetElement>(".fopts");
  if (!fs || input.classList.contains("fopts-find")) return;
  const k = fs.dataset.key as FilterKey;
  setFilter(k, groupOf(k).multiple
    ? [...fs.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")].map((i) => i.value)
    : input.value ? [input.value] : []);
});
root.addEventListener("click", (ev) => {
  const t = ev.target as HTMLElement;
  const clear = t.closest<HTMLButtonElement>(".fopts-clear");
  if (clear) return setFilter(clear.dataset.clear as FilterKey, []);
  const chip = t.closest<HTMLButtonElement>(".filter-chip");
  if (chip) return setFilter(chip.dataset.key as FilterKey, applied[chip.dataset.key as FilterKey].filter((v) => v !== chip.dataset.value));
  if (t.closest(".reset-filters")) { applied = readFilters(new URLSearchParams(), groups); renderFilters(); update(); }
});
// Long lists: narrow the options to those whose label contains what was typed (see refreshList).
root.addEventListener("input", (ev) => {
  const find = ev.target as HTMLInputElement;
  if (!find.classList.contains("fopts-find")) return;
  refreshList(find.closest<HTMLFieldSetElement>(".fopts")!);
});

// Desktop dropdowns: one open at a time; outside click, Escape or tabbing away closes it.
function closeDropdowns(except?: HTMLElement) {
  for (const fsel of root.querySelectorAll<HTMLElement>(".fsel")) {
    if (fsel === except) continue;
    fsel.querySelector(".fsel-trigger")!.setAttribute("aria-expanded", "false");
    fsel.querySelector<HTMLElement>(".fsel-panel")!.hidden = true;
  }
}
for (const fsel of root.querySelectorAll<HTMLElement>(".fsel")) {
  const trigger = fsel.querySelector<HTMLButtonElement>(".fsel-trigger")!;
  const panel = fsel.querySelector<HTMLElement>(".fsel-panel")!;
  trigger.addEventListener("click", () => {
    const open = panel.hidden;
    closeDropdowns(fsel);
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) load().then(render, () => {}); // live counts need the index
  });
  fsel.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !panel.hidden) { ev.stopPropagation(); closeDropdowns(); trigger.focus(); }
  });
  // Tabbing away closes it. A click on an option's text moves focus nowhere (relatedTarget is
  // null): that must not close it, or the click never lands. Outside clicks: pointerdown below.
  fsel.addEventListener("focusout", (ev) => {
    const to = ev.relatedTarget as Node | null;
    if (to && !fsel.contains(to)) closeDropdowns();
  });
}
document.addEventListener("pointerdown", (ev) => { if (!(ev.target as Element).closest(".fsel")) closeDropdowns(); });

// Mobile sheet: a modal <dialog>. The page behind doesn't scroll; closing returns focus.
openBtn.addEventListener("click", () => {
  sheet.showModal();
  document.documentElement.style.overflow = "hidden";
  load().then(render, () => {});
});
sheet.addEventListener("close", () => { document.documentElement.style.overflow = ""; openBtn.focus(); });
sheet.addEventListener("click", (ev) => {
  const t = ev.target as HTMLElement;
  if (t === sheet || t.closest(".sheet-close, .sheet-show")) sheet.close(); // backdrop, ×, "Show N devices"
});
desktop.addEventListener("change", (ev) => { if (ev.matches && sheet.open) sheet.close(); });
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
qEl.value = params.get("q") ?? "";
renderFilters(); // labels and chips depend only on the URL, so show them before the index loads
page = Math.max(1, Number(params.get("page")) || 1);
if ([...params.keys()].length) update(false);
