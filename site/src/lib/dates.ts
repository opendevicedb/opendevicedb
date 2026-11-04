// Date formats: ISO for <time datetime> and data, long for what people read.

/** Date → "2026-10-17" */
export const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

/** 2026-10-17 (or a Date) → "Oct 17, 2026" */
export function fmtLongDate(d: Date | string): string {
  const iso = typeof d === "string" ? d.slice(0, 10) : fmtDate(d);
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
