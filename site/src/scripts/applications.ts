import { validateComposition, validateCompositionShape, lockComposition, findComponent, parameterValues, type Composition, type Registry, type RegisteredComponent } from "@opendevicedb/components/browser";
import { ScalarSession, type ScalarSample, type SessionHost } from "@opendevicedb/components/host";
import { VideoSession, type UltrasoundFrame } from "@opendevicedb/components/video";
import { ProbeCaptureSession, type ProbeDecoderHost } from "@opendevicedb/components/probe-session";
import { ProbeReplaySession, type Recording } from "@opendevicedb/components/probe-replay";
import { validateResources, type ProbeResources } from "@opendevicedb/components/probe-decoder";
import "../styles/applications.css";

let loading: Promise<Registry> | undefined;
export function loadComponentRegistry(): Promise<Registry> {
  return loading ??= fetch("/api/components.json").then(async r => {
    if (!r.ok) throw Error(`Component registry: HTTP ${r.status}`);
    const registry = await r.json();
    if (registry?.format !== "odb-registry/1" || !Array.isArray(registry.components) || !Array.isArray(registry.compositions)) throw Error("Invalid component registry");
    return registry;
  }).catch(e => { loading = undefined; throw e; });
}

async function artifact(component: RegisteredComponent, signal: AbortSignal): Promise<ArrayBuffer> {
  const asset = component.artifact;
  if (!asset || !/^components\/[a-z0-9/-]+\/[0-9]+\.[0-9]+\.[0-9]+\/[a-zA-Z0-9_.-]+$/.test(asset.path)) throw Error("Invalid artifact reference");
  const response = await fetch(`/_components/${asset.path}`, { signal });
  if (!response.ok) throw Error(`Artifact unavailable: HTTP ${response.status}`);
  const reader = response.body!.getReader(), chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > (component.runtime?.abi === "odb.ultrasound.decode/1" ? 2097152 : 262144)) { await reader.cancel(); throw Error("Pilot artifact exceeds 256 KiB"); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
  if (digest !== asset.sha256) throw Error(`Artifact integrity check failed for ${component.id}`);
  return bytes.buffer;
}

export async function prepareTransform(component: RegisteredComponent, signal: AbortSignal) {
  const bytes = await artifact(component, signal);
  signal.throwIfAborted();
  const worker = new Worker(new URL("./component-worker.ts", import.meta.url), { type: "module" });
  let serial = 0, closed = false;
  const pending = new Map<number, { resolve(value: number): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const close = () => {
    if (closed) return; closed = true; worker.terminate(); signal.removeEventListener("abort", close);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error("Scalar worker stopped")); } pending.clear();
  };
  signal.addEventListener("abort", close, { once: true });
  const call = (message: Record<string, unknown>) => new Promise<number>((resolve, reject) => {
    if (closed) return reject(Error("Scalar worker stopped"));
    const id = ++serial;
    const timer = setTimeout(() => { reject(Error("Scalar worker exceeded its time budget")); close(); }, 3000);
    pending.set(id, { resolve, reject, timer }); worker.postMessage({ ...message, id });
  });
  worker.onmessage = ({ data }) => { const p = pending.get(data.id); if (!p) return; clearTimeout(p.timer); pending.delete(data.id); data.ok ? p.resolve(data.value) : p.reject(Error(data.error)); };
  worker.onerror = event => { event.preventDefault(); close(); };
  try { await call({ type: "init", bytes, entry: component.runtime!.entry }); }
  catch (e) { close(); throw e; }
  return { process: (value: number, factor: number) => call({ type: "process", value, factor }), close };
}

