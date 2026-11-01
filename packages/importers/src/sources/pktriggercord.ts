// pktriggercord: remote control of Pentax (and Samsung GX) DSLRs from a computer or Android phone
// over USB, through Pentax's reverse-engineered SCSI protocol (documented in the repository:
// pentax_scsi_protocol.md). From the camera table in pslr_model.c (github.com/asalamon74/pktriggercord):
// `{ 0x12aa2, "*ist DS", …`. LGPL-3.0.
//
// Status: controllable (exposure, focus, shutter and downloads driven by open code).
import { today, type DeviceRecord, type InstallRoute } from "@opendevicedb/core";
import { clean, deviceFirmwareFreedom, githubRaw, type Source } from "../lib.ts";
import { cameraIdentity, knownCameras } from "../camera-ids.ts";

const REPO = "https://github.com/asalamon74/pktriggercord";
const LICENSE = "LGPL-3.0-or-later";

/** Model names from the table: `{ 0x12aa2, "*ist DS", …`. */
export function parseModels(c: string): string[] {
  return [...new Set([...c.matchAll(/\{\s*0x[0-9a-f]+\s*,\s*"([^"]+)"/gi)].map((m) => clean(m[1])))].filter(Boolean);
}

/** Samsung sold Pentax bodies as GX-*; the rest are Pentax. "K-5II" → "K-5 II". */
export function pentaxName(model: string): { vendor: string; model: string } {
  if (/^GX/i.test(model)) return { vendor: "Samsung", model: model.replace(/^GX(\d)/i, "GX-$1") };
  return { vendor: "Pentax", model: model.replace(/([0-9])(IIs?|III)$/, "$1 $2") };
}

export const pkInstall = (): InstallRoute => ({
  project: "pktriggercord",
  method: "host-software",
  guide: `${REPO}#readme`,
  installer: "http://pktriggercord.melda.info/",
  difficulty: "easy",
  tools: ["Computer or Android phone", "USB cable"],
  opens_device: false,
  brick_risk: "none",
  reversible: "yes",
  notes: "Nothing is installed on the camera: pktriggercord (GUI or pktriggercord-cli) drives it over USB in its PC/PTP mode.",
});

export function fromModel(raw: string, known = knownCameras(), date = today()): DeviceRecord {
  const n = pentaxName(raw);
  const who = cameraIdentity(n.vendor, n.model, known);
  return {
    id: who.id,
    vendor: who.vendor,
    model: who.model,
    aliases: [...who.aliases, ...(raw !== n.model ? [raw] : [])],
    category: "camera",
    status: "controllable",
    projects: [{ name: "pktriggercord", url: REPO, kind: "tool", license: LICENSE, freedom: deviceFirmwareFreedom() }],
    interfaces: [{ name: "Pentax remote control (SCSI over USB)", transport: "usb", status: "documented", spec: `${REPO}/blob/master/pentax_scsi_protocol.md` }],
    install: [pkInstall()],
    provenance: { sources: ["pktriggercord"] },
    updated: date,
  };
}

const source: Source = {
  source: "pktriggercord",
  name: "pktriggercord",
  url: REPO,
  license: LICENSE,
  async fetch() {
    const models = parseModels(await githubRaw("asalamon74/pktriggercord", "master", "pslr_model.c"));
    if (models.length < 25) throw new Error(`pktriggercord: only ${models.length} models`);
    return models.map((m) => fromModel(m));
  },
};
export default source;
