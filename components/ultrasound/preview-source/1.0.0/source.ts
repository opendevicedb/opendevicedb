// SPDX-License-Identifier: AGPL-3.0-or-later
// Read-only client for the explicit local preview bridge. No USB or acquisition commands.
export const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
export interface UltrasoundStatus {
  format: "odb.ultrasound-preview/1";
  profile: "linear-01" | "convex-01" | "unknown";
  phase: string; session: number; frame: number | null; replay: boolean;
}
export interface UltrasoundFrame {
  format: "odb.video.frame/1"; encoding: "image/png"; data: ArrayBuffer;
  width: number; height: number; sequence: number; session: string;
  received_at: number; timebase: "host-receipt"; mode: "live" | "replay" | "snapshot";
  profile: UltrasoundStatus["profile"]; calibrated: false;
}
export function previewOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw Error("Use a local preview bridge URL such as http://127.0.0.1:4337");
  return url.origin;
}
export async function boundedResponse(response: Response, limit: number): Promise<ArrayBuffer> {
  if (!response.ok) throw Error(`Preview request failed (HTTP ${response.status})`);
  const reader = response.body?.getReader(); if (!reader) throw Error("Empty preview response");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw Error("Preview exceeds its size limit"); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes.buffer;
}
export function pngDimensions(buffer: ArrayBuffer): { width: number; height: number } {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes.length < 33 || ![137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n) || view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12,16)) !== "IHDR") throw Error("The preview is not a PNG frame");
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 2048 || height > 2048) throw Error("Preview dimensions exceed 2048 × 2048 pixels");
  return { width, height };
}
export class UltrasoundPreviewSource {
  readonly origin: string;
  private previous = "";
  private expectedProfile: string;
  private request: typeof fetch;
  constructor(url: string, expectedProfile: string, request: typeof fetch = fetch) {
    this.origin = previewOrigin(url); this.expectedProfile = expectedProfile; this.request = request.bind(globalThis);
    if (!["linear-01", "convex-01"].includes(expectedProfile)) throw Error("Choose the linear or convex probe profile");
  }
  async poll(signal: AbortSignal): Promise<{ status: UltrasoundStatus; frame?: UltrasoundFrame }> {
    const options = { signal, credentials: "omit" as const, cache: "no-store" as const, redirect: "error" as const };
    const response = await this.request(`${this.origin}/status`, options);
    const s: UltrasoundStatus = JSON.parse(new TextDecoder().decode(await boundedResponse(response, 16384)));
    if (s?.format !== "odb.ultrasound-preview/1" || !["linear-01", "convex-01", "unknown"].includes(s.profile) || typeof s.phase !== "string" || typeof s.replay !== "boolean" || !Number.isSafeInteger(s.session) || s.session < 0 || !(s.frame === null || Number.isSafeInteger(s.frame) && s.frame > 0)) throw Error("Invalid ultrasound preview status");
    // Legacy replay servers may omit a profile. They remain explicitly unassigned replays.
    if (s.profile !== this.expectedProfile && !(s.profile === "unknown" && s.replay)) throw Error(`The local driver reports ${s.profile}; this application expects ${this.expectedProfile}`);
    const key = `${s.session}:${s.frame}:${s.profile}:${s.replay}:${["acquiring", "reconstructing"].includes(s.phase)}`;
    if (s.frame === null || key === this.previous) return { status: s };
    const image = await this.request(`${this.origin}/image/${s.session}/${s.frame}`, options);
    const data = await boundedResponse(image, MAX_PREVIEW_BYTES), dimensions = pngDimensions(data);
    signal.throwIfAborted(); this.previous = key;
    return { status: s, frame: { format: "odb.video.frame/1", encoding: "image/png", data, ...dimensions,
      sequence: s.frame, session: String(s.session), received_at: Date.now(), timebase: "host-receipt", mode: s.replay ? "replay" : ["acquiring", "reconstructing"].includes(s.phase) ? "live" : "snapshot", profile: s.profile, calibrated: false } };
  }
}