async function prepareProbeDecoder(component: RegisteredComponent, resources: ProbeResources | undefined, signal: AbortSignal, purpose: "acquisition" | "reconstruction" = "acquisition"): Promise<ProbeDecoderHost> {
  const bytes = await artifact(component, signal); signal.throwIfAborted();
  const worker = new Worker(new URL("./probe-worker.ts", import.meta.url), { type: "module" });
  let serial = 0, closed = false;
  const pending = new Map<number, { resolve(value: any): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const close = () => { if (closed) return; closed = true; worker.terminate(); signal.removeEventListener("abort", close); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error("Probe decoder stopped")); } pending.clear(); };
  signal.addEventListener("abort", close, { once: true });
  const call = (type: string, input: Record<string, unknown> = {}, transfers: Transferable[] = []) => new Promise<any>((resolve, reject) => {
    if (closed) return reject(Error("Probe decoder stopped")); const id = ++serial;
    const timer = setTimeout(() => { reject(Error("Probe decoder exceeded its time budget")); close(); }, 15000);
    pending.set(id, { resolve, reject, timer }); worker.postMessage({ type, id, ...input }, transfers);
  });
  worker.onmessage = ({ data }) => { const p = pending.get(data.id); if (!p) return; clearTimeout(p.timer); pending.delete(data.id); data.ok ? p.resolve(data.value) : p.reject(Error(data.error)); };
  worker.onerror = e => { e.preventDefault(); close(); };
  const binary = (type: string, value: Uint8Array) => { const buffer = value.slice().buffer; return call(type, { bytes: buffer }, [buffer]); };
  try { await call("init", { bytes, resources, options: { purpose, continuous: purpose === "reconstruction" } }, [bytes]); } catch (e) { close(); throw e; }
  return { decodeMessage: bytes => binary("decode-message", bytes), bind: bytes => binary("bind", bytes), push: bytes => binary("push", bytes), finish: () => call("finish"), close };
}

