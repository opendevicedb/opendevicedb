// The /cameras/ page: which cameras can run open code on the camera itself. One row per camera and
// project, read from the per-source snapshots (merged records keep one summary and lose which
// firmware each project needs). Tethering-only sources (libgphoto2, pktriggercord) drive a camera
// from a computer and are not "running code on the camera", so they are not rows here.
import { loadSnapshots } from "@opendevicedb/core";
import { ROOT, db } from "./data.ts";

export const CAMERA_SOURCES = ["magiclantern", "chdk", "openmemories", "fujihack", "camera-mods"] as const;

export type CameraState = "installable" | "untested" | "limited" | "research";

export const STATE_LABEL: Record<CameraState, string> = {
  installable: "Installable",
  untested: "Not tested on this model",
  limited: "Limited",
  research: "Research",
};

export const STATE_HELP: Record<CameraState, string> = {
  installable: "A public build that its author ran on this camera; the record gives the install steps.",
  untested: "The project targets this camera, but no test on it is documented.",
  limited: "Some access, without the full feature set (e.g. service tools but no apps).",
  research: "Reverse engineering in progress: nothing to install yet.",
};

export interface CameraRow {
  id: string;
  vendor: string;
  model: string;
  project: string;
  projectUrl: string;
  source: string;
  state: CameraState;
  firmware?: string;
  risk?: string;
  license?: string;
}

const PROJECT_NAME: Record<string, string> = { magiclantern: "Magic Lantern", chdk: "CHDK", openmemories: "OpenMemories (Sony-PMCA-RE)", fujihack: "Fujihack" };

/** "Canon firmware 1.0.1 exactly: update…" → "1.0.1"; "Stock firmware C 1.20 exactly." → "C 1.20". */
export function firmwareOf(constraint?: string): string | undefined {
  if (!constraint) return undefined;
  const s = constraint.split(":")[0]
    .replace(/^(Canon|Stock|Fujifilm)\s+firmware\s+/i, "")
    .replace(/^Built against Fujifilm firmware\s+/i, "")
    .replace(/\s*exactly\.?$/i, "")
    .replace(/\.$/, "")
    .trim();
  return s || undefined;
}

/** "(firmware 1.1)", "(Canon firmware 1.5.2)", "research definitions for firmware 4.40, 4.10." → the versions. */
export function summaryFirmware(summary?: string): string | undefined {
  const m = summary?.match(/\((?:Canon |Fujifilm )?firmware ([^)]+)\)/) ?? summary?.match(/definitions for firmware ([0-9][0-9., ]*[0-9])/);
  return m?.[1].replace(/, development builds$/, "").trim() || undefined;
}

function stateOf(source: string, hasRoute: boolean, summary?: string): CameraState {
  if (hasRoute) return "installable";
  if (source === "openmemories") return "limited";
  if (source === "camera-mods") return /Research only/.test(summary ?? "") ? "research" : "untested";
  return "research"; // Magic Lantern ports in development, Fujihack headers without a documented port
}

/**
 * The part of a summary about one project: camera-mods joins one summary per project with " · ",
 * each starting with the project's name. Other sources have one project, hence the whole summary.
 */
function projectSummary(summary: string | undefined, project: string, single: boolean): string | undefined {
  if (single || !summary) return summary;
  return summary.split(" · ").find((part) => part.startsWith(project));
}

let cache: CameraRow[] | undefined;

export function cameraRows(): CameraRow[] {
  if (cache) return cache;
  const { byId } = db();
  const rows: CameraRow[] = [];
  for (const snap of loadSnapshots(ROOT)) {
    if (!(CAMERA_SOURCES as readonly string[]).includes(snap.source)) continue;
    for (const r of snap.records) {
      if (r.category !== "camera" && r.category !== "action-camera") continue; // e.g. Sony's RM-LVR remotes
      const merged = byId.get(r.id) ?? r;
      // One row per project: a camera two camera-mods projects target appears twice.
      const projects = r.projects?.length ? r.projects : [undefined];
      for (const p of projects) {
        const route = p ? r.install?.find((i) => i.project === p.name) : r.install?.[0];
        const summary = projectSummary(r.summary, p?.name ?? "", projects.length === 1);
        rows.push({
          id: r.id,
          vendor: merged.vendor,
          model: merged.model,
          project: PROJECT_NAME[snap.source] ?? p?.name ?? snap.source,
          projectUrl: p?.url ?? snap.url,
          source: snap.source,
          state: stateOf(snap.source, !!route, summary),
          // Without a route (untested or research), the summary still names the firmware targeted.
          firmware: firmwareOf(route?.firmware_constraints) ?? summaryFirmware(summary),
          risk: route?.brick_risk,
          license: p?.license,
        });
      }
    }
  }
  const order: CameraState[] = ["installable", "limited", "untested", "research"];
  cache = rows.sort((a, b) => a.vendor.localeCompare(b.vendor) || a.model.localeCompare(b.model, "en", { numeric: true }) || order.indexOf(a.state) - order.indexOf(b.state) || a.project.localeCompare(b.project));
  return cache;
}

/** Last snapshot date among the camera sources. */
export function camerasUpdated(): string {
  return db().snapshots.filter((s) => (CAMERA_SOURCES as readonly string[]).includes(s.source)).map((s) => s.fetched_at.slice(0, 10)).sort().at(-1) ?? "";
}
