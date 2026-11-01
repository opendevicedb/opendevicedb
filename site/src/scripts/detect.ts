// "Detect my device" island (SPEC R1 "Device detection (v1)"). Reads what the browser exposes
// about a device the user picks (WebUSB / WebSerial vid:pid, Web Bluetooth name), then matches
// it against /api/index.json with core's pure functions. Nothing leaves the browser.
import {
  usbId, matchUsb, matchBleName, bleSearchQuery, search, wantedIssueUrl,
  type IndexEntry, type UsbDetection, type BleMatch,
} from "@opendevicedb/core/browser";
import { STATUS_LABEL, displayName } from "../lib/config.ts";

const nav = navigator as any;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const out = $("out"), title = $("out-title"), readEl = $("out-read"), notes = $("out-notes");
const list = $("out-list"), next = $("out-next");

// ---------- feature detection ----------

const secure = window.isSecureContext;
const support = { usb: secure && !!nav.usb, bluetooth: secure && !!nav.bluetooth, serial: secure && !!nav.serial };
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-detect]")) {
  const way = b.dataset.detect as keyof typeof support;
  if (support[way]) { b.disabled = false; b.addEventListener("click", () => run(way)); }
  else b.title = "Not available in this browser";
}
if (!support.usb || !support.bluetooth) {
  const none = !support.usb && !support.bluetooth;
  $("unsupported").hidden = false;
  $("unsupported-why").textContent = !secure
    ? "This page is not loaded over https, so the browser blocks it."
    : none ? "This browser has neither WebUSB nor Web Bluetooth (Firefox and Safari do not support them)."
    : !support.usb ? "This browser has Web Bluetooth but not WebUSB (USB detection is unavailable)."
    : "This browser has WebUSB but not Web Bluetooth (on Linux, Chrome may need it enabled in chrome://flags).";
}

// ---------- index ----------

