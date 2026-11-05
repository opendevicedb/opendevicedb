// OpenDeviceDB agent tools: search, lookup, claim, publish, list sources.
// Pure functions over a Backend; server.ts exposes them over MCP, cli.ts on the command line.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, relative, join } from "node:path";
import { z } from "zod";
import {
  SCHEMA, STATUSES, curatedPath, effectiveStatus, liveClaims, lookup, makeId, mergeRecords,
  parseRecordYaml, search, stringifyRecordYaml, today, validate,
  matchWanted, wantedIssueUrl, wantedToIndexEntry, statusRank, easiestInstall,
  type Claim, type DeviceRecord, type LookupQuery, type Status, type WantedEntry,
} from "@opendevicedb/core";
import type { Backend } from "./backend.ts";
import { policyScan, POLICY_POINTER, type PolicyHit } from "./policy.ts";
import { COMPONENT_TOOLS } from "./components-tools.ts";

// ---------- schema-derived enums (the JSON Schema stays normative) ----------

const P = SCHEMA.properties;
const en = (values: string[]) => z.enum(values as [string, ...string[]]);
export const CATEGORIES: string[] = P.category.enum;
const IFACE = P.interfaces.items.properties;
const PROJ = P.projects.items.properties;
const VERIF = P.verification.items.properties;
const INSTALL = P.install.items.properties;
const FREEDOM = PROJ.freedom.properties;
const FIELD_ORDER = Object.keys(P);

const ID_RE = new RegExp(P.id.pattern);
export const MAX_CLAIM_DAYS = 90;

// ---------- results ----------

export interface Context { backend: Backend; today?: string }
export type Result = { ok: true; [k: string]: unknown } | { ok: false; error: string; [k: string]: unknown };

const fail = (error: string, extra: Record<string, unknown> = {}): Result => ({ ok: false, error, ...extra });

function readOnly(b: Backend): Result {
  return fail(
    `This server reads the read-only OpenDeviceDB API at ${b.location}; it cannot write. ` +
    "To claim a device or publish findings, clone the repository and restart the MCP server with " +
    "ODB_REPO=<path to the checkout> (writes go to data/devices/<id>.yaml, then you open a pull request).",
  );
}

function policyRefusal(hits: PolicyHit[], root?: string): Result {
  return fail(
    `Refused by the content policy: ${hits.map((h) => `${h.field} mentions "${h.match}" (${h.rule})`).join("; ")}. ` +
    `Nothing was written. See ${root ? join(root, "POLICY.md") : "POLICY.md in the repository"}. ` +
    "If this is a false positive (e.g. the text only says such a function is left untouched), rephrase without it " +
    "and let human review handle the nuance in the pull request.",
    { policy: POLICY_POINTER, hits },
  );
}

function gitNextStep(root: string, file: string, id: string, verb: string): string {
  const branch = `odb/${verb}-${id.replace("/", "--")}`;
  return `cd ${root} && git checkout -b ${branch} && git add ${file} && ` +
    `git commit -m "${verb}: ${id}" && gh pr create --fill  ` +
    "(this server never runs git: you open the pull request; maintainers review and merge it)";
}

// ---------- record helpers ----------

const rank = (s: Status) => STATUSES.indexOf(s);

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (Array.isArray(v) && !v.length) ||
  (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length);

/** Drop empty values, order keys like the schema: stable, reviewable YAML diffs. */
function tidy(r: DeviceRecord): DeviceRecord {
  const out: any = {};
  const keys = [...FIELD_ORDER, ...Object.keys(r).filter((k) => !FIELD_ORDER.includes(k))];
  for (const k of keys) {
    let v = (r as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      v = Object.fromEntries(Object.entries(v).filter(([, x]) => !isEmpty(x)));
    }
    if (!isEmpty(v)) out[k] = v;
  }
  return out;
}

function writeRecord(root: string, r: DeviceRecord): string {
  const file = curatedPath(r.id, root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stringifyRecordYaml(r));
  return relative(root, file);
}

function readCurated(root: string, id: string): DeviceRecord | null {
  const file = curatedPath(id, root);
  return existsSync(file) ? parseRecordYaml(readFileSync(file, "utf8")) : null;
}

/** Curated stub for a device known only from imported snapshots (or brand new). */
const stub = (r: Pick<DeviceRecord, "id" | "vendor" | "model" | "category" | "status">, on: string): DeviceRecord =>
  ({ id: r.id, vendor: r.vendor, model: r.model, category: r.category, status: r.status, updated: on });