async function prepareInterface(component: RegisteredComponent, node: string, panel: HTMLElement, signal: AbortSignal) {
  const bytes = new Uint8Array(await artifact(component, signal));
  signal.throwIfAborted();
  const frame = document.createElement("iframe"); frame.title = component.title;
  frame.setAttribute("sandbox", "allow-scripts"); frame.referrerPolicy = "no-referrer";
  frame.setAttribute("allow", "camera 'none'; microphone 'none'; usb 'none'; serial 'none'");
  frame.dataset.node = node;
  const channel = new MessageChannel();
  const base64 = btoa(Array.from(bytes, n => String.fromCharCode(n)).join(""));
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src data:; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script src="data:text/javascript;base64,${base64}"></script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  let closed = false;
  let awaiting: { session: string; sequence: number; resolve(): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> } | undefined;
  channel.port1.onmessage = ({ data }) => {
    if (!awaiting) return;
    if (data?.type === "odb-video-error/1" || data?.type === "odb-video-rendered/1" && data.session === awaiting.session && data.sequence === awaiting.sequence) {
      clearTimeout(awaiting.timer); const pending = awaiting; awaiting = undefined;
      data.type === "odb-video-error/1" ? pending.reject(Error("Could not display the video frame")) : pending.resolve();
    }
  }; channel.port1.start();
  const close = () => { if (closed) return; closed = true;
    if (awaiting) { clearTimeout(awaiting.timer); awaiting.reject(Error("Video display stopped")); awaiting = undefined; }
    frame.remove(); channel.port1.close(); channel.port2.close(); URL.revokeObjectURL(url); signal.removeEventListener("abort", close); };
  signal.addEventListener("abort", close, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const aborted = () => { clearTimeout(timer); reject(Error("Interface preparation stopped")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); close(); reject(Error("Interface did not load")); }, 3000);
      signal.addEventListener("abort", aborted, { once: true });
      frame.onload = () => { clearTimeout(timer); signal.removeEventListener("abort", aborted); if (signal.aborted) return reject(Error("Interface preparation stopped")); frame.contentWindow!.postMessage("odb-ui-connect/1", "*", [channel.port2]); resolve(); };
      frame.src = url; panel.append(frame);
    });
  } catch (e) { close(); throw e; }
  return { update(sample: ScalarSample | UltrasoundFrame): Promise<void> {
    if (closed) return Promise.reject(Error("Display stopped"));
    if (sample.format !== "odb.video.frame/1") { channel.port1.postMessage(sample); return Promise.resolve(); }
    if (awaiting) return Promise.reject(Error("A frame is already in flight"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { awaiting = undefined; reject(Error("Video display timed out")); close(); }, 3000);
      awaiting = { session: sample.session, sequence: sample.sequence, resolve, reject, timer };
      channel.port1.postMessage(sample, [sample.data]);
    });
  }, close };
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
  const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el;
};
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" }));
  const a = element("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const button = (label: string, action: () => unknown, primary = false) => { const b = element("button", label, primary ? "btn primary" : "btn"); b.type = "button"; b.addEventListener("click", action); return b; };

export async function openApplication(id: string, context: { usbDevice?: any } = {}) {
  const dialog = element("dialog", undefined, "application-dialog");
  dialog.setAttribute("aria-label", "Component application");
  const heading = element("h2", "Loading application…"), status = element("p", "Loading components", "app-status"); status.setAttribute("role", "status");
  const close = button("Close", () => dialog.close()); const header = element("div", undefined, "app-header"); header.append(heading, close);
  dialog.append(header, status); document.body.append(dialog); dialog.showModal();
  let session: ScalarSession | VideoSession | ProbeCaptureSession | ProbeReplaySession | undefined, pending = false;
  const dispose = () => { session?.stop(); dialog.remove(); };
  dialog.addEventListener("close", dispose, { once: true });
  try {
    const registry = await loadComponentRegistry();
    if (!dialog.isConnected) return;
    const original = registry.compositions.find(app => app.id === id); if (!original) throw Error("Application not found");
    let draft = structuredClone(original), values: number[] | undefined, probeResources: ProbeResources | undefined, recording: Recording | undefined;
    heading.textContent = original.title; dialog.append(element("p", original.description));
    const controls = element("div", undefined, "app-controls"), panel = element("div", undefined, "app-panels"), editor = element("section", undefined, "app-editor"); editor.hidden = true;
    const messages = element("p", undefined, "app-diagnostics"); messages.setAttribute("role", "status");
    const isCapture = () => draft.nodes.some(n => findComponent(registry, n.component, n.version)?.runtime?.entry === "probe-usb");
    const isReplay = () => draft.nodes.some(n => findComponent(registry, n.component, n.version)?.runtime?.entry === "probe-recording");
    const isVideo = () => draft.nodes.some(n => findComponent(registry, n.component, n.version)?.runtime?.abi === "odb.video-source/1");
    const sampleStatus = element("p", isCapture() || isVideo() || isReplay() ? "No image yet" : "No current value", "small muted");
    const advanced = element("details", undefined, "app-advanced"); advanced.append(element("summary", "Files and tests (advanced)"));
    const advancedControls = element("div", undefined, "app-controls"); advanced.append(advancedControls);
    const bridgeLabel = element("label", "Local preview bridge URL", "app-bridge");
    const bridgeInput = element("input"); bridgeInput.type = "url"; bridgeInput.value = "http://127.0.0.1:4337"; bridgeLabel.append(bridgeInput);
    const bridgeHelp = element("p", "Start the read-only bridge for your local probe driver, then connect. Connecting only reads images already supplied by the driver. The browser may ask for local network access.", "small muted");
    const bridgeDocs = element("a", "Preview bridge setup"); bridgeDocs.href = "/components/ultrasound-preview/"; bridgeHelp.append(" ", bridgeDocs);
    const resourcesLabel = element("label", "Probe resources (.odb-probe)", "app-bridge");
    const resourcesInput = element("input"); resourcesInput.type = "file"; resourcesInput.accept = ".odb-probe,application/json"; resourcesLabel.append(resourcesInput);
    const resourcesHelp = element("p", "Loaded into this browser only. No local server or upload is used.", "small muted");
    const captureSetup = element("div", undefined, "app-capture-setup");
    const recordingSetup = element("div");
    const recordingLabel = element("label", "Probe recording ", "app-bridge"), recordingInput = element("input");
    recordingInput.type = "file"; recordingInput.accept = ".bin,.odb-capture,.odb-stream"; recordingLabel.append(recordingInput);
    recordingSetup.append(recordingLabel, element("p", "Reconstructed locally with the original profile. No configuration file, upload or probe connection. Images have no calibrated distance scale.", "small muted"));
    recordingInput.addEventListener("change", () => {
      recording = recordingInput.files?.[0];
      status.textContent = recording ? "Recording selected. Choose Replay to reconstruct its images." : "Choose a local probe recording."; checkDraft();
    });
    const readyLabel = element("label"), readyInput = element("input"); readyInput.type = "checkbox"; readyLabel.append(readyInput, " The probe is currently placed on the phantom, ready for this capture.");
    const durationLabel = element("label", "Capture duration (seconds)"), durationInput = element("input"); durationInput.type = "number"; durationInput.min = "1"; durationInput.max = "30"; durationInput.value = "1"; durationLabel.append(durationInput);
    captureSetup.append(resourcesLabel, resourcesHelp, durationLabel, readyLabel);
    resourcesInput.addEventListener("change", async () => { probeResources = undefined; try { const file = resourcesInput.files?.[0]; if (file) { if (file.size > 24 * 1024 * 1024) throw Error("Resource bundle exceeds 24 MiB"); probeResources = await validateResources(JSON.parse(await file.text())); status.textContent = "Probe resources loaded locally. Ready to select the probe and capture."; } } catch (e) { status.textContent = (e as Error).message; } checkDraft(); });
    readyInput.addEventListener("change", checkDraft);
    durationInput.addEventListener("input", () => { const source = draft.nodes.find(n => findComponent(registry, n.component, n.version)?.runtime?.entry === "probe-usb"); if (source) { source.parameters.seconds = Number(durationInput.value); delete draft.lock; } if (editor.hidden) checkDraft(); else renderEditor(); });
    const run = button("Start", () => void start(), true);
    const stop = button("Stop", () => session?.stop()); stop.disabled = true;
    const customize = button("Customize", () => { editor.hidden = !editor.hidden; run.textContent = editor.hidden ? "Start" : "Apply and start"; renderEditor(); });
    controls.append(run, stop, customize);
    advancedControls.append(button("Download composition", () => {
      try { download("composition.json", lockComposition(draft, registry)); } catch { download("composition-draft.json", draft); }
    }));
    const importLabel = element("label", "Import composition "); const importInput = element("input"); importInput.type = "file"; importInput.accept = ".json,application/json";
    importLabel.append(importInput); advancedControls.append(importLabel);
    importInput.addEventListener("change", async () => {
      try {
        const file = importInput.files?.[0]; if (!file) return; if (file.size > 262144) throw Error("Composition exceeds 256 KiB");
        const value = JSON.parse(await file.text()), errors = validateCompositionShape(value); if (errors.length) throw Error(errors.join("; "));
        draft = value; editor.hidden = false; run.textContent = "Apply and start"; renderEditor();
        status.textContent = "Composition imported as a draft; the current session is unchanged.";
      } catch (e) { status.textContent = (e as Error).message; }
      importInput.value = "";
    });
    const fileLabel = element("label", "Recorded values (JSON array) "); const fileInput = element("input"); fileInput.type = "file"; fileInput.accept = ".json,application/json";
    fileLabel.append(fileInput); advancedControls.append(fileLabel);
    fileInput.addEventListener("change", async () => {
      try { const file = fileInput.files?.[0]; if (!file) return; if (file.size > 65536) throw Error("Recording exceeds 64 KiB");
        const input = JSON.parse(await file.text()); if (!Array.isArray(input) || !input.length || input.length > 4096 || input.some(n => typeof n !== "number" || !Number.isFinite(n))) throw Error("Choose a JSON array of 1–4096 finite numbers");
        values = input; status.textContent = "Recording selected locally. Choose Start to use it; no data is uploaded.";
      } catch (e) { status.textContent = (e as Error).message; } fileInput.value = "";
    });
    const report = button("Run fixture tests", () => void testFixtures()); advancedControls.append(report);
    dialog.append(recordingSetup, captureSetup, bridgeLabel, bridgeHelp, controls, messages, sampleStatus, panel, editor, advanced);

    async function start() {
      if (pending) return;
      const result = validateComposition(draft, registry); if (!result.valid) { messages.textContent = result.diagnostics.map(d => d.message).join(" · "); return; }
      pending = true; run.disabled = true;
      try {
        const previousStop = session?.stop(); panel.replaceChildren(); sampleStatus.textContent = isCapture() || isVideo() || isReplay() ? "Waiting for the first image" : "No current value";
        const needsUsb = draft.nodes.some(n => findComponent(registry, n.component, n.version)?.permissions.some(p => p === "usb.descriptors" || p === "usb.capture"));
        // Device chooser is opened within the initiating click, before unrelated awaits.
        if (needsUsb && !context.usbDevice) {
          if (!(navigator as any).usb) throw Error("WebUSB is unavailable in this browser");
          context.usbDevice = await (navigator as any).usb.requestDevice({ filters: isCapture() ? [{ vendorId: 0x04b4, productId: 0x4611 }] : [] });
        }
        await previousStop;
        if (!dialog.isConnected) return;
        const layout = structuredClone(draft.layout.application);
        const prepareUi = async (component: RegisteredComponent, node: string, signal: AbortSignal) => {
            const slot = element("section", undefined, "app-panel");
            const box = layout[node] ?? { x: 0, y: 0, width: 12, height: 4 };
            slot.style.gridColumn = `${box.x + 1} / span ${box.width}`; slot.style.gridRow = `${box.y + 1} / span ${box.height}`;
            panel.append(slot);
            try { const renderer = await prepareInterface(component, node, slot, signal); return { update: renderer.update, close: () => { renderer.close(); slot.remove(); } }; }
            catch (e) { slot.remove(); throw e; }
        };
        const host: SessionHost = {
          usbDevice: context.usbDevice, values: values ? [...values] : undefined,
          prepareTransform, prepareInterface: prepareUi,
          onSample: sample => { sampleStatus.textContent = `${sample.source} · ${sample.value} ${sample.unit}`; },
          onState: (state, error) => {
            status.textContent = error ? `Session stopped: ${error}` : state === "running" ? "Running locally" : "Stopped; no current value";
            stop.disabled = state !== "running"; if (state !== "running") sampleStatus.textContent = "No current value or image";
          },
        };
        let replayFrames = 0;
        session = isReplay() ? new ProbeReplaySession(draft, registry, {
          recording: recording!, prepareInterface: prepareUi,
          prepareDecoder: (component, signal) => prepareProbeDecoder(component, undefined, signal, "reconstruction"),
          onState: (state, error) => {
            status.textContent = error ? `Replay failed: ${error}` : state === "complete" ? `Replay complete: ${replayFrames} images. Original profile; uncalibrated.` : state === "running" ? "Reconstructing the local recording…" : "Replay stopped";
            recordingInput.disabled = state === "running"; stop.disabled = state === "stopped" || state === "error";
          },
          onFrame: f => { replayFrames++; sampleStatus.textContent = `Recorded replay · Frame ${f.sequence} · ${f.width} × ${f.height} · Uncalibrated`; },
        }) : isCapture() ? new ProbeCaptureSession(draft, registry, {
          usbDevice: context.usbDevice, resources: probeResources!, phantomReady: readyInput.checked,
          prepareDecoder: prepareProbeDecoder, prepareInterface: prepareUi,
          onState: (state, error) => {
            status.textContent = error ? `Capture stopped: ${error}` : state;
            const active = !error && !["Stopped", "Capture complete", "Capture failed"].includes(state);
            durationInput.disabled = resourcesInput.disabled = readyInput.disabled = active;
            stop.disabled = !!error || ["Stopped", "Capture complete", "Capture failed", "USB capture finished"].includes(state);
          },
          onFrame: f => { sampleStatus.textContent = `USB probe · Frame ${f.sequence} · ${f.width} × ${f.height} · Decoded in this browser`; },
        }) : isVideo() ? new VideoSession(draft, registry, {
          bridgeUrl: bridgeInput.value,
          prepareInterface: prepareUi,
          onState: (state, error) => {
            status.textContent = error ? `Preview stopped: ${error}` : state === "running" ? "Connected to preview bridge; waiting for an image" : "Disconnected from preview bridge";
            stop.disabled = state !== "running";
            if (state !== "running") sampleStatus.textContent = "No current image";
          },
          onStatus: s => { status.textContent = `${s.replay ? "Recorded replay" : "Driver preview"} · ${s.profile === "unknown" ? "Probe not identified" : s.profile} · ${s.phase}${s.frame === null ? " · Waiting for an image" : ""}`; },
          onFrame: f => { sampleStatus.textContent = `${f.mode === "replay" ? "Recorded replay" : f.mode === "live" ? "Live preview" : "Last acquired image"} · Frame ${f.sequence} · ${f.width} × ${f.height} · Uncalibrated`; },
        }) : new ScalarSession(draft, registry, host);
        await session.start();
        if (isCapture()) readyInput.checked = false;
      } catch (e) { session?.stop(); status.textContent = (e as Error).message; }
      finally { pending = false; checkDraft(); }
    }
    const disconnected = (event: any) => { if (event.device === context.usbDevice) { session?.stop(); context.usbDevice = undefined; status.textContent = "USB device disconnected. Select a device and start a new session explicitly."; } };
    (navigator as any).usb?.addEventListener("disconnect", disconnected);
    dialog.addEventListener("close", () => (navigator as any).usb?.removeEventListener("disconnect", disconnected), { once: true });

    function checkDraft() {
      const result = validateComposition(draft, registry);
      messages.textContent = result.valid ? "" : result.diagnostics.map(d => `${d.node ? d.node + ": " : ""}${d.message}`).join(" · ");
      run.disabled = pending || !result.valid || isCapture() && (!probeResources || !readyInput.checked) || isReplay() && !recording;
      recordingSetup.hidden = !isReplay();
      const video = isVideo(), capture = isCapture(); captureSetup.hidden = !capture;
      const captureSource = draft.nodes.find(n => findComponent(registry, n.component, n.version)?.runtime?.entry === "probe-usb");
      if (captureSource) durationInput.value = String(captureSource.parameters.seconds ?? findComponent(registry, captureSource.component, captureSource.version)!.parameters.seconds.default); bridgeLabel.hidden = bridgeHelp.hidden = !video;
      fileLabel.hidden = !draft.nodes.some(n => findComponent(registry, n.component, n.version)?.runtime?.entry === "recorded-scalars");
      report.hidden = !draft.nodes.some(n => findComponent(registry, n.component, n.version)?.fixtures.length);
      run.textContent = isReplay() ? "Replay recording" : capture ? "Start capture" : video ? "Connect preview" : editor.hidden ? "Start" : "Apply and start";
      stop.textContent = isReplay() ? "Stop replay" : capture ? "Stop capture" : video ? "Disconnect preview" : "Stop";
    }
    function changed() { delete draft.lock; checkDraft(); }
    function renderEditor() {
      editor.replaceChildren(element("h3", "Customize your application"), element("p", "Changes stay in this draft until you choose Apply and start. The published application is preserved."));
      const graph = element("div", undefined, "app-blocks");
      for (const node of draft.nodes) {
        const c = findComponent(registry, node.component, node.version); const block = element("article", undefined, "card app-block");
        block.append(element("h4", node.id));
        if (!c) { block.append(element("p", `Missing ${node.component}@${node.version}`)); graph.append(block); continue; }
        const label = element("label", "Component "), select = element("select"); select.setAttribute("aria-label", `${node.id} component`);
        for (const candidate of registry.components.filter(x => x.status === "available" && x.targets.includes("browser") && Object.entries(c.ports).every(([name, p]) => x.ports[name]?.contract === p.contract && x.ports[name]?.direction === p.direction))) {
          const option = element("option", `${candidate.title} ${candidate.version}`); option.value = `${candidate.id}@${candidate.version}`; option.selected = candidate.id === c.id && candidate.version === c.version; select.append(option);
        }
        select.addEventListener("change", () => { const [id, version] = select.value.split("@"); node.component = id; node.version = version; node.parameters = {}; changed(); renderEditor(); }); label.append(select); block.append(label);
        for (const [key, spec] of Object.entries(c.parameters)) {
          const paramLabel = element("label", `${key} `), input = element("input"); input.setAttribute("aria-label", `${node.id} ${key}`);
          const value = Object.hasOwn(node.parameters, key) ? node.parameters[key] : spec.default;
          input.type = spec.type === "boolean" ? "checkbox" : spec.type === "string" ? "text" : "number";
          if (input.type === "checkbox") input.checked = Boolean(value); else input.value = String(value);
          if (spec.minimum !== undefined) input.min = String(spec.minimum); if (spec.maximum !== undefined) input.max = String(spec.maximum); input.step = spec.type === "integer" ? "1" : "any";
          input.addEventListener("input", () => { node.parameters[key] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value; changed(); }); paramLabel.append(input); block.append(paramLabel);
        }
        if (c.roles.includes("interface")) {
          const box = draft.layout.application[node.id] ??= { x: 0, y: 0, width: 12, height: 4 };
          const layout = element("fieldset"); layout.append(element("legend", "Layout"));
          for (const key of ["x", "y", "width", "height"] as const) {
            const l = element("label", key + " "), input = element("input"); input.type = "number"; input.value = String(box[key]); input.setAttribute("aria-label", `${node.id} ${key}`);
            input.addEventListener("input", () => { box[key] = Number(input.value); changed(); }); l.append(input); layout.append(l);
          } block.append(layout);
        }
        block.append(element("p", Object.entries(c.ports).map(([name, p]) => `${p.direction}: ${node.id}.${name} (${p.contract})`).join(" · "), "small"));
        block.append(button(`Remove ${node.id}`, () => { draft.nodes = draft.nodes.filter(n => n.id !== node.id); draft.connections = draft.connections.filter(e => !e.from.startsWith(node.id + ".") && !e.to.startsWith(node.id + ".")); delete draft.layout.application[node.id]; changed(); renderEditor(); }));
        graph.append(block);
      }
      editor.append(graph, element("h4", "Connections"));
      const edges = element("ul");
      for (const edge of draft.connections) { const li = element("li", `${edge.from} → ${edge.to} `); li.append(button(`Remove connection ${edge.from} to ${edge.to}`, () => { draft.connections = draft.connections.filter(e => e !== edge); changed(); renderEditor(); })); edges.append(li); } editor.append(edges);
      const from = element("select"), to = element("select"); from.setAttribute("aria-label", "Output port"); to.setAttribute("aria-label", "Input port");
      for (const node of draft.nodes) for (const [name, p] of Object.entries(findComponent(registry, node.component, node.version)?.ports ?? {})) { const option = element("option", `${node.id}.${name}`); (p.direction === "out" ? from : to).append(option); }
      editor.append(from, to, button("Connect ports", () => { if (from.value && to.value) { draft.connections.push({ from: from.value, to: to.value }); changed(); renderEditor(); } }));
      const add = element("select"); add.setAttribute("aria-label", "Component to add");
      for (const c of registry.components.filter(c => c.status === "available" && c.targets.includes("browser"))) { const option = element("option", c.title); option.value = `${c.id}@${c.version}`; add.append(option); }
      editor.append(element("h4", "Add a block"), add, button("Add component", () => {
        const [component, version] = add.value.split("@"); let i = 1; while (draft.nodes.some(n => n.id === `block-${i}`)) i++;
        draft.nodes.push({ id: `block-${i}`, component, version, parameters: {} }); changed(); renderEditor();
      }), button("Restore published composition", () => { draft = structuredClone(original!); renderEditor(); checkDraft(); }));
      checkDraft();
    }
    async function testFixtures() {
      report.disabled = true;
      const controller = new AbortController(); dialog.addEventListener("close", () => controller.abort(), { once: true });
      const results: unknown[] = [];
      try {
        for (const node of draft.nodes) {
          const c = findComponent(registry, node.component, node.version); if (!c?.fixtures.length || c.runtime?.kind !== "wasm") continue;
          const transform = await prepareTransform(c, controller.signal);
          try { for (const fixture of c.fixtures) { const actual = await transform.process(fixture.input, fixture.factor); results.push({ component: c.id, version: c.version, artifact_sha256: c.artifact!.sha256, fixture, actual, result: actual === fixture.expected ? "passed" : "failed" }); } }
          finally { transform.close(); }
        }
        if (!results.length) throw Error("This composition has no executable scalar fixtures");
        const value = { format: "odb-component-report/1", kind: "fixture", created_at: new Date().toISOString(), host: "browser", results, hardware_validation: "not-performed" };
        status.textContent = "Fixture tests finished. Review the report below before downloading or sharing it.";
        const details = element("details"); details.open = true; details.append(element("summary", "Review fixture report"), element("pre", JSON.stringify(value, null, 2)), button("Download reviewed report", () => download("component-test-report.json", value))); dialog.append(details);
      } catch (e) { status.textContent = (e as Error).message; }
      finally { report.disabled = false; }
    }
    checkDraft(); status.textContent = isReplay() ? "Choose a local probe recording; no configuration file is needed." : isCapture() ? "Load the probe resources to capture directly in this browser." : isVideo() ? "Ready. Connect to the local preview bridge to read images." : "Ready. Choose Start to run locally.";
  } catch (e) { status.textContent = (e as Error).message; }
}

let installed = false;
export function installApplicationButtons() {
  if (installed) return; installed = true;
  document.addEventListener("click", event => {
    const target = (event.target as Element)?.closest<HTMLElement>("[data-open-application]");
    if (target?.dataset.openApplication) void openApplication(target.dataset.openApplication);
  });
}
