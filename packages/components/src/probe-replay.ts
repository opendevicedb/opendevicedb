// SPDX-License-Identifier: AGPL-3.0-or-later
import { findComponent, lockComposition, type Composition, type Registry, type RegisteredComponent } from "./browser.ts";
import { recordedProbeBytes, type Recording } from "../../../components/ultrasound/recorded-data/1.0.0/source.ts";
import { pngDimensions, type UltrasoundFrame } from "../../../components/ultrasound/preview-source/1.0.0/source.ts";
import type { VideoRenderer } from "./video.ts";
export type { Recording } from "../../../components/ultrasound/recorded-data/1.0.0/source.ts";
export interface ReplayDecoder {
  push(bytes: Uint8Array): Promise<{ sequence: number; data: ArrayBuffer }[]>;
  finish(): Promise<{ sequence: number; data: ArrayBuffer }[]>;
  close(): void;
}
export interface ProbeReplayHost {
  recording: Recording;
  prepareDecoder(component: RegisteredComponent, signal: AbortSignal): Promise<ReplayDecoder>;
  prepareInterface(component: RegisteredComponent, node: string, signal: AbortSignal): Promise<VideoRenderer>;
  onState?(state: "running" | "complete" | "stopped" | "error", error?: string): void;
  onFrame?(metadata: Omit<UltrasoundFrame, "data">): void;
}
/** File -> original Rust/WASM processor -> acknowledged displays. No USB host exists here. */
export class ProbeReplaySession {
  readonly composition: Composition;
  private controller = new AbortController();
  private renderers: VideoRenderer[] = [];
  private decoder?: ReplayDecoder;
  private started = false;
  private session = crypto.randomUUID();
  private registry: Registry;
  private host: ProbeReplayHost;
  done: Promise<void> = Promise.resolve();
  constructor(composition: Composition, registry: Registry, host: ProbeReplayHost) {
    this.composition = lockComposition(composition, registry);
    this.registry = registry; this.host = host;
  }
  async start() {
    if (this.started) throw Error("Create a new replay session"); this.started = true;
    const signal = this.controller.signal; signal.throwIfAborted();
    const nodes = this.composition.nodes.map(n => ({ ...n, c: findComponent(this.registry, n.component, n.version)! }));
    const sources = nodes.filter(n => n.c.runtime?.entry === "probe-recording");
    const decoders = nodes.filter(n => n.c.runtime?.abi === "odb.ultrasound.decode/1");
    const displays = nodes.filter(n => n.c.runtime?.abi === "odb.video-ui/1");
    if (sources.length !== 1 || decoders.length !== 1 || !displays.length || displays.length > 4 || nodes.length !== displays.length + 2 ||
        decoders[0].c.id !== "ultrasound/convex-open-image" || decoders[0].c.version !== "0.1.0" ||
        !this.composition.connections.some(e => e.from === `${sources[0].id}.bytes` && e.to === `${decoders[0].id}.bytes`) ||
        displays.some(n => !this.composition.connections.some(e => e.from === `${decoders[0].id}.frames` && e.to === `${n.id}.frames`))) throw Error("Replay requires a recording, the original image profile and connected frame displays");
    try {
      for (const display of displays) {
        const ui = await this.host.prepareInterface(display.c, display.id, signal);
        if (signal.aborted) { ui.close(); signal.throwIfAborted(); } this.renderers.push(ui);
      }
      const decoder = await this.host.prepareDecoder(decoders[0].c, signal);
      if (signal.aborted) { decoder.close(); signal.throwIfAborted(); } this.decoder = decoder;
      this.host.onState?.("running");
      this.done = this.replay().catch(e => { if (!signal.aborted) { this.release(); this.host.onState?.("error", (e as Error).message); } });
    } catch (e) { this.release(); throw e; }
  }
  private async replay() {
    const signal = this.controller.signal;
    for await (const bytes of recordedProbeBytes(this.host.recording, signal)) {
      signal.throwIfAborted(); await this.publish(await this.decoder!.push(bytes));
    }
    signal.throwIfAborted(); await this.publish(await this.decoder!.finish());
    signal.throwIfAborted(); this.decoder!.close(); this.decoder = undefined;
    this.host.onState?.("complete"); // Keep the final rendered image until Stop/Close.
  }
  private async publish(frames: { sequence: number; data: ArrayBuffer }[]) {
    const signal = this.controller.signal;
    for (const raw of frames) {
      signal.throwIfAborted();
      const frame: UltrasoundFrame = { format: "odb.video.frame/1", encoding: "image/png", ...pngDimensions(raw.data),
        data: raw.data, sequence: raw.sequence, session: this.session, received_at: Date.now(), timebase: "host-receipt", mode: "replay", profile: "unknown", calibrated: false };
      await Promise.all(this.renderers.map(ui => ui.update({ ...frame, data: frame.data.slice(0) })));
      signal.throwIfAborted(); const { data: _data, ...metadata } = frame; this.host.onFrame?.(metadata);
    }
  }
  private release() {
    this.controller.abort(); this.decoder?.close(); this.decoder = undefined;
    for (const ui of this.renderers.splice(0)) { try { ui.close(); } catch {} }
  }
  stop() {
    if (this.controller.signal.aborted) return;
    this.release(); this.host.onState?.("stopped");
  }
}
