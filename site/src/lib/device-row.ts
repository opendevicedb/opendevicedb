// One device row (directory, detect results), as an HTML string so the build
// (DeviceRow.astro) and the browser scripts render exactly the same markup.
import type { IndexEntry } from "@opendevicedb/core/browser";
import { STATUS_LABEL, STATUS_HELP, displayName } from "./config.ts";
import { DEVICE_ICONS, deviceIcon, svgIcon } from "./icons-device.ts";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const INSTALL_LABEL: Record<string, string> = { easy: "Easy install", medium: "Install: medium", hard: "Install: hard" };
export const INSTALL_HELP: Record<string, string> = {
  easy: "no tools, the device stays closed",
  medium: "needs a cable or the command line",
  hard: "opening the device, soldering or a programmer",
};

/** Status, Verified and install badges: the row's default badges. */
export function deviceBadges(e: IndexEntry): string {
  const status = `<span class="badge s-${e.status}" title="${esc(STATUS_HELP[e.status] ?? "")}">${esc(STATUS_LABEL[e.status] ?? e.status)}</span>`;
  const verified = e.verified ? `<span class="badge verified">Verified</span>` : "";
  const install = e.install
    ? `<span class="badge inst-${e.install}" title="Easiest install route: ${esc(INSTALL_HELP[e.install] ?? e.install)}">${INSTALL_LABEL[e.install] ?? esc(e.install)}</span>`
    : "";
  return status + verified + install;
}

export interface RowOptions {
  /** Default: the device page. */
  href?: string;
  /** Shown in the meta line and picks the icon. Default: e.category. */
  category?: string;
  /** Badge HTML. Default: deviceBadges(e). */
  badges?: string;
  /** Plain-text parts appended to "category · id" in the meta line. */
  meta?: (string | false | undefined)[];
}

export function deviceRowHtml(e: IndexEntry, o: RowOptions = {}): string {
  const { href = `/devices/${e.id}/`, category = e.category, badges = deviceBadges(e), meta = [] } = o;
  const extra = meta.filter(Boolean).map((m) => ` · ${esc(m as string)}`).join("");
  return `<div class="dev-row">` +
    `<span class="title">${svgIcon(DEVICE_ICONS[deviceIcon(category, e.model)], 24, "brand-icon")}<a class="name" href="${esc(href)}">${esc(displayName(e.vendor, e.model))}</a></span>` +
    `<span class="row">${badges}${svgIcon(DEVICE_ICONS["arrow-up-right"], 24, "row-arrow")}</span>` +
    `<span class="meta">${esc(category)} · <span class="mono">${esc(e.id)}</span>${extra}</span>` +
    `</div>`;
}
