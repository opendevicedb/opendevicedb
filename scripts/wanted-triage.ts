// Triage of device requests (issues labelled "wanted"), run by .github/workflows/wanted.yml.
//   ISSUE_NUMBER=<n> [EVENT=opened|edited|reopened]  triage one request
//   (no ISSUE_NUMBER)                                 sync: close requests whose device now has a usable result
// GITHUB_TOKEN and GITHUB_REPOSITORY come from Actions; DRY_RUN=1 prints instead of writing.
//
// Every bot comment carries a marker <!-- odb-triage id=<id> rank=<n> --> recording what the
// registry held when the request was seen, so a request is auto-closed only when something
// *new* arrives (a request for an already-known device stays open as interest in more).
import {
  loadAll, parseIssueForm, parseWantedIssue, recordForRequest, effectiveStatus, statusRank, today, ODB_REPO, WANTED_LABEL,
  type DeviceRecord, type WantedRequest,
} from "@opendevicedb/core";
import { policyScan } from "../packages/mcp/src/policy.ts";

const SITE = "https://opendevicedb.org";
const USABLE = statusRank("partial-protocol");

export interface Issue {
  number: number; html_url: string; title: string; body?: string | null; created_at: string;
  state: string; labels: { name: string }[]; reactions?: { "+1"?: number }; pull_request?: unknown;
}
export interface Comment { body?: string; user?: { login: string; type?: string } }

export type Action =
  | { kind: "comment"; body: string }
  | { kind: "close"; reason: "completed" | "not_planned" }
  | { kind: "label"; name: string };

const MARK = /<!-- odb-triage id=(\S+) rank=(-?\d+) -->/;
const marker = (id: string, rank: number) => `<!-- odb-triage id=${id} rank=${rank} -->`;

/** Latest triage marker left by the bot, if any. */
export function lastMarker(comments: Comment[]): { id: string; rank: number } | null {
  for (const c of [...comments].reverse()) {
    const m = c.user?.type === "Bot" ? c.body?.match(MARK) : null;
    if (m) return { id: m[1], rank: Number(m[2]) };
  }
  return null;
}

const hasNote = (comments: Comment[], note: string) => comments.some((c) => c.user?.type === "Bot" && c.body?.includes(`<!-- odb-triage ${note} -->`));
const link = (r: DeviceRecord) => `[${r.vendor} ${r.model}](${SITE}/devices/${r.id}/)`;

