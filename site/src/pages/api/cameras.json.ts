// /api/cameras.json: one row per camera and on-camera project (Magic Lantern, CHDK, camera firmware
// mods, OpenMemories, Fujihack), as on /cameras/. CC BY-SA 4.0, like the rest of the data.
import { cameraRows, camerasUpdated, STATE_HELP } from "../../lib/cameras.ts";

export function GET() {
  const rows = cameraRows();
  const body = {
    updated: camerasUpdated(),
    license: "CC-BY-SA-4.0",
    states: STATE_HELP,
    cameras: new Set(rows.map((r) => r.id)).size,
    rows: rows.map((r) => ({ ...r, url: `https://opendevicedb.org/devices/${r.id}/` })),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json" } });
}