let loading: Promise<IndexEntry[]> | null = null;
function loadIndex(): Promise<IndexEntry[]> {
  if (!loading) {
    loading = fetch("/api/index.json")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
}

// ---------- rendering ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const INSTALL_HELP: Record<string, string> = {
  easy: "no tools, the device stays closed",
  medium: "needs a cable or the command line",
  hard: "opening the device, soldering or a programmer",
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const searchLink = (q: string, label = q) => `<a href="/devices/?q=${encodeURIComponent(q)}">${esc(label)}</a>`;

function row(e: IndexEntry, why?: string): string {
  const install = e.install
    ? `<span class="badge inst inst-${e.install}" title="Easiest install route: ${esc(INSTALL_HELP[e.install] ?? e.install)}">Install: ${esc(e.install)}</span>` : "";
  const verified = e.verified ? `<span class="badge verified">Verified</span>` : "";
  return `<li><div class="dev-row"><a class="name" href="/devices/${e.id}/">${esc(displayName(e.vendor, e.model))}</a>` +
    `<span class="row"><span class="badge s-${e.status}">${esc(STATUS_LABEL[e.status] ?? e.status)}</span>${verified}${install}</span>` +
    `<span class="meta">${esc(e.category)} · <span class="mono">${esc(e.id)}</span>${why ? ` · ${esc(why)}` : ""}</span></div></li>`;
}

function show(o: { title: string; read?: string; notes?: string[]; rows?: string[]; next?: string }) {
  out.hidden = false;
  title.textContent = o.title;
  readEl.innerHTML = o.read ?? "";
  notes.innerHTML = (o.notes ?? []).map((n) => `<p class="detect-note">${n}</p>`).join("");
  list.hidden = !o.rows?.length;
  list.innerHTML = (o.rows ?? []).join("");
  next.innerHTML = o.next ?? "";
  title.focus({ preventScroll: true });
  out.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

const busy = (what: string) => show({ title: what });

function failure(e: any, what: string) {
  // NotFoundError = the user closed the chooser without picking a device.
  if (e?.name === "NotFoundError") {
    show({ title: "No device chosen", notes: [`Nothing was picked. If your device is not in the list, ${what}, or use the <a href="#label">label search</a>.`] });
  } else if (e?.name === "SecurityError" || e?.name === "NotAllowedError") {
    show({ title: "Blocked by the browser", notes: [`The browser refused access (${esc(e.message || e.name)}). Check the site permissions, or use the <a href="#label">label search</a>.`] });
  } else {
    show({ title: "Something went wrong", notes: [`${esc(String(e?.message ?? e))}. Try again, or use the <a href="#label">label search</a>.`] });
  }
}

function usbResult(d: UsbDetection, names: { product?: string; manufacturer?: string }, via: "USB" | "serial port") {
  const label = [names.manufacturer, names.product].filter(Boolean).join(" ").trim();
  const read = `<p class="detect-read"><span>${via === "USB" ? "USB id" : "Serial adapter id"}</span>` +
    `<span class="mono">${esc(d.id)}</span>${label ? `<span class="muted">${esc(label)}</span>` : ""}</p>`;
  const notesOut: string[] = [];
  const nextParts: string[] = [];

  if (d.known?.kind === "serial-adapter") {
    notesOut.push(`This is a <strong>${esc(d.known.name)}</strong>: it identifies the adapter, not the device wired to it. ` +
      `Read the model, FCC ID or SKU on the device's label and use the <a href="#label">label search</a>.`);
  } else if (d.known?.kind === "chip") {
    notesOut.push(`This id is the <strong>${esc(d.known.name)}</strong>: it identifies the chip, not the product built on it. ` +
      `Search by the device's label instead.`);
  } else if (d.known?.kind === "bootloader") {
    notesOut.push(`This is a generic id (<strong>${esc(d.known.name)}</strong>) shared by many models: it does not tell which one you have. ` +
      `${d.matches.length ? "Every listed device using it is shown. " : ""}Check the exact model (in the device's settings or on its label).`);
  } else if (d.matches.length > 1) {
    notesOut.push(`${plural(d.matches.length, "device")} use this id: it may be generic (one chip or vendor id reused). Compare the names with your device.`);
  }

  if (d.known?.kind === "serial-adapter" || d.known?.kind === "chip") {
    show({ title: "Adapter detected, not the device", read, notes: notesOut, rows: d.matches.map((e) => row(e, `lists ${d.id}`)) });
    return;
  }
  if (!d.matches.length) {
    notesOut.push(`No device in the directory lists <span class="mono">${esc(d.id)}</span>.`);
    nextParts.push(`Search ${searchLink(d.id)}${label ? ` or ${searchLink(label)}` : ""}`);
    nextParts.push(`<a href="${esc(wantedIssueUrl({ model: names.product, vendor: names.manufacturer, identifiers: [`USB: ${d.id}`] }))}">request this device</a> so others can add a 👍`);
  } else {
    nextParts.push(`Not it? Search ${searchLink(d.id)}${label ? ` or ${searchLink(label)}` : ""}, or use the <a href="#label">label search</a>`);
  }
  show({
    title: d.matches.length ? `${d.matches.length} match${d.matches.length === 1 ? "" : "es"}` : "Not found by id",
    read, notes: notesOut, rows: d.matches.map((e) => row(e, `USB ${d.id}`)), next: nextParts.join(" · ") + ".",
  });
}

function bleResult(name: string, matches: BleMatch[], index: IndexEntry[]) {
  const read = `<p class="detect-read"><span>Bluetooth name</span><span class="mono">${esc(name)}</span></p>`;
  const notesOut: string[] = [];
  const exact = matches.filter((m) => m.strength === "exact");
  const rows = matches.map((m) => row(m.entry, m.strength === "exact" ? `advertises “${m.name}”` : `close name “${m.name}” (${m.strength} match)`));
  const q = bleSearchQuery(name);
  let extra: string[] = [];
  if (!exact.length) {
    // Weaker or no name match: also run the normal search on the name.
    const seen = new Set(matches.map((m) => m.entry.id));
    extra = search(index, q, { limit: 10 }).filter((e) => !seen.has(e.id)).map((e) => row(e, "name search"));
    notesOut.push(matches.length
      ? "No device lists this exact Bluetooth name; these are close names. Several products often share a name pattern: compare with your device."
      : extra.length ? "No device lists this Bluetooth name; these come from a search on it." : "No device lists this Bluetooth name.");
  } else if (exact.length > 1) {
    notesOut.push(`${plural(exact.length, "device")} advertise this exact name: compare the models with yours.`);
  }
  const all = [...rows, ...extra];
  show({
    title: !all.length ? "Not found by name" : !exact.length ? "Possible matches"
      : `${exact.length} match${exact.length === 1 ? "" : "es"}${all.length > exact.length ? `, ${plural(all.length - exact.length, "close name")}` : ""}`,
    read, notes: notesOut, rows: all,
    next: (all.length ? `Not it? Search ${searchLink(q)} or use the <a href="#label">label search</a>.`
      : `Search ${searchLink(q)}, use the <a href="#label">label search</a>, or <a href="${esc(wantedIssueUrl({ model: q, identifiers: [`BLE name: ${name}`] }))}">request this device</a> so others can add a 👍.`),
  });
}

// ---------- detection ----------

/** The index, or null after showing why it could not be loaded. */
async function indexOrNull(p: Promise<IndexEntry[]>): Promise<IndexEntry[] | null> {
  busy("Looking it up…");
  try { return await p; } catch (e: any) {
    show({ title: "Could not load the index", notes: [`${esc(String(e?.message ?? e))}. Check your connection and try again.`] });
    return null;
  }
}

async function run(way: keyof typeof support) {
  // Open the chooser inside the click (user activation); load the index meanwhile.
  const index = loadIndex();
  index.catch(() => {});
  const hint = way === "bluetooth" ? "wake it or put it in pairing mode"
    : "unplug it and plug it in again (keyboards, mice and storage are hidden by the browser)";
  let dev: any;
  try {
    dev = way === "usb" ? await nav.usb.requestDevice({ filters: [] })
      : way === "serial" ? await nav.serial.requestPort({})
      : await nav.bluetooth.requestDevice({ acceptAllDevices: true });
  } catch (e) { failure(e, hint); return; }

  if (way === "usb") {
    const idx = await indexOrNull(index);
    if (idx) usbResult(matchUsb(idx, usbId(dev.vendorId, dev.productId)), { product: dev.productName, manufacturer: dev.manufacturerName }, "USB");
  } else if (way === "serial") {
    const info = dev.getInfo?.() ?? {};
    if (info.usbVendorId === undefined) {
      show({ title: "No USB id", notes: ["This serial port is not a USB adapter (or the browser does not expose its id). Use the <a href=\"#label\">label search</a>."] });
      return;
    }
    const idx = await indexOrNull(index);
    if (idx) usbResult(matchUsb(idx, usbId(info.usbVendorId, info.usbProductId ?? 0)), {}, "serial port");
  } else {
    const name = (dev.name ?? "").trim();
    if (!name) {
      show({ title: "No name advertised", notes: ["This device does not advertise a Bluetooth name, so it cannot be matched. Use the <a href=\"#label\">label search</a>."] });
      return;
    }
    const idx = await indexOrNull(index);
    if (idx) bleResult(name, matchBleName(idx, name), idx);
  }
}
