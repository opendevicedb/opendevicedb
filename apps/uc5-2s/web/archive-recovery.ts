// Browser host storage only. Never open USB, change the schema or write stored sessions.
const DATABASE = 'odb-probe-direct-v1', BATCH = 64;
const result = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
});
async function existingDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB.databases === 'function' && !(await indexedDB.databases()).some(d => d.name === DATABASE)) return;
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DATABASE, 1); let created = false, settled = false;
    r.onupgradeneeded = () => { created = true; r.transaction!.abort(); };
    r.onblocked = () => { settled = true; reject(Error('Accès au stockage bloqué par une autre page.')); };
    r.onerror = e => { e.preventDefault(); if (!settled) { settled = true; created ? resolve(undefined) : reject(r.error); } };
    r.onsuccess = () => {
      const db = r.result;
      if (settled) { db.close(); return; }
      settled = true;
      if (!db.objectStoreNames.contains('sessions') || !db.objectStoreNames.contains('entries')) {
        db.close(); reject(Error('Format du stockage local non reconnu.')); return;
      }
      db.onversionchange = () => db.close(); resolve(db);
    };
  });
}
export interface StoredSession { id: string; startedAt: string | null; softwareClosed: boolean; storageWarning: boolean }
export async function listStoredSessions(after?: string): Promise<{ sessions: StoredSession[]; next?: string }> {
  const db = await existingDatabase(); if (!db) return { sessions: [] };
  try {
    const tx = db.transaction('sessions', 'readonly');
    const rows = await result<any[]>(tx.objectStore('sessions').getAll(after === undefined ? undefined : IDBKeyRange.lowerBound(after, true), 21));
    const sessions = rows.slice(0, 20).map(row => {
      if (typeof row?.id !== 'string' || !row.id.length) throw Error('Identifiant de session invalide.');
      return { id: row.id, startedAt: typeof row.started_at === 'string' && Number.isFinite(Date.parse(row.started_at)) ? row.started_at : null,
        softwareClosed: row.active === false, storageWarning: row.storage_error !== null || row.omitted_bytes !== 0 };
    });
    return { sessions, ...(rows.length > 20 ? { next: sessions.at(-1)!.id } : {}) };
  } finally { db.close(); }
}
function ordinal(cursor: IDBCursorWithValue | null, id: string): number {
  if (!cursor) return 0;
  const key = cursor.key;
  if (!Array.isArray(key) || key[0] !== id || !Number.isSafeInteger(key[1]) || (key[1] as number) < 1) throw Error('Ordre des données stockées invalide.');
  return key[1] as number;
}
type Progress = (phase: 'checking' | 'exporting' | 'warning', current: number, end: number) => void;
async function* prefix(db: IDBDatabase, id: string, end: number, signal: AbortSignal, phase: 'checking' | 'exporting', progress?: Progress) {
  let after = 0;
  while (after < end) {
    signal.throwIfAborted();
    const tx = db.transaction('entries', 'readonly');
    const rows = await result<any[]>(tx.objectStore('entries').getAll(IDBKeyRange.bound([id, after + 1], [id, end]), BATCH));
    signal.throwIfAborted();
    if (!rows.length) throw Error('Historique incomplet : données stockées manquantes.');
    for (const row of rows) {
      if (row.session !== id || row.ordinal !== after + 1 || row.ordinal > end) throw Error('Historique incomplet : trou ou doublon dans les données.');
      if (row.kind === 'data') {
        if (!(row.payload instanceof Uint8Array) || row.payload.length > 65536) throw Error('Bloc DATA stocké invalide.');
      } else if (row.kind !== 'journal' && row.kind !== 'display') throw Error('Type de donnée stockée inconnu.');
      after = row.ordinal; yield row;
    }
    signal.throwIfAborted(); progress?.(phase, after, end);
  }
}
/** Export a fixed persisted prefix; an unclosed recording never becomes a complete capture. */
export async function* recoverSessionLines(id: string, signal: AbortSignal, progress?: Progress): AsyncGenerator<string> {
  signal.throwIfAborted(); const db = await existingDatabase();
  if (!db) throw Error('Aucun historique dans ce navigateur.');
  try {
    signal.throwIfAborted();
    const tx = db.transaction(['sessions', 'entries'], 'readonly'), entries = tx.objectStore('entries');
    const range = IDBKeyRange.bound([id], [id, []]);
    // Issue all snapshot requests before yielding; capture both bounds in the same transaction.
    const [metadata, first, last] = await Promise.all([
      result<any>(tx.objectStore('sessions').get(id)), result(entries.openCursor(range)), result(entries.openCursor(range, 'prev')),
    ]);
    if (!metadata || metadata.id !== id) throw Error('Session stockée introuvable.');
    const end = ordinal(last, id);
    if (ordinal(first, id) !== (end ? 1 : 0)) throw Error('Historique incomplet : début manquant.');
    let total = 0;
    for await (const row of prefix(db, id, end, signal, 'checking', progress)) if (row.kind === 'data') {
      total += row.payload.length; if (!Number.isSafeInteger(total)) throw Error('Historique trop volumineux.');
    }
    signal.throwIfAborted();
    const volumeValid = Number.isSafeInteger(metadata.stored_bytes) && metadata.stored_bytes >= 0;
    const shortfall = volumeValid ? Math.max(0, metadata.stored_bytes - total) : null;
    let storageError = metadata.storage_error === null || typeof metadata.storage_error === 'string' ? metadata.storage_error : 'État de stockage inconnu';
    if (storageError === null && (!volumeValid || shortfall)) storageError = !volumeValid ? 'Compteur de stockage historique invalide' : 'Volume stocké inférieur au compteur historique : données manquantes';
    if (storageError !== null || metadata.omitted_bytes !== 0) progress?.('warning', end, end);
    yield JSON.stringify({ ...metadata, format: 'odb-probe-stream/1', id, stored_bytes: total, snapshot_last_ordinal: end,
      storage_error: storageError,
      omitted_bytes: Number.isSafeInteger(metadata.omitted_bytes) && metadata.omitted_bytes >= 0 ? metadata.omitted_bytes : null,
      recovery: { schema: 'odb-persisted-prefix-recovery/1', structure_checked: true, software_closed: metadata.active === false,
        capture_completeness: 'not-inferred', unpersisted_tail: 'unknown', metadata_stored_bytes: metadata.stored_bytes,
        metadata_shortfall_bytes: shortfall, metadata_storage_error: metadata.storage_error },
    }) + '\n';
    let exported = 0;
    for await (const row of prefix(db, id, end, signal, 'exporting', progress)) {
      const entry = row.kind === 'data' ? { ordinal: row.ordinal, kind: 'data', bytes: row.payload.length, base64: btoa(String.fromCharCode(...row.payload)) } :
        { ordinal: row.ordinal, kind: row.kind, value: row.payload };
      if (row.kind === 'data') exported += row.payload.length;
      yield JSON.stringify(entry) + '\n';
    }
    if (exported !== total) throw Error('Les données stockées ont changé pendant l’export.');
  } finally { db.close(); }
}