/** What to do with one open request. Pure: everything it needs is passed in. */
export function triage(
  issue: Issue, comments: Comment[], openRequests: WantedRequest[], records: DeviceRecord[],
  opts: { event?: string; on?: string } = {},
): Action[] {
  if (issue.state !== "open" || !issue.labels.some((l) => l.name === WANTED_LABEL)) return [];
  const req = parseWantedIssue(issue);
  if (!req) {
    return hasNote(comments, "unreadable") ? [] : [{
      kind: "comment",
      body: "I could not read the **Vendor** and **Model** fields of this request. Please edit it so both are filled " +
        "(or open it again from the [request form](https://github.com/" + ODB_REPO + "/issues/new?template=wanted.yml)).\n\n<!-- odb-triage unreadable -->",
    }];
  }

  const goal = parseIssueForm(issue.body ?? "")["what do you want to do with it?"];
  const hits = policyScan([["title", issue.title], ["goal", goal]]);
  if (hits.length) {
    if (hasNote(comments, "policy")) return [];
    return [
      { kind: "label", name: "policy" },
      {
        kind: "comment",
        body: `This request mentions ${hits.map((h) => `"${h.match}"`).join(", ")}, which the [content policy](${SITE}/policy/) does not accept ` +
          `(${[...new Set(hits.map((h) => h.rule))].join("; ")}). A maintainer will review it. If that is a false positive, ` +
          "edit the request to say what you want to do with the device instead.\n\n<!-- odb-triage policy -->",
      },
    ];
  }

  const first = openRequests.filter((r) => r.id === req.id && r.issue < issue.number).sort((a, b) => a.issue - b.issue)[0];
  if (first) {
    return [
      { kind: "comment", body: `Duplicate of #${first.issue}, which asks for the same device. Please add a 👍 there instead: interest is counted on the first request.\n\n<!-- odb-triage duplicate -->` },
      { kind: "close", reason: "not_planned" },
    ];
  }

  const record = recordForRequest(records, req);
  const status = record ? effectiveStatus(record, opts.on ?? today()) : undefined;
  const rank = status ? statusRank(status) : -1;
  const prev = lastMarker(comments);
  if (prev && prev.id === req.id && opts.event !== "reopened") {
    if (!record && prev.rank >= 0) {
      // Repair earlier matches that no longer have sufficient identity evidence.
      // Reset the baseline once, so a later real result can still be announced.
      return [{
        kind: "comment",
        body: "The earlier automatic catalogue match for this request can no longer be confirmed. " +
          "A shared chipset does not identify an exact device, and ambiguous identifiers are not enough to select a product. " +
          "The earlier linked record does not establish compatibility for this device. Your request remains open and is still counted on " +
          `[Wanted](${SITE}/wanted/).\n\n${marker(req.id, -1)}`,
      }];
    }
    // Already seen. Close only when a usable result arrived since.
    if (record && rank >= USABLE && rank > prev.rank) {
      return [
        { kind: "comment", body: `A usable result is now in OpenDeviceDB: ${link(record)} (status: **${status}**). Closing this request; reopen it if it does not cover what you need.\n\n${marker(req.id, rank)}` },
        { kind: "close", reason: "completed" },
      ];
    }
    return [];
  }

  let body: string;
  if (record && rank >= USABLE) {
    body = `This device is already in OpenDeviceDB: ${link(record)} (status: **${status}**). If that does not cover what you need, ` +
      "say what is missing here: the request stays open and 👍 still count.";
  } else if (record) {
    body = `This device is listed (${link(record)}) but nothing usable is published yet. Your request is counted: others who want it can add a 👍 here. ` +
      "It closes by itself, with a link, when a usable result is published.";
  } else {
    body = "Thanks, your request is counted. Others who want this device can add a 👍 to this issue; it is listed on " +
      `[Wanted](${SITE}/wanted/) and closes by itself, with a link, when a usable result reaches OpenDeviceDB.`;
  }
  body += `\n\nAbout to reverse engineer it yourself? [Claim it](${SITE}/contribute/#claims) first so nobody duplicates the work.\n\n${marker(req.id, rank)}`;
  return [{ kind: "comment", body }];
}

// ---------- GitHub I/O ----------

const repo = process.env.GITHUB_REPOSITORY || ODB_REPO;
const dry = !!process.env.DRY_RUN;

async function gh(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "opendevicedb-triage",
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function all<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const batch: T[] = await gh("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) return out;
  }
}

async function apply(issue: Issue, actions: Action[]) {
  for (const a of actions) {
    const what = a.kind === "comment" ? `comment: ${a.body.split("\n")[0].slice(0, 100)}…` : a.kind === "close" ? `close (${a.reason})` : `label ${a.name}`;
    console.log(`#${issue.number} ${what}`);
    if (dry) continue;
    if (a.kind === "comment") await gh("POST", `/issues/${issue.number}/comments`, { body: a.body });
    else if (a.kind === "label") await gh("POST", `/issues/${issue.number}/labels`, { labels: [a.name] });
    else await gh("PATCH", `/issues/${issue.number}`, { state: "closed", state_reason: a.reason });
  }
}

async function main() {
  const records = loadAll();
  const open = (await all<Issue>(`/issues?labels=${WANTED_LABEL}&state=open`)).filter((i) => !i.pull_request);
  const requests = open.map(parseWantedIssue).filter((r): r is WantedRequest => !!r);
  const one = process.env.ISSUE_NUMBER ? Number(process.env.ISSUE_NUMBER) : undefined;
  const targets = one ? [await gh("GET", `/issues/${one}`) as Issue] : open;
  for (const issue of targets) {
    const comments = await all<Comment>(`/issues/${issue.number}/comments`);
    await apply(issue, triage(issue, comments, requests, records, { event: one ? process.env.EVENT : undefined }));
  }
  console.log(`${targets.length} request(s) checked${dry ? " (dry run)" : ""}`);
}

if (import.meta.main) await main();