// ---------- recommendation ----------

const projectList = (ps: NonNullable<DeviceRecord["projects"]>) =>
  ps.slice(0, 3).map((p) => `${p.name} (${p.url})`).join(", ");

/** Category-specific policy reminders (POLICY.md "Refused"). */
const POLICY_REMINDERS: Record<string, string> = {
  drone: "never work on Remote ID, geofencing or other safety/compliance functions",
  vehicle: "never work on emissions, braking, steering or other safety systems",
  radio: "never lift radio power or frequency limits",
  medical: "never bypass medical safety interlocks",
  appliance: "never bypass door locks, thermal cut-outs or other safety interlocks (mains voltage; microwave capacitors stay lethal unplugged)",
};

/** SPEC R1: tell the agent how to use the install routes of a record. */
function installPointer(r: DeviceRecord): string {
  const routes = r.install!;
  const risky = routes.some((i) => i.opens_device && i.mains_powered);
  return `${routes.length} install route${routes.length === 1 ? " is" : "s are"} listed under \`install\` (easiest: ${easiestInstall(r)}): ` +
    "walk the user through the easiest one using its official guide (and installer when there is one), after checking " +
    "firmware_constraints against their firmware version; warn about brick_risk, about routes that open the device or are not " +
    "reversible, and to back up first." +
    (risky ? " A route opens a mains-powered device: do not guide it step by step, give the official link with a mains-voltage warning." : "");
}

export function recommend(r: DeviceRecord, on: string): string {
  const live = liveClaims(r, on);
  const status = effectiveStatus(r, on);
  const projects = r.projects ?? [];
  const firmware = projects.filter((p) => p.kind === "firmware");
  const code = projects.filter((p) => ["sdk", "library", "driver", "integration", "tool"].includes(p.kind));
  const documented = (r.interfaces ?? []).filter((i) => i.status !== "unknown").map((i) => `${i.name} [${i.transport}]`);
  const verified = (r.verification ?? []).some((v) => v.method === "hardware-replay");
  const claimText = live.map((c) => `${c.who} (scope: ${c.scope}) until ${c.expires}, contact ${c.contact}`).join("; ");
  const parts: string[] = [];

  if (status === "open-firmware") {
    parts.push(`Open firmware exists: use ${projectList(firmware.length ? firmware : projects) || "the projects in the record"} before reverse engineering.`);
  } else if (status === "controllable") {
    parts.push(`Already fully controllable with open code over the stock firmware: use ${projectList(code.length ? code : projects) || "the documented interfaces"} before reverse engineering.`);
  } else if (status === "partial-protocol") {
    parts.push(`Part of the protocol is already documented${documented.length ? ` (${documented.join(", ")})` : ""}: build on ${projectList(projects) || "the interface specs in the record"} rather than starting over, and claim_device only the missing scope.`);
  } else if (live.length) {
    parts.push(`Claimed by ${claimText}: contact them before starting, or claim a different scope.`);
  } else {
    parts.push("Listed, but nothing public is known about its protocol yet: call claim_device before you start, then publish_findings when done.");
  }
  if (live.length && status !== "in-progress") parts.push(`Live claim: ${claimText}.`);
  // Imported records come from projects that maintain their own hardware support lists.
  const upstream = (r.provenance?.sources ?? []).filter((s) => s !== "curated");
  if (rank(status) >= rank("partial-protocol") && !verified) {
    parts.push(upstream.length
      ? `Support is maintained upstream (${upstream.join(", ")}): check its page for your exact hardware revision.`
      : "Not verified on hardware: treat it as a lead and confirm with a replay test.");
  }
  if (r.install?.length) parts.push(installPointer(r));
  if (POLICY_REMINDERS[r.category]) parts.push(`Policy: ${POLICY_REMINDERS[r.category]} (POLICY.md).`);
  return parts.join(" ");
}

// ---------- search_devices ----------

export const searchShape = {
  query: z.string().describe("Words to match: vendor, model, alias, or an identifier (FCC id, USB vid:pid, BLE name, chip, SKU). Empty string lists everything."),
  category: en(CATEGORIES).optional().describe("Restrict to one device category."),
  status: en(STATUSES).optional().describe("Restrict to one effective status (unknown, in-progress, partial-protocol, controllable, open-firmware)."),
  limit: z.number().int().min(1).max(200).optional().describe("Maximum results (default 20)."),
};

