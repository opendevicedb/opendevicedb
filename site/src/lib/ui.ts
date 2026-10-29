// Presentation helpers shared by components.

const CATEGORY_ICON: Record<string, string> = {
  appliance: "dish-washer",
  phone: "phone",
  laptop: "laptop",
  peripheral: "keyboard",
  light: "bulb",
  "smart-plug": "plug",
  drone: "drone",
  router: "router",
  camera: "camera",
};
const MODEL_ICON: [RegExp, string][] = [
  [/air cond/i, "air-vent"],
  [/dryer|washer|washing/i, "washing-machine"],
  [/dehumid/i, "humidity"],
  [/home connect|wi-?fi/i, "wifi"],
];

/** Icon name for a device card: a model hint first, then its category. */
export function deviceIcon(category: string, model = ""): string {
  return MODEL_ICON.find(([re]) => re.test(model))?.[1] ?? CATEGORY_ICON[category] ?? "cpu";
}

/** 2026-10-17 → "Oct 17, 2026" */
export function fmtLongDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
