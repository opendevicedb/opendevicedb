// SPDX-License-Identifier: AGPL-3.0-or-later
// Explicit, read-only bridge for an already running local probe preview server.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { boundedResponse, pngDimensions, previewOrigin, MAX_PREVIEW_BYTES } from "../components/ultrasound/preview-source/1.0.0/source.ts";

export function sanitizeStatus(raw: any) {
  if (!raw || !Number.isSafeInteger(raw.session) || raw.session < 0 || !(raw.frame == null || Number.isSafeInteger(raw.frame) && raw.frame > 0) || typeof raw.replay_only !== "boolean") throw Error("Unsupported preview status");
  return { format: "odb.ultrasound-preview/1", profile: ["linear-01", "convex-01"].includes(raw.profile) ? raw.profile : "unknown",
    phase: ["idle", "preparing", "preflight", "acquiring", "reconstructing", "finished", "failed"].includes(raw.phase) ? raw.phase : "unknown",
    session: raw.session, frame: raw.frame ?? null, replay: raw.replay_only };
}
export function createPreviewBridge(options: { upstream: string; allowedOrigin: string }) {
  const upstream = previewOrigin(options.upstream), origin = new URL(options.allowedOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== options.allowedOrigin || origin.username || origin.password) throw Error("Set an exact http(s) page origin without a trailing slash");
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Vary", "Origin");
    const fail = (code: number, message: string) => { res.writeHead(code, { "Content-Type": "text/plain" }); res.end(message); };
    const address = req.socket.localPort;
    if (req.headers.host !== `127.0.0.1:${address}` || req.headers.origin !== origin.origin) return fail(403, "Origin or host not allowed");
    res.setHeader("Access-Control-Allow-Origin", origin.origin);
    if (req.method === "OPTIONS") {
      if (req.headers["access-control-request-method"] !== "GET" || req.headers["access-control-request-headers"]) return fail(403, "Only plain GET requests are allowed");
      res.setHeader("Access-Control-Allow-Methods", "GET"); res.writeHead(204); res.end(); return;
    }
    if (req.method !== "GET") return fail(405, "Read-only preview: GET required");
    const status = req.url === "/status";
    if (!status && !/^\/image\/(0|[1-9][0-9]{0,14})\/[1-9][0-9]{0,14}$/.test(req.url ?? "")) return fail(404, "Preview route not found");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4500);
    res.on("close", () => controller.abort());
    try {
      const response = await fetch(`${upstream}/api${req.url}`, { signal: controller.signal, redirect: "error" });
      const bytes = await boundedResponse(response, status ? 65536 : MAX_PREVIEW_BYTES);
      if (status) {
        const body = JSON.stringify(sanitizeStatus(JSON.parse(new TextDecoder().decode(bytes))));
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(body);
      } else {
        if (response.headers.get("content-type")?.split(";")[0] !== "image/png") throw Error("Invalid image type");
        pngDimensions(bytes); res.writeHead(200, { "Content-Type": "image/png" }); res.end(new Uint8Array(bytes));
      }
    } catch { if (!res.destroyed) fail(502, "Local preview unavailable or unsupported; check the driver and bridge configuration"); }
    finally { clearTimeout(timer); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), values: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--upstream", "--allow-origin", "--port"].includes(args[i]) || !args[i + 1] || values[args[i]]) throw Error("Usage: npm run ultrasound:bridge -- --upstream http://127.0.0.1:PORT --allow-origin http://127.0.0.1:4335 [--port 4337]");
    values[args[i]] = args[i + 1];
  }
  if (!values["--upstream"] || !values["--allow-origin"]) throw Error("Explicit --upstream and --allow-origin are required");
  const port = Number(values["--port"] ?? 4337); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid bridge port");
  const server = createPreviewBridge({ upstream: values["--upstream"], allowedOrigin: values["--allow-origin"] });
  server.on("error", () => { console.error("Could not start preview bridge; check the configured port"); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`Read-only preview bridge: http://127.0.0.1:${port} (allowed page: ${values["--allow-origin"]}). No acquisition is started.`));
}
