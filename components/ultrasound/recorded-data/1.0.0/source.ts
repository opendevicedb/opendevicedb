// SPDX-License-Identifier: AGPL-3.0-or-later
// Host-owned file I/O only. Journals are data and are never dispatched as commands.
const CHUNK = 65536, MAX_LINE = 262144, MAX_JSON = 96 * 1024 * 1024;
export interface Recording extends Blob { readonly name: string }
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw Error("Invalid recording count");
  return value as number;
}
function data(row: any): Uint8Array {
  const length = count(row?.bytes);
  if (length > CHUNK || typeof row.base64 !== "string" || row.base64.length !== 4 * Math.ceil(length / 3) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.base64)) throw Error("Invalid recorded DATA encoding or size");
  const decoded = atob(row.base64);
  if (decoded.length !== length || btoa(decoded) !== row.base64) throw Error("Recorded DATA length or encoding mismatch");
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
}
async function* chunks(file: Blob, signal: AbortSignal) {
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    signal.throwIfAborted();
    const bytes = new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer());
    signal.throwIfAborted(); yield bytes;
  }
}
async function* lines(file: Blob, signal: AbortSignal) {
  const decoder = new TextDecoder("utf-8", { fatal: true }); let tail = "";
  for await (const bytes of chunks(file, signal)) {
    tail += decoder.decode(bytes, { stream: true });
    for (;;) {
      const end = tail.indexOf("\n"); if (end < 0) break;
      if (end > MAX_LINE) throw Error("Recording line exceeds 256 KiB");
      const line = tail.slice(0, end); tail = tail.slice(end + 1); yield line;
    }
    if (tail.length > MAX_LINE) throw Error("Recording line exceeds 256 KiB");
  }
  tail += decoder.decode(); if (tail.length) yield tail;
}
/** Yield exact DATA bytes, in order, without loading a continuous archive into RAM. */
export async function* recordedProbeBytes(file: Recording, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  signal.throwIfAborted();
  if (file.name.toLowerCase().endsWith(".bin")) { yield* chunks(file, signal); return; }
  if (file.name.toLowerCase().endsWith(".odb-capture")) {
    if (file.size > MAX_JSON) throw Error("Legacy capture exceeds 96 MiB; use a streaming .odb-stream recording");
    const archive = JSON.parse(await file.text()); signal.throwIfAborted();
    if (archive?.format !== "odb-probe-capture/1" || !Array.isArray(archive.data_reads)) throw Error("Invalid capture archive");
    let total = 0;
    // Validate the complete legacy container before yielding its first byte.
    for (const [index, row] of archive.data_reads.entries()) {
      if (row?.ordinal !== index + 1) throw Error("Recorded DATA ordinal gap or duplicate");
      total += data(row).length;
    }
    if (total !== count(archive.received_bytes)) throw Error("Capture byte total mismatch");
    for (const row of archive.data_reads) { signal.throwIfAborted(); yield data(row); }
    return;
  }
  if (!file.name.toLowerCase().endsWith(".odb-stream")) throw Error("Choose a .bin, .odb-capture or .odb-stream recording");
  let header: any, ordinal = 0, total = 0;
  for await (const line of lines(file, signal)) {
    const row = JSON.parse(line);
    if (!header) {
      if (row?.format !== "odb-probe-stream/1") throw Error("Invalid stream archive header");
      count(row.snapshot_last_ordinal); count(row.stored_bytes);
      if (row.omitted_bytes !== 0 || row.storage_error !== null) throw Error("Recording reports omitted bytes or a storage error");
      header = row; continue;
    }
    if (row?.ordinal !== ++ordinal || ordinal > header.snapshot_last_ordinal) throw Error("Stream ordinal gap, duplicate or trailing record");
    if (row.kind === "data") { const bytes = data(row); total += bytes.length; yield bytes; }
    else if (row.kind !== "journal" && row.kind !== "display") throw Error("Unknown stream record kind");
  }
  if (!header || ordinal !== header.snapshot_last_ordinal || total !== header.stored_bytes) throw Error("Truncated stream or byte total mismatch");
}