export async function searchDevices(ctx: Context, a: { query: string; category?: string; status?: Status; limit?: number }): Promise<Result> {
  const on = ctx.today ?? today();
  const index = await ctx.backend.index(on);
  const hits = search(index, a.query ?? "", { category: a.category, status: a.status, limit: a.limit ?? 20 });
  const known = new Set(index.map((e) => e.id));
  const wanted = (await ctx.backend.wanted()).filter((w) => !known.has(w.id));
  const requests = a.query?.trim() ? search(wanted.map(wantedToIndexEntry), a.query, { limit: 5 }).map((h) => publicRequest(wanted.find((w) => w.id === h.id)!)) : [];
  return {
    ok: true,
    query: a.query,
    count: hits.length,
    searched: index.length,
    results: hits.map((h) => ({
      id: h.id, vendor: h.vendor, model: h.model, aliases: h.aliases, category: h.category, status: h.status,
      sources: h.sources, live_claims: h.claims, verified: h.verified, score: h.score,
      ...(h.install ? { install: h.install } : {}),
      ...(h.cloud ? { cloud: h.cloud } : {}),
    })),
    ...(requests.length ? { requests } : {}),
    hint: hits.length
      ? "Call lookup_device with the id for the full record, live claims and a recommendation. `install` (when present) is the difficulty of the easiest install route; lookup_device lists the routes. " +
        "`cloud` (when present) is the least vendor-cloud dependency across the device's projects (none, setup-only, optional, required); lookup_device gives each project's `freedom`."
      : "No match. Try lookup_device with an identifier (FCC id, USB vid:pid, BLE name, Zigbee model). If nothing is known, call claim_device before you start reverse engineering" +
        (requests.length ? "; `requests` lists devices people asked for but nobody has published yet." : ", or request_device if your user only wants it to exist."),
  };
}

// ---------- lookup_device ----------

export const lookupShape = {
  id: z.string().optional().describe("OpenDeviceDB id (<vendor-slug>/<model-slug>) if you already have it, e.g. from search_devices."),
  vendor: z.string().optional().describe("Manufacturer or brand, e.g. \"DJI\"."),
  model: z.string().optional().describe("Model name as printed on the device or box, e.g. \"Neo 2\"."),
  fcc_id: z.string().optional().describe("FCC ID from the label, e.g. \"SS3-NEO2\". Identifiers are the most reliable match."),
  usb: z.string().optional().describe("USB vendor:product id in lowercase hex, e.g. \"2ca3:001f\" (from lsusb)."),
  ble_name: z.string().optional().describe("Bluetooth LE advertised name."),
  zigbee_model: z.string().optional().describe("Zigbee modelId reported by the device."),
};

type LookupArgs = LookupQuery & { id?: string };

export async function lookupDevice(ctx: Context, q: LookupArgs): Promise<Result> {
  const on = ctx.today ?? today();
  const { backend } = ctx;
  const given = Object.fromEntries(Object.entries(q).filter(([, v]) => typeof v === "string" && v.trim()));
  if (!Object.keys(given).length) {
    return fail("Give at least one of id, vendor+model, model, fcc_id, usb, ble_name, zigbee_model.");
  }
  let record: DeviceRecord | null = null;
  if (q.id) record = await backend.get(q.id);
  else {
    const hit = lookup(await backend.records(), q);
    if (hit) record = (await backend.get(hit.id)) ?? hit;
  }

  if (!record) {
    const index = await backend.index(on);
    const words = q.model ?? q.vendor ?? q.id?.split("/").pop()?.replace(/-/g, " ");
    const similar = words ? search(index, words, { limit: 5 }).map((h) => ({ id: h.id, vendor: h.vendor, model: h.model, status: h.status })) : [];
    const request = matchWanted(await backend.wanted(), wantedQuery(q));
    return {
      ok: true,
      found: false,
      recommendation:
        `Nothing is known about this device in OpenDeviceDB (${index.length} devices searched). ` +
        "Before you start reverse engineering, call claim_device so nobody duplicates your work, " +
        "and call publish_findings when you are done." +
        (similar.length ? " Check the `similar` entries first: one may be the same device under another name." : "") +
        " " + requestAdvice(request, q),
      query: given,
      similar,
      ...(request ? { request: publicRequest(request) } : { request_url: wantedIssueUrl(prefill(q)) }),
    };
  }

  const live = liveClaims(record, on);
  const status = effectiveStatus(record, on);
  const request = statusRank(status) < statusRank("partial-protocol")
    ? (await backend.wanted()).find((w) => w.id === record!.id) : undefined;
  const file = backend.root && existsSync(curatedPath(record.id, backend.root)) ? relative(backend.root, curatedPath(record.id, backend.root)) : undefined;
  return {
    ok: true,
    found: true,
    id: record.id,
    effective_status: status,
    recommendation: recommend(record, on) + (request ? ` ${request.votes} ${request.votes === 1 ? "person wants" : "people want"} this device (${request.url}): publishing a result helps them all.` : ""),
    live_claims: live,
    ...(request ? { request: publicRequest(request) } : {}),
    curated_file: file,
    record,
  };
}

