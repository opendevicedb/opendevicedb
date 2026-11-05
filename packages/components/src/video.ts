// Shared session orchestration for a read-only ultrasound preview and reusable video interfaces.
import { findComponent, lockComposition, parameterValues, validateComposition, type Composition, type Registry, type RegisteredComponent } from "./browser.ts";
import { UltrasoundPreviewSource, type UltrasoundFrame, type UltrasoundStatus } from "../../../components/ultrasound/preview-source/1.0.0/source.ts";
export type { UltrasoundFrame, UltrasoundStatus } from "../../../components/ultrasound/preview-source/1.0.0/source.ts";
export interface VideoRenderer { update(frame: UltrasoundFrame): Promise<void>; close(): void }
export interface VideoHost {
  bridgeUrl: string;
  prepareInterface(component: RegisteredComponent, node: string, signal: AbortSignal): Promise<VideoRenderer>;
  onState?(state: "running" | "stopped" | "error", error?: string): void;
  onStatus?(status: UltrasoundStatus): void;
  onFrame?(frame: Omit<UltrasoundFrame, "data">): void;
}
export class VideoSession {
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private renderers: VideoRenderer[] = [];
  private started = false;
  private registry: Registry;
  private host: VideoHost;
  readonly composition: Composition;
  constructor(composition: Composition, registry: Registry, host: VideoHost) {
    this.composition = lockComposition(composition, registry); this.registry = registry; this.host = host;
  }
  async start() {
    if (this.started) throw Error("Create a new video session to reconnect"); this.started = true;
    const c = this.composition, result = validateComposition(c, this.registry, "browser", true);
    if (!result.valid) throw Error(result.diagnostics.map(d => d.message).join("; "));
    const nodes = c.nodes.map(n => ({ ...n, manifest: findComponent(this.registry, n.component, n.version)! }));
    const sources = nodes.filter(n => n.manifest.runtime?.kind === "host");
    const displays = nodes.filter(n => n.manifest.runtime?.abi === "odb.video-ui/1");
    if (sources.length !== 1 || sources[0].manifest.runtime?.entry !== "ultrasound-preview" || !sources[0].manifest.permissions.includes("ultrasound.preview") || displays.length < 1 || displays.length > 4 || nodes.length !== displays.length + 1) throw Error("Video preview requires one read-only source and one to four video displays");
    const parameters = parameterValues(sources[0].manifest, sources[0].parameters);
    const source = new UltrasoundPreviewSource(this.host.bridgeUrl, String(parameters.profile));
    const signal = this.controller.signal;
    try {
      for (const display of displays) {
        signal.throwIfAborted();
        const renderer = await this.host.prepareInterface(display.manifest, display.id, signal);
        if (signal.aborted) { renderer.close(); throw Error("Video preview stopped during preparation"); }
        this.renderers.push(renderer);
      }
      signal.throwIfAborted(); this.host.onState?.("running");
      const tick = async () => {
        if (signal.aborted) return;
        try {
          const result = await source.poll(AbortSignal.any([signal, AbortSignal.timeout(5000)]));
          signal.throwIfAborted(); this.host.onStatus?.(result.status);
          if (result.frame) {
            // Each isolated consumer owns its copy; await acknowledgements before reading another frame.
            await Promise.all(this.renderers.map(renderer => renderer.update({ ...result.frame!, data: result.frame!.data.slice(0) })));
            signal.throwIfAborted(); const { data: _data, ...metadata } = result.frame; this.host.onFrame?.(metadata);
          }
          if (!signal.aborted) this.timer = setTimeout(tick, Number(parameters.interval));
        } catch (e) { if (!signal.aborted) { this.stop(); this.host.onState?.("error", (e as Error).message); } }
      }; void tick();
    } catch (e) { this.stop(); throw e; }
  }
  stop() {
    if (this.controller.signal.aborted) return;
    this.controller.abort(); if (this.timer) clearTimeout(this.timer);
    for (const renderer of this.renderers.splice(0)) { try { renderer.close(); } catch {} }
    this.host.onState?.("stopped");
  }
}
