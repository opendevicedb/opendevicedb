// The few icons device rows need, shared by DeviceRow.astro (build) and the directory
// script (browser), so the client bundle carries only these, not the whole icon set.
import { DEVICE_ICONS as ICONS } from "./icons-device.ts";
import { deviceIcon } from "./ui.ts";

const svg = (name: string, size: number, cls = "") =>
  `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${ICONS[name]}</svg>`;

/** Category icon (brand colour) for a device row. */
export const rowIcon = (category: string, model: string) => svg(deviceIcon(category, model), 24, "brand-icon");
/** The ↗ at the end of a row. */
export const rowArrow = svg("arrow-up-right", 24, "row-arrow");