export async function saveRecoveredFile(name: string, lines: AsyncIterable<string>, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  // Open the chooser immediately in the click handler, before reading IndexedDB.
  if ('showSaveFilePicker' in window) {
    const handle = await (window as any).showSaveFilePicker({ suggestedName: name });
    signal.throwIfAborted(); const file = await handle.createWritable();
    try {
      for await (const line of lines) { signal.throwIfAborted(); await file.write(line); }
      signal.throwIfAborted(); await file.close();
    } catch (e) { await file.abort(); throw e; }
  } else {
    const parts: BlobPart[] = []; let bytes = 0; const encoder = new TextEncoder();
    for await (const line of lines) {
      signal.throwIfAborted(); bytes += encoder.encode(line).length;
      if (bytes > 33554432) throw Error('Export supérieur à32Mo : utiliser Chrome ou Chromium pour écrire directement sur disque.');
      parts.push(line);
    }
    signal.throwIfAborted();
    const url = URL.createObjectURL(new Blob(parts, { type: 'application/x-ndjson' })), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function mountArchiveRecovery() {
  const refresh = document.getElementById('history-refresh') as HTMLButtonElement;
  const next = document.getElementById('history-next') as HTMLButtonElement;
  const cancel = document.getElementById('history-cancel') as HTMLButtonElement;
  const list = document.getElementById('history-list')!, status = document.getElementById('history-status')!;
  let listing = false, exporting = false, after: string | undefined, controller: AbortController | undefined;
  const controls = () => {
    refresh.disabled = next.disabled = listing || exporting; cancel.disabled = !exporting;
    for (const button of list.querySelectorAll<HTMLButtonElement>('button')) button.disabled = exporting;
  };
  async function show(cursor?: string) {
    if (listing || exporting) return; listing = true; status.textContent = 'Lecture des sessions enregistrées…'; controls();
    try {
      const page = await listStoredSessions(cursor); after = page.next; list.replaceChildren();
      for (const item of page.sessions) {
        const row = document.createElement('li'), text = document.createElement('span'), button = document.createElement('button');
        const date = item.startedAt ? new Date(item.startedAt).toLocaleString('fr-FR') : 'Date inconnue';
        text.textContent = `${date} · ${item.softwareClosed ? 'Clôturée par le logiciel' : 'Fermeture non confirmée'}${item.storageWarning ? ' · Stockage à vérifier' : ''} · ${item.id}`;
        button.textContent = 'Exporter'; button.type = 'button'; button.setAttribute('aria-label', `Exporter la session ${item.id}`);
        button.onclick = () => void exportSession(item.id); row.append(text, button); list.append(row);
      }
      next.hidden = !after; status.textContent = page.sessions.length ? `${page.sessions.length} sessions affichées. Aucune connexion à la sonde.` : 'Aucune session enregistrée dans ce profil de navigateur.';
    } catch (e) { status.textContent = String(e); } finally { listing = false; controls(); }
  }
  async function exportSession(id: string) {
    if (exporting || listing) return; exporting = true; controller = new AbortController(); controls(); status.textContent = 'Choisir le fichier d’export…';
    try {
      const signal = controller.signal; let warning = false;
      const lines = recoverSessionLines(id, signal, (phase, current, end) => {
        if (phase === 'warning') { warning = true; status.textContent = 'Avertissement de stockage : seule la portion disponible sera exportée.'; return; }
        status.textContent = `${phase === 'checking' ? 'Vérification' : 'Export'} : ${current}/${end} entrées.`;
      });
      await saveRecoveredFile(`uc5-2s-${id.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 128)}-recupere.odb-stream`, lines, signal);
      status.textContent = warning ? 'Export terminé avec avertissement : données partielles ou stockage à vérifier. Le fichier conserve ce signalement.' : 'Export terminé : portion effectivement conservée. Le fichier garde les avertissements de stockage.';
    } catch (e) { status.textContent = (e as any)?.name === 'AbortError' ? 'Export annulé. Historique stocké inchangé.' : String(e); }
    finally { exporting = false; controller = undefined; controls(); }
  }
  refresh.onclick = () => void show(); next.onclick = () => void show(after);
  cancel.onclick = () => { controller?.abort(); status.textContent = 'Annulation de l’export en cours…'; };
  window.addEventListener('beforeunload', () => controller?.abort()); controls();
}
