// Host SDK for the scalar pilot. Contributor WASM executes through an injected worker
// executor; interface code runs through an injected sandbox renderer, never in this module.
import { findComponent, lockComposition, parameterValues, validateComposition, type Registry, type Composition, type RegisteredComponent } from "./browser.ts";

export interface ScalarSample { format: "odb.scalar/1"; value: number | null; unit: string; timestamp: number; source: string; session: string; label?: string }
export const RECORDED_VALUES = [10, 20, 30, 20, 10];
export interface SessionHost {
  prepareTransform(component: RegisteredComponent, signal: AbortSignal): Promise<{ process(value: number, factor: number): Promise<number>; close(): void }>;
  prepareInterface(component: RegisteredComponent, node: string, signal: AbortSignal): Promise<{ update(sample: ScalarSample): void; close(): void }>;
  usbDevice?: { deviceVersionMajor: number };
  values?: number[];
  onSample?(sample: ScalarSample): void;
  onState?(state: "running" | "stopped" | "error", error?: string): void;
}

export class ScalarSession {
  private aborter = new AbortController();
  private cleanups: (() => void)[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private active = false;
  private started = false;
  readonly id = globalThis.crypto.randomUUID();
  readonly composition: Composition;
  private registry: Registry;
  private host: SessionHost;
  constructor(composition: Composition, registry: Registry, host: SessionHost) {
    this.registry = registry; this.host = host;
    this.composition = lockComposition(composition, registry);
  }
  async start(): Promise<void> {
    if (this.started) throw Error("A session cannot be restarted; create a new session explicitly");
    this.started = true;
    const signal = this.aborter.signal, c = this.composition;
    const result = validateComposition(c, this.registry, "browser", true);
    if (!result.valid) throw Error(result.diagnostics.map(d => d.message).join("; "));
    const nodes = new Map(c.nodes.map(n => [n.id, { ...n, manifest: findComponent(this.registry, n.component, n.version)! }]));
    const sources = [...nodes.values()].filter(n => n.manifest.runtime?.kind === "host");
    if (sources.length !== 1) throw Error("The scalar pilot requires exactly one source");
    const source = sources[0];
    const params = parameterValues(source.manifest, source.parameters);
    const usb = source.manifest.runtime!.entry === "usb-descriptors";
    if (usb && (!source.manifest.permissions.includes("usb.descriptors") || !this.host.usbDevice)) throw Error("Select and authorize a USB device before starting this application");
    const values = this.host.values ?? RECORDED_VALUES;
    if (!Array.isArray(values) || !values.length || values.length > 4096 || values.some(n => !Number.isFinite(n))) throw Error("Recorded input must contain 1–4096 finite numbers");
    const transforms = new Map<string, Awaited<ReturnType<SessionHost["prepareTransform"]>>>();
    const interfaces = new Map<string, Awaited<ReturnType<SessionHost["prepareInterface"]>>>();
    const release = (close: () => void) => { if (signal.aborted) { close(); throw Error("Session stopped during preparation"); } this.cleanups.push(close); };
    try {
      // Prepare consumers before producers; do not emit data until all dependencies are ready.
      for (const id of [...result.order].reverse()) {
        signal.throwIfAborted();
        const node = nodes.get(id)!, kind = node.manifest.runtime?.kind;
        if (kind === "wasm") { const handle = await this.host.prepareTransform(node.manifest, signal); release(() => handle.close()); transforms.set(id, handle); }
        else if (kind === "web-component") { const handle = await this.host.prepareInterface(node.manifest, id, signal); release(() => handle.close()); interfaces.set(id, handle); }
        else if (kind !== "host") throw Error(`Unsupported runtime for ${id}`);
      }
      signal.throwIfAborted(); this.active = true; this.host.onState?.("running");
      let index = 0;
      const tick = async () => {
        if (!this.active || signal.aborted) return;
        try {
          const sample: ScalarSample = { format: "odb.scalar/1", value: usb ? this.host.usbDevice!.deviceVersionMajor : values[index++ % values.length],
            unit: usb ? "major revision" : String(params.unit ?? "count"), timestamp: Date.now(), source: usb ? "Selected USB device descriptor" : "Recorded fixture replay", session: this.id };
          const outputs = new Map<string, ScalarSample>([[source.id, sample]]);
          for (const id of result.order) {
            if (id === source.id) continue;
            signal.throwIfAborted();
            const edge = c.connections.find(e => e.to.split(".")[0] === id);
            const input = edge ? outputs.get(edge.from.split(".")[0]) : undefined;
            if (!input || input.value === null) continue;
            const node = nodes.get(id)!;
            let output = input;
            if (transforms.has(id)) {
              const factor = parameterValues(node.manifest, node.parameters).factor;
              const value = await transforms.get(id)!.process(input.value, Number(factor));
              signal.throwIfAborted();
              if (!Number.isFinite(value)) throw Error(`Non-finite result from ${id}`);
              output = { ...input, value }; outputs.set(id, output);
            }
            if (interfaces.has(id)) { interfaces.get(id)!.update({ ...output, label: node.manifest.title }); this.host.onSample?.(output); }
          }
          if (this.active) this.timer = setTimeout(tick, Number(params.interval ?? 500));
        } catch (e) { if (!signal.aborted) { this.stop(); this.host.onState?.("error", (e as Error).message); } }
      };
      // One in-flight sample; backpressure pauses production and cannot grow an unbounded queue.
      void tick();
    } catch (e) { this.stop(); throw e; }
  }
  stop() {
    if (this.aborter.signal.aborted) return;
    this.active = false; this.aborter.abort(); if (this.timer) clearTimeout(this.timer);
    for (const close of this.cleanups.reverse()) { try { close(); } catch { /* release all remaining resources */ } }
    this.cleanups = []; this.host.onState?.("stopped");
  }
}