// ---------- claim_device ----------

export const claimShape = {
  id: z.string().optional().describe("Device id if it already exists (from lookup_device/search_devices). Otherwise give vendor + model."),
  vendor: z.string().optional().describe("Manufacturer, used to build the id when the device is new."),
  model: z.string().optional().describe("Model name, used to build the id when the device is new."),
  category: en(CATEGORIES).optional().describe("Required only when the device is not in OpenDeviceDB yet."),
  who: z.string().min(1).describe("Who is working on it: your human's name or handle (and project)."),
  contact: z.string().min(1).describe("How others can reach the claimant: email, GitHub handle, URL of a tracking issue."),
  scope: z.string().min(1).describe("What you will reverse engineer, e.g. \"BLE pairing + telemetry\", \"full Wi-Fi control\"."),
  days: z.number().int().min(1).max(MAX_CLAIM_DAYS, `A claim lasts at most ${MAX_CLAIM_DAYS} days; renew it later with another claim_device call.`).default(30)
    .describe(`Claim duration in days (default 30, max ${MAX_CLAIM_DAYS}). Expired claims are ignored.`),
  agent: z.string().optional().describe("Agent/tooling used, e.g. \"claude-code + rea 6.5.0\"."),
  force_new: z.boolean().optional().describe("Create a new record even though a similar device exists (only if you are sure it is a different device)."),
};

export interface ClaimArgs {
  id?: string; vendor?: string; model?: string; category?: string;
  who: string; contact: string; scope: string; days?: number; agent?: string; force_new?: boolean;
}

export async function claimDevice(ctx: Context, a: ClaimArgs): Promise<Result> {
  const on = ctx.today ?? today();
  const { backend } = ctx;
  const root = backend.root;
  if (!root) return readOnly(backend);
  const days = a.days ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > MAX_CLAIM_DAYS) {
    return fail(`days must be an integer between 1 and ${MAX_CLAIM_DAYS} (got ${days}): claims are short so abandoned work frees the device. Renew with another claim_device call before it expires.`);
  }
  for (const k of ["who", "contact", "scope"] as const) if (!a[k]?.trim()) return fail(`${k} is required.`);
  const hits = policyScan([["scope", a.scope]]);
  if (hits.length) return policyRefusal(hits, root);

  const all = await backend.records();
  let id = a.id;
  if (!id) {
    if (!a.vendor || !a.model) return fail("Give the device id, or vendor + model.");
    id = makeId(a.vendor, a.model);
    if (!all.some((r) => r.id === id) && !a.force_new) {
      const near = lookup(all, { vendor: a.vendor, model: a.model });
      if (near) {
        return fail(
          `A similar device already exists: ${near.id} (${near.vendor} ${near.model}). ` +
          `Pass id: "${near.id}" to claim it, or force_new: true if it is really a different device.`,
          { similar: { id: near.id, vendor: near.vendor, model: near.model, status: near.status } },
        );
      }
    }
  }
  if (!ID_RE.test(id)) return fail(`Invalid id "${id}": expected <vendor-slug>/<model-slug>, lowercase [a-z0-9-].`);

  const known = all.find((r) => r.id === id);
  let rec = readCurated(root, id);
  const action = rec ? "updated" : "created";
  if (!rec) {
    if (known) rec = stub(known, on);
    else {
      if (!a.vendor || !a.model) return fail(`No device "${id}" in OpenDeviceDB. Give vendor, model and category to create it.`);
      if (!a.category) return fail(`"${id}" is new: give its category, one of ${CATEGORIES.join(", ")}.`);
      rec = stub({ id, vendor: a.vendor, model: a.model, category: a.category, status: "unknown" }, on);
    }
  }

  const claim: Claim = { who: a.who, contact: a.contact, scope: a.scope, since: on, expires: addDays(on, days), ...(a.agent ? { agent: a.agent } : {}) };
  const others = liveClaims(known ?? rec, on).filter((c) => c.who !== a.who);
  // A renewal by the same claimant for the same scope replaces the live claim.
  rec.claims = [...(rec.claims ?? []).filter((c) => !(c.who === a.who && c.scope === a.scope && c.expires >= on)), claim];
  rec.updated = on;
  rec = tidy(rec);
  const errors = validate(rec);
  if (errors.length) return fail("The claimed record would not validate against schema/device.schema.json; nothing was written.", { errors });

  const file = writeRecord(root, rec);
  const view = known ? mergeRecords(rec, known) : rec;
  return {
    ok: true,
    action,
    id,
    claim,
    effective_status: effectiveStatus(view, on),
    recommendation: known ? recommend(known, on) : "Nothing was known about this device: you are the first. Reverse engineer it, then call publish_findings.",
    warnings: others.map((c) => `Also claimed by ${c.who} (scope: ${c.scope}) until ${c.expires}: coordinate with ${c.contact}.`),
    file_changed: file,
    next_step: gitNextStep(root, file, id, "claim"),
  };
}

