// Directory search island. Loads /api/index.json lazily (first interaction, or at once when
// the URL already carries a query), then runs core's own `search` in the browser and renders
// one page of results at a time — never the whole index in the DOM. Open device requests
// (/api/wanted.json) are searched along with the devices and badged "👍 N want it".
import { search, wantedToIndexEntry, wantedIssueUrl, type IndexEntry, type WantedEntry } from "@opendevicedb/core/browser";
import { STATUS_LABEL, displayName } from "../lib/config.ts";

const PAGE = 50;
const root = document.getElementById("directory")!;
const form = root.querySelector<HTMLFormElement>("form")!;
const qEl = form.querySelector<HTMLInputElement>("#q")!;
const catEl = form.querySelector<HTMLSelectElement>("#category")!;
const stEl = form.querySelector<HTMLSelectElement>("#status")!;
const srcEl = form.querySelector<HTMLSelectElement>("#source")!;
const instEl = form.querySelector<HTMLSelectElement>("#install")!;
const cloudEl = form.querySelector<HTMLSelectElement>("#cloud")!;
const list = root.querySelector<HTMLElement>("#results")!;
const count = root.querySelector<HTMLElement>("#count")!;
const pager = root.querySelector<HTMLElement>("#pager")!;
const request = root.querySelector<HTMLElement>("#request")!;
const sourceNames: Record<string, string> = JSON.parse(root.dataset.sources || "{}");

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

const INSTALL_LABEL: Record<string, string> = { easy: "Install: easy", medium: "Install: medium", hard: "Install: hard" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const wantedBadge = (w: WantedEntry) =>
  `<a class="badge wanted" href="${esc(w.url)}" title="Add a 👍 on the request to count yourself in">👍 ${w.votes} want${w.votes === 1 ? "s" : ""} it</a>`;

const icon = (name: string, size = 24) => `<img class="icon" src="/design/${name}.svg" width="${size}" height="${size}" alt="" aria-hidden="true" loading="lazy">`;

function row(e: IndexEntry): string {
  const w = wantedById.get(e.id);
  if (e.sources.includes("wanted") && w) {
    return `<li><div class="dev-row"><a class="name" href="${esc(w.url)}">${icon("catalogue-DishWasher")}${esc(displayName(e.vendor, e.model))}</a>` +
      `<span class="row"><span class="badge neutral">Requested, not in the directory yet</span>${wantedBadge(w)}</span>` +
      `<span class="meta">${esc(w.category ?? "uncategorised")} · <span class="mono">${esc(e.id)}</span> · requested ${esc(w.opened)}</span></div></li>`;
  }
  const href = `/devices/${e.id}/`;
  const src = e.sources.length ? ` · from ${esc(e.sources.map((s) => sourceNames[s] ?? s).join(", "))}` : "";
  const claims = e.claims ? ` · ${e.claims} live claim${e.claims > 1 ? "s" : ""}` : "";
  const verified = e.verified ? `<span class="badge verified">Verified</span>` : "";
  const install = e.install ? `<span class="badge inst-${e.install}" title="Easiest known install route: ${e.install}">${INSTALL_LABEL[e.install]}</span>` : "";
  return `<li><div class="dev-row"><a class="name" href="${href}">${icon("catalogue-DishWasher")}${esc(displayName(e.vendor, e.model))}</a>` +
    `<span class="row"><span class="badge s-${e.status}">${STATUS_LABEL[e.status] ?? e.status}</span>${verified}${install}${w && e.status !== "partial-protocol" && e.status !== "controllable" && e.status !== "open-firmware" ? wantedBadge(w) : ""}<a class="result-arrow" href="${href}" aria-label="View ${esc(displayName(e.vendor, e.model))}">${icon("catalogue-ArrowUpRight03")}</a></span>` +
    `<span class="meta">${esc(e.category)} · <span class="mono">${esc(e.id)}</span>${src}${claims}</span></div></li>`;
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
  if (catEl.value) p.set("category", catEl.value);
  if (stEl.value) p.set("status", stEl.value);
  if (srcEl.value) p.set("source", srcEl.value);
  if (instEl.value) p.set("install", instEl.value);
  if (cloudEl.value) p.set("cloud", cloudEl.value);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

function render() {
  if (!index) return;
  const inst = instEl.value, cloud = cloudEl.value;
  // "setup-only" also keeps devices that need no cloud at all (IndexEntry.cloud is the best project's).
  const cloudOk = (e: IndexEntry) => !cloud || e.cloud === "none" || (cloud === "setup-only" && e.cloud === "setup-only");
  const pool = srcEl.value || inst || cloud
    ? index.filter((e) => (!srcEl.value || e.sources.includes(srcEl.value)) && (!inst || (inst === "any" ? !!e.install : e.install === inst)) && cloudOk(e))
    : index;
  const hits = search(pool, qEl.value, {
    category: catEl.value || undefined,
    status: (stEl.value || undefined) as IndexEntry["status"] | undefined,
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
    ? `<button class="btn" data-go="${page - 1}" ${page === 1 ? "disabled" : ""}>${icon("catalogue-ChevronLeft", 16)}Previous</button>` +
      `<span class="muted">Page ${page} of ${pages.toLocaleString("en")}</span>` +
      `<button class="btn" data-go="${page + 1}" ${page === pages ? "disabled" : ""}>Next${icon("catalogue-ChevronRight", 16)}</button>`
    : "";
  syncUrl();
}

let timer: number | undefined;
function update(resetPage = true) {
  if (resetPage) page = 1;
  clearTimeout(timer);
  timer = window.setTimeout(() => load().then(render, () => {}), index ? 80 : 0);
}

form.addEventListener("submit", (ev) => { ev.preventDefault(); update(); });
qEl.addEventListener("input", () => update());
for (const el of [catEl, stEl, srcEl, instEl, cloudEl]) el.addEventListener("change", () => update());
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
setIf(qEl, "q"); setIf(catEl, "category"); setIf(stEl, "status"); setIf(srcEl, "source"); setIf(instEl, "install"); setIf(cloudEl, "cloud");
page = Math.max(1, Number(params.get("page")) || 1);
if ([...params.keys()].length) update(false);
