import { z } from "zod";
import { findComponent, validateComposition, lockComposition, type Composition } from "@opendevicedb/components";
import type { ToolDef, Context, Result } from "./tools.ts";

const id = z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/);
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
const identity = { id, version };
const composition = z.record(z.string(), z.unknown()).describe("An odb-composition/1 document. This tool never executes it.");
const target = z.enum(["browser", "desktop-linux-x64", "server"]).default("browser");
const response = (body: Record<string, unknown>): Result => ({ ok: true, format: "odb-components-result/1", ...body });

export const COMPONENT_TOOLS: ToolDef[] = [
  {
    name: "search_components", title: "Discover reusable components",
    description: "Search reusable processing, source and UI components independently of device records. Returns exact versions, availability, targets, contracts and evidence; does not execute code or access hardware.",
    shape: { query: z.string().max(500).default(""), target: target.optional(), contract: z.string().optional(), device: id.optional(), limit: z.number().int().min(1).max(100).default(20) },
    run: async (ctx, a) => {
      const registry = await ctx.backend.registry();
      const tokens = String(a.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const matches = registry.components.filter(c => c.status !== "deprecated" &&
        tokens.every((t: string) => `${c.id} ${c.title} ${c.description} ${c.roles.join(" ")}`.toLowerCase().includes(t)) &&
        (!a.target || c.targets.includes(a.target)) && (!a.contract || Object.values(c.ports).some(p => p.contract === a.contract)) && (!a.device || c.devices?.includes(a.device)));
      return response({ total: matches.length, components: matches.slice(0, a.limit ?? 20) });
    },
  },
  {
    name: "get_component", title: "Read an exact component release",
    description: "Return a versioned manifest, artifact/source digests, ports, parameters and real evidence. No installation or execution.", shape: identity,
    run: async (ctx, a) => { const component = findComponent(await ctx.backend.registry(), a.id, a.version); return component ? response({ component }) : { ok: false, error: "Component version not found" }; },
  },
  {
    name: "inspect_component", title: "Inspect sources and WASM without execution",
    description: "Read corresponding sources, documented behavior, fixtures and static WASM imports/exports/signature. Does not instantiate the module or run a start function.", shape: identity,
    run: async (ctx, a) => { const inspection = await ctx.backend.inspectComponent(a.id, a.version); return inspection ? response({ inspection }) : { ok: false, error: "Component version not found" }; },
  },
  ...["validate_composition", "resolve_composition"].map(name => ({
    name, title: name === "resolve_composition" ? "Resolve and lock a composition" : "Validate composition contracts",
    description: "Check exact versions, declared target, ports, required inputs, parameters, cycles and supplied locks. Missing hardware permissions remain runtime prerequisites; no code or hardware actions run.",
    shape: { composition, target },
    run: async (ctx: Context, a: any) => {
      const registry = await ctx.backend.registry();
      const result = validateComposition(a.composition, registry, a.target ?? "browser");
      return response({ ...result, target: a.target ?? "browser", ...(result.valid && name === "resolve_composition" ? {
        composition: lockComposition(a.composition as Composition, registry, a.target ?? "browser"),
        required_permissions: [...new Set((a.composition as Composition).nodes.flatMap(n => findComponent(registry, n.component, n.version)?.permissions ?? []))],
        hardware_validation: "not-performed",
      } : {}) });
    },
  })),
  {
    name: "get_integration_guide", title: "Integrate a component into an external application",
    description: "Return the pilot SDK, exact manifest and artifact references, supported ABI and tests for agent-created apps. Unsupported targets are reported explicitly.", shape: { ...identity, target },
    run: async (ctx, a) => {
      const c = findComponent(await ctx.backend.registry(), a.id, a.version);
      if (!c) return { ok: false, error: "Component version not found" };
      if (!c.targets.includes(a.target ?? "browser")) return { ok: false, error: `This release does not declare ${a.target}`, supported_targets: c.targets };
      const replay = c.runtime?.entry === "probe-recording" || c.id === "ultrasound/convex-open-image";
      const capture = !replay && ["odb.usb-source/1", "odb.ultrasound.decode/1"].includes(c.runtime?.abi ?? "");
      const video = c.runtime?.abi.startsWith("odb.video-");
      return response({ component: c, guide: replay ? "components/ultrasound/convex-open-image/0.1.0/README.md" : capture ? "knowledge/implementation/browser-ultrasound-capture.md" : video ? "knowledge/implementation/ultrasound-preview.md" : "knowledge/implementation/component-pilot.md", sdk: replay ? "@opendevicedb/components/probe-replay" : capture ? "@opendevicedb/components/probe-session" : video ? "@opendevicedb/components/video" : "@opendevicedb/components/host", runtime_abi: c.runtime?.abi,
        steps: ["Pin this exact release and verify source, manifest and artifact digests.", replay ? "Use ProbeReplaySession with an explicitly selected local recording, reconstruction-only WASM worker and isolated acknowledged frame renderers. Initialize with purpose reconstruction, without resources. No USB access or command binding is supported." : capture ? "Use ProbeCaptureSession with an explicitly selected WebUSB device, locally loaded probe resources, WASM worker and isolated frame renderer. No native driver server is used." : video ? "Use VideoSession with an explicit runtime-only loopback bridge URL and isolated, acknowledged frame renderers. The bridge only reads existing driver images; it cannot start acquisition." : "Use ScalarSession with a worker transform executor and isolated UI renderer, or implement the documented ABI in your host.", "Run the supplied fixtures; preserve timestamps, units and session context.", "Obtain device/file permissions explicitly on the destination host.", "Retain corresponding source and licenses; hardware validation is separate."], fixtures: c.fixtures });
    },
  },
  {
    name: "prepare_app_export", title: "Check desktop export prerequisites",
    description: "Return a preparation plan only. Reports unavailable desktop targets/build hosts explicitly; never claims a source recipe is an installable application or triggers a build/publication.", shape: { composition, target: z.enum(["desktop-linux-x64"]).default("desktop-linux-x64") },
    run: async (ctx, a) => {
      const registry = await ctx.backend.registry();
      const resolved = validateComposition(a.composition, registry, a.target ?? "desktop-linux-x64");
      return response({ stage: "preparation", package_available: false, target: a.target ?? "desktop-linux-x64", ...resolved,
        blockers: [...resolved.diagnostics.map(d => d.message), "A desktop package builder and tested native host are not yet available."],
        build_started: false, hardware_validation: "not-performed" });
    },
  },
];
