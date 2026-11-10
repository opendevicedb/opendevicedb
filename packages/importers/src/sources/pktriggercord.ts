// pktriggercord: remote control of Pentax (and Samsung GX) DSLRs from a computer or Android phone
// over USB, through Pentax's reverse-engineered SCSI protocol (documented in the repository:
// pentax_scsi_protocol.md). LGPL-3.0.
//
// Which cameras it supports comes from the README's camera lists, not from the model table in
// pslr_model.c: a table entry only means the code knows the camera's id. The README sorts them:
//   ## Cameras          supported (some with notes: "(bugs)", a minimum firmware) → controllable
//   ### Limited support                                                            → partial-protocol
//   ### Testing         and table entries the README does not list                → unknown, no route
//   ### Not working                                                                → left out
// Both files are read at one pinned revision, recorded in the records' links.
import { execFileSync } from "node:child_process";
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

export type Tier = "supported" | "limited" | "testing" | "not-working";
export interface Support { tier: Tier; notes: string[] }

/** One name for matching the README and the table: "Pentax K-5 IIs" and "K-5IIs" → "k5iis". */
export const supportKey = (name: string) => name.toLowerCase().replace(/^(pentax|samsung)\s+/, "").replace(/[^a-z0-9]/g, "");

const SECTIONS: [RegExp, Tier][] = [[/^##\s+Cameras\b/i, "supported"], [/^###\s+Limited/i, "limited"], [/^###\s+Not working/i, "not-working"], [/^###\s+Testing/i, "testing"]];

/**
 * README camera lists → support per model key. "Pentax K-m / K2000" names one camera twice;
 * "Pentax K10D (Samsung GX-10) _<sub>requires firmware 1.20 or later</sub>_" adds the Samsung
 * name and a note; "(bugs)" becomes a note.
 */
export function parseReadme(md: string): Map<string, Support> {
  const out = new Map<string, Support>();
  let tier: Tier | null = null;
  for (const line of md.split("\n")) {
    const section = SECTIONS.find(([re]) => re.test(line));
    if (section) { tier = section[1]; continue; }
    if (/^#{1,3}\s/.test(line)) { tier = null; continue; }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (!tier || !item) continue;
    let text = item[1];
    const notes: string[] = [];
    for (const m of text.matchAll(/<sub>([^<]+)<\/sub>/g)) notes.push(clean(m[1]));
    if (/\(bugs\)/i.test(text)) notes.push("works with known bugs");
    text = text.replace(/_?<sub>[^<]*<\/sub>_?/g, "").replace(/\(bugs\)/gi, "");
    const names = [...text.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
    names.push(...text.replace(/\([^)]*\)/g, "").split("/"));
    for (const n of names.map(clean).filter(Boolean)) out.set(supportKey(n), { tier, notes });
  }
  return out;
}

export const pkInstall = (support: Support, rev: string): InstallRoute => ({
  project: "pktriggercord",
  method: "host-software",
  guide: `${REPO}/blob/${rev}/README.md#cameras`,
  installer: "http://pktriggercord.melda.info/",
  difficulty: "easy",
  tools: ["Computer or Android phone", "USB cable"],
  opens_device: false,
  brick_risk: "none",
  reversible: "yes",
  ...(support.notes.some((n) => /firmware/i.test(n)) ? { firmware_constraints: support.notes.filter((n) => /firmware/i.test(n)).join("; ") } : {}),
  notes: (support.tier === "limited" ? "Limited support upstream: not every function or status field works. " : "")
    + (support.notes.includes("works with known bugs") ? "Works with known bugs. " : "")
    + "Nothing is installed on the camera: pktriggercord (GUI or pktriggercord-cli) drives it over USB in its PC/PTP mode.",
});

/** A record for one table model, or null for a camera the README lists as not working. */
export function fromModel(raw: string, support: Support | undefined, rev = "master", known = knownCameras(), date = today()): DeviceRecord | null {
  const tier = support?.tier ?? "testing";
  if (tier === "not-working") return null;
  const n = pentaxName(raw);
  const who = cameraIdentity(n.vendor, n.model, known);
  const usable = tier === "supported" || tier === "limited";
  return {
    id: who.id,
    vendor: who.vendor,
    model: who.model,
    aliases: [...who.aliases, ...(raw !== n.model ? [raw] : [])],
    category: "camera",
    status: tier === "supported" ? "controllable" : tier === "limited" ? "partial-protocol" : "unknown",
    summary: tier === "supported" ? `pktriggercord lists it as supported${support!.notes.length ? ` (${support!.notes.join("; ")})` : ""}.`
      : tier === "limited" ? "pktriggercord lists it with limited support: not every function works."
      : support ? "pktriggercord lists it as not yet tested." : "In pktriggercord's model table, but its README does not list it as tested or supported.",
    projects: [{ name: "pktriggercord", url: `${REPO}/blob/${rev}/README.md#cameras`, kind: "tool", license: LICENSE, freedom: deviceFirmwareFreedom() }],
    interfaces: usable ? [{ name: "Pentax remote control (SCSI over USB)", transport: "usb", status: tier === "supported" ? "documented" : "partial", spec: `${REPO}/blob/${rev}/pentax_scsi_protocol.md` }] : [],
    install: usable ? [pkInstall(support!, rev)] : [],
    provenance: { sources: ["pktriggercord"] },
    updated: date,
  };
}

/** The commit master points to, so both files are read at the same revision. */
function headRevision(): string {
  const out = execFileSync("git", ["ls-remote", `${REPO}.git`, "HEAD"], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  const sha = out.split(/\s/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`pktriggercord: no HEAD revision (${out.slice(0, 80)})`);
  return sha;
}

const source: Source = {
  source: "pktriggercord",
  name: "pktriggercord",
  url: REPO,
  license: LICENSE,
  async fetch() {
    const rev = headRevision();
    const [table, readme] = await Promise.all([githubRaw("asalamon74/pktriggercord", rev, "pslr_model.c"), githubRaw("asalamon74/pktriggercord", rev, "README.md")]);
    const models = parseModels(table), support = parseReadme(readme);
    if (models.length < 25) throw new Error(`pktriggercord: only ${models.length} models`);
    if (support.size < 15) throw new Error(`pktriggercord: only ${support.size} cameras in the README lists`);
    const out = models.map((m) => fromModel(m, support.get(supportKey(m)), rev)).filter((r): r is DeviceRecord => !!r);
    const tiers = models.map((m) => support.get(supportKey(m))?.tier ?? "unlisted");
    const count = (t: string) => tiers.filter((x) => x === t).length;
    console.error(`pktriggercord @ ${rev.slice(0, 7)}: ${models.length} models: ${count("supported")} supported, ${count("limited")} limited, ${count("testing") + count("unlisted")} untested, ${count("not-working")} not working (left out)`);
    return out;
  },
};
export default source;