// ---------- publish_findings ----------

const PATCHABLE = ["summary", "status", "interfaces", "projects", "install", "identifiers", "verification", "provenance", "aliases", "vendor_support"] as const;

export const patchSchema = z.strictObject({
  summary: z.string().optional().describe("One plain-text paragraph: what the device is and what is now known. Replaces the current summary."),
  status: en(STATUSES).optional().describe("New status; it can only move forward (unknown → in-progress → partial-protocol → controllable → open-firmware)."),
  vendor_support: en(P.vendor_support.enum).optional().describe("State of the vendor's own service."),
  aliases: z.array(z.string()).optional().describe("Other names for the device (added)."),
  identifiers: z.strictObject({
    fcc_id: z.array(z.string()).optional(),
    usb: z.array(z.string()).optional().describe("vid:pid, lowercase hex"),
    ble_names: z.array(z.string()).optional(),
    chips: z.array(z.string()).optional(),
    sku: z.array(z.string()).optional(),
    zigbee_model: z.array(z.string()).optional(),
  }).optional().describe("Identifiers to add (unioned with the existing ones)."),
  interfaces: z.array(z.strictObject({
    name: z.string(),
    transport: en(IFACE.transport.enum),
    status: en(IFACE.status.enum),
    confidence: en(IFACE.confidence.enum).optional().describe("How sure you are; AI-derived, untested work is low or medium."),
    spec: z.string().optional().describe("URL of the protocol description you wrote (repo, gist, wiki)."),
    notes: z.string().optional(),
  })).optional().describe("Interfaces you documented; one with the same transport+name replaces the existing one."),
  projects: z.array(z.strictObject({
    name: z.string(),
    url: z.string(),
    kind: en(PROJ.kind.enum),
    license: z.string().optional(),
    official: z.boolean().optional(),
    freedom: z.strictObject({
      nonfree: z.array(en(FREEDOM.nonfree.items.enum)).optional().describe("Parts that still need proprietary code once the project is in use; [] = nothing non-free known to remain."),
      cloud: en(FREEDOM.cloud.enum).optional().describe("none = works fully locally; setup-only = a vendor account once (e.g. to get a local key); optional; required; unknown."),
      notes: z.string().optional(),
    }).optional().describe("What stays non-free or cloud-bound, from the project's own documentation; leave out when unknown."),
  })).optional().describe("Your code or docs (open license, hosted elsewhere); merged by url."),
  install: z.array(z.strictObject({
    project: z.string().describe("Name of the project (in `projects`) this route installs."),
    method: en(INSTALL.method.enum).describe("web-serial = browser installer, ota-exploit (e.g. cloudcutter), vendor-upload (stock web UI accepts the image), usb-bootloader (fastboot/DFU), sd-card, serial (UART, device opened), spi-programmer, pairing (no flashing), host-software."),
    guide: z.string().describe("URL of the project's official step-by-step guide."),
    installer: z.string().optional().describe("URL of the official installer tool, when one exists."),
    difficulty: en(INSTALL.difficulty.enum).describe("easy = no tools, device stays closed; medium = cable or command line; hard = opening, soldering, programmer."),
    tools: z.array(z.string()).optional().describe("What to have, e.g. [\"USB-serial adapter, 3.3 V\"]."),
    opens_device: z.boolean().optional(),
    mains_powered: z.boolean().optional(),
    brick_risk: en(INSTALL.brick_risk.enum).optional(),
    reversible: en(INSTALL.reversible.enum).optional(),
    revert: z.string().optional().describe("URL of the back-to-stock guide."),
    firmware_constraints: z.string().optional().describe("e.g. \"stock firmware after 2.x is patched: does not work\"."),
    notes: z.string().optional(),
  })).optional().describe("Ways to install the open firmware or software, linking to the project's own guide (nothing is hosted here); merged by method+guide (yours replace)."),
  verification: z.array(z.strictObject({
    method: en(VERIF.method.enum).describe("hardware-replay = replayable test run on a real device; this is what earns the verified badge."),
    by: z.string(),
    date: z.string().describe("YYYY-MM-DD"),
    firmware: z.string().optional().describe("Device firmware version tested."),
    notes: z.string().optional(),
  })).optional().describe("Verification runs (appended)."),
  provenance: z.strictObject({
    sources: z.array(z.string()).optional(),
    ai_assisted: z.boolean().optional().describe("true if an AI agent did any of the work (always say so)."),
    tools: z.array(z.string()).optional().describe("Tools used, e.g. [\"claude-code\", \"rea 6.5.0\", \"wireshark\"]."),
  }).optional(),
});

