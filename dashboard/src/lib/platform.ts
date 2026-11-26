/**
 * Platform adapter.
 *
 * Locally (npm run dev / any static host) the app uses localStorage and normal browser downloads.
 * When it is published as a private claude.ai Artifact, `window.claude` exists and the app uses
 * the Artifact's own database (data follows you across devices) and its download API.
 */
interface ClaudeRuntime { use: (name: string) => Promise<unknown> }
interface DocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
interface ArtifactDb {
  collection(path: string): { get(): Promise<{ docs: DocSnap[] }>; doc(id: string): { set(data: Record<string, unknown>): Promise<void> } };
}
interface Downloads { save(r: { filename: string; data: string | Blob }): Promise<unknown> }

const runtime = (): ClaudeRuntime | undefined => (window as unknown as { claude?: ClaudeRuntime }).claude;
export const isArtifact = () => typeof runtime()?.use === "function";

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

let dbPromise: Promise<ArtifactDb | null> | null = null;
export function artifactDb(): Promise<ArtifactDb | null> {
  if (!isArtifact()) return Promise.resolve(null);
  return (dbPromise ||= withTimeout(runtime()!.use("db") as Promise<ArtifactDb | null>, 10_000).catch(() => null));
}

let dlPromise: Promise<Downloads | null> | null = null;
const downloads = () => (dlPromise ||= withTimeout(runtime()!.use("downloads") as Promise<Downloads | null>, 10_000).catch(() => null));

/** Saves a file for the user. Returns false when the platform refused or the user declined. */
export async function saveFile(filename: string, content: string, type = "text/csv;charset=utf-8"): Promise<boolean> {
  if (isArtifact()) {
    const dl = await downloads();
    if (!dl) return false;
    try { await dl.save({ filename, data: new Blob([content], { type }) }); return true; } catch { return false; }
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Collections are stored one document each, in the "state" collection of the Artifact database. */
export async function loadFromArtifact(): Promise<Record<string, unknown> | null> {
  const db = await artifactDb();
  if (!db) return null;
  const snap = await withTimeout(db.collection("state").get(), 10_000);
  if (!snap || !snap.docs.length) return null;
  const out: Record<string, unknown> = {};
  snap.docs.forEach((d) => { const v = d.data(); if (v && "value" in v) out[d.id] = v.value; });
  return Object.keys(out).length ? out : null;
}

export async function saveToArtifact(key: string, value: unknown): Promise<boolean> {
  const db = await artifactDb();
  if (!db) return false;
  try { await db.collection("state").doc(key).set({ value }); return true; } catch { return false; }
}