export const publishShape = {
  id: z.string().describe("Device id (from lookup_device or claim_device)."),
  patch: patchSchema.describe("Findings to merge into the record."),
  allow_downgrade: z.boolean().optional().describe("Allow lowering the status (only when the previous status was wrong; explain why in summary or verification notes)."),
  release_claim_of: z.string().optional().describe("Remove the live claims of this claimant (the `who` you used in claim_device) now that the work is published."),
};

export type Patch = z.infer<typeof patchSchema>;

export async function publishFindings(ctx: Context, a: { id: string; patch: Patch; allow_downgrade?: boolean; release_claim_of?: string }): Promise<Result> {
  const on = ctx.today ?? today();
  const { backend } = ctx;
  const root = backend.root;
  if (!root) return readOnly(backend);
  const patch: any = a.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return fail("patch must be an object.");
  const unknownKeys = Object.keys(patch).filter((k) => !(PATCHABLE as readonly string[]).includes(k));
  if (unknownKeys.length) {
    return fail(`patch cannot contain ${unknownKeys.join(", ")}. Allowed: ${PATCHABLE.join(", ")}. Claims go through claim_device; id, vendor, model and category are fixed.`);
  }

  const hits = policyScan([
    ["summary", patch.summary],
    ...(patch.interfaces ?? []).flatMap((i: any, n: number) => [[`interfaces[${n}].name`, i?.name], [`interfaces[${n}].notes`, i?.notes]] as [string, string][]),
    ...(patch.projects ?? []).flatMap((p: any, n: number) => [[`projects[${n}].name`, p?.name], [`projects[${n}].freedom.notes`, p?.freedom?.notes]] as [string, string][]),
    ...(patch.install ?? []).flatMap((i: any, n: number) => [[`install[${n}].notes`, i?.notes], [`install[${n}].firmware_constraints`, i?.firmware_constraints]] as [string, string][]),
    ...(patch.verification ?? []).map((v: any, n: number) => [`verification[${n}].notes`, v?.notes] as [string, string]),
  ]);
  if (hits.length) return policyRefusal(hits, root);

  const known = (await backend.records()).find((r) => r.id === a.id);
  if (!known) {
    return fail(`No device "${a.id}" in OpenDeviceDB. Find its id with lookup_device, or create it with claim_device (vendor + model + category) first.`);
  }
  const base = readCurated(root, a.id) ?? stub(known, on);
  const warnings: string[] = [];
  if (patch.status && rank(patch.status) < rank(known.status)) {
    if (!a.allow_downgrade) {
      return fail(
        `Status can only move forward: "${a.id}" is "${known.status}" and the patch says "${patch.status}" ` +
        `(order: ${STATUSES.join(" → ")}). Nothing was written. If the current status is wrong, retry with ` +
        "allow_downgrade: true and explain why in the summary or a verification note.",
      );
    }
    if (rank(patch.status) < rank(known.status) && known.status !== base.status) {
      warnings.push(`Imported sources still report "${known.status}"; the merged record keeps the furthest status.`);
    }
  }

  const patchRec = { ...patch, id: base.id, vendor: base.vendor, model: base.model, category: base.category, status: patch.status ?? base.status, updated: on } as DeviceRecord;
  let next = mergeRecords(patchRec, base);
  if (patch.status && a.allow_downgrade) next.status = patch.status;
  if (patch.provenance?.tools && base.provenance?.tools) {
    next.provenance = { ...next.provenance, tools: [...new Set([...base.provenance.tools, ...patch.provenance.tools])] };
  }
  let released = 0;
  if (a.release_claim_of) {
    const before = next.claims?.length ?? 0;
    next.claims = (next.claims ?? []).filter((c) => !(c.who === a.release_claim_of && c.expires >= on));
    released = before - next.claims.length;
    if (!released) warnings.push(`No live claim by "${a.release_claim_of}" to release.`);
  }
  next.updated = on;
  next = tidy(next);

  const errors = validate(next);
  if (errors.length) {
    return fail("The merged record does not validate against schema/device.schema.json; nothing was written. Fix the patch and retry.", { errors });
  }
  const file = writeRecord(root, next);
  const view = mergeRecords(next, known);
  return {
    ok: true,
    id: a.id,
    status: next.status,
    effective_status: effectiveStatus(view, on),
    released_claims: released,
    warnings,
    file_changed: file,
    next_step: gitNextStep(root, file, a.id, "findings"),
    record: next,
  };
}

// ---------- requests (request_device) ----------

const publicRequest = (w: WantedEntry) => ({ id: w.id, vendor: w.vendor, model: w.model, votes: w.votes, url: w.url, opened: w.opened, issues: w.issues });

const wantedQuery = (q: LookupArgs) => ({
  id: q.id, vendor: q.vendor, model: q.model,
  identifiers: [q.fcc_id, q.usb, q.ble_name, q.zigbee_model].filter((x): x is string => !!x),
});

const prefill = (q: LookupArgs & { goal?: string }) => ({
  vendor: q.vendor, model: q.model ?? q.id?.split("/").pop()?.replace(/-/g, " "), goal: q.goal,
  identifiers: [
    q.fcc_id && `FCC ID: ${q.fcc_id}`, q.usb && `USB: ${q.usb}`, q.ble_name && `BLE name: ${q.ble_name}`, q.zigbee_model && `Zigbee model: ${q.zigbee_model}`,
  ].filter((x): x is string => !!x),
});

function requestAdvice(request: WantedEntry | null, q: LookupArgs): string {
  if (request) {
    return `${request.votes} ${request.votes === 1 ? "person has" : "people have"} already requested it (${request.url}). ` +
      "If your user only wants it to exist, give them that link to add a 👍 (do not open a new request).";
  }
  return "If your user only wants it to exist (they will not reverse engineer it), give them `request_url`: " +
    "a pre-filled public GitHub issue they review and submit, so others can add a 👍.";
}

export const requestShape = {
  vendor: z.string().min(1).describe("Manufacturer or brand, e.g. \"Parrot\"."),
  model: z.string().min(1).describe("Exact model name, e.g. \"Bebop 2\"."),
  fcc_id: z.string().optional().describe("FCC ID from the label."),
  usb: z.string().optional().describe("USB vendor:product id (lsusb)."),
  ble_name: z.string().optional().describe("Bluetooth LE advertised name."),
  zigbee_model: z.string().optional().describe("Zigbee modelId."),
  goal: z.string().optional().describe("What your user wants to do with it, in their words (e.g. \"fly it from Python now that the app is gone\")."),
};

export async function requestDevice(ctx: Context, a: LookupArgs & { vendor: string; model: string; goal?: string }): Promise<Result> {
  const on = ctx.today ?? today();
  if (!a.vendor?.trim() || !a.model?.trim()) return fail("vendor and model are required.");
  const hits = policyScan([["goal", a.goal]]);
  if (hits.length) return policyRefusal(hits, ctx.backend.root);
  const hit = lookup(await ctx.backend.records(), a);
  const status = hit ? effectiveStatus((await ctx.backend.get(hit.id)) ?? hit, on) : undefined;
  if (hit && status && statusRank(status) >= statusRank("partial-protocol")) {
    return {
      ok: true,
      available: true,
      id: hit.id,
      effective_status: status,
      recommendation: `Already in OpenDeviceDB as ${hit.id} (${status}): call lookup_device with this id instead of requesting it.`,
    };
  }
  const request = matchWanted(await ctx.backend.wanted(), wantedQuery({ ...a, id: hit?.id }));
  if (request) {
    return {
      ok: true,
      available: false,
      request: publicRequest(request),
      recommendation: `Already requested by ${request.votes} ${request.votes === 1 ? "person" : "people"}. ` +
        `Give your user ${request.url} to add a 👍 there (and to follow it: it closes when a result is published). Do not open a new request.`,
    };
  }
  return {
    ok: true,
    available: false,
    request_url: wantedIssueUrl(prefill(a)),
    recommendation: "Nobody has requested it yet. Give your user `request_url`: it opens a pre-filled GitHub issue form " +
      "(public; needs a GitHub account) that they review and submit themselves. This server never submits anything.",
  };
}

// ---------- list_sources ----------

export async function listSources(ctx: Context): Promise<Result> {
  const info = await ctx.backend.sources();
  return { ok: true, backend: ctx.backend.kind, location: ctx.backend.location, ...info };
}

// ---------- registry (used by server.ts and cli.ts) ----------

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  shape: Record<string, z.ZodType>;
  run: (ctx: Context, args: any) => Promise<Result>;
}

export const TOOLS: ToolDef[] = [
  ...COMPONENT_TOOLS,
  {
    name: "lookup_device",
    title: "Look up a device before reverse engineering it",
    description:
      "CALL THIS FIRST, before you start reverse engineering any device (drone, camera, router, plug, robot, wearable...). " +
      "It tells you whether the protocol or a free firmware already exists, whether someone is working on it right now (live claims), " +
      "and gives a one-line recommendation (e.g. \"open firmware exists: use X\", \"claimed by Y until Z: contact them\"). " +
      "Give identifiers when you have them (FCC id, USB vid:pid, BLE name, Zigbee model): they match better than names. " +
      "The record's `install` routes (when present) say how to put the open firmware on the device: official guide, installer, difficulty, safety flags. " +
      "If it answers found: false, nothing is known: call claim_device before starting.",
    shape: lookupShape,
    run: lookupDevice,
  },
  {
    name: "search_devices",
    title: "Search the device directory",
    description:
      "Ranked full-text search over vendor, model, aliases and identifiers across curated records and imported databases " +
      "(OpenWrt, Zigbee2MQTT, Tasmota...). Use it to explore (\"all DJI drones\", \"open-firmware cameras\") or when lookup_device finds nothing " +
      "and you suspect another name. Each result has an id to pass to lookup_device.",
    shape: searchShape,
    run: searchDevices,
  },
  {
    name: "claim_device",
    title: "Claim a device you are about to reverse engineer",
    description:
      "Record that you (your human) are working on a device, with a scope, contact and expiry (default 30 days, max 90), " +
      "so other agents do not duplicate the work. Creates a stub record if the device is unknown (then give vendor, model, category). " +
      "Writes data/devices/<id>.yaml in the local repository checkout (needs ODB_REPO); you then open a pull request — the result gives the exact commands.",
    shape: claimShape,
    run: claimDevice,
  },
  {
    name: "publish_findings",
    title: "Publish what you found",
    description:
      "CALL THIS WHEN YOU FINISH (or stop) a reverse-engineering job, even with partial results. Merges your findings into the record: " +
      "summary and status replace (status only moves forward), interfaces merge by transport+name (yours replace), projects by url, install routes by method+guide, " +
      "identifiers and aliases are unioned, verification is appended. The result is validated against the schema; nothing is written on error. " +
      "Link to your protocol docs/code hosted elsewhere; never include firmware images, vendor code, keys, or anything defeating Remote ID, " +
      "geofencing or other safety functions (POLICY.md). Set provenance.ai_assisted honestly. Then open a pull request — the result gives the commands.",
    shape: publishShape,
    run: publishFindings,
  },
  {
    name: "request_device",
    title: "Request a device (say your user wants it)",
    description:
      "Use when your user wants a device to become usable with open code but will not reverse engineer it themselves " +
      "(lookup_device found nothing usable). Returns the existing request to add a 👍 to, or a pre-filled link to a new public " +
      "GitHub issue that the user reviews and submits. Read-only: this tool never posts anything.",
    shape: requestShape,
    run: requestDevice,
  },
  {
    name: "list_sources",
    title: "List the databases OpenDeviceDB aggregates",
    description:
      "Imported source databases with name, url, license, snapshot date and record count, plus the number of curated records. " +
      "Use it to judge coverage and freshness: a device absent here may still be covered by a source that was not imported.",
    shape: {},
    run: listSources,
  },
];
