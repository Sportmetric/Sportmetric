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

/** Shrinks a photo in the browser so uploads stay small and fast. */
async function resizeImage(file: File, maxSide: number, quality: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Could not read this image.")); i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // transparent PNGs get a clean white background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process this image."))), "image/jpeg", quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Assets { upload(blob: Blob, opts?: { type?: string }): Promise<{ url: string }> }
let assetsPromise: Promise<Assets | null> | null = null;

/**
 * Stores a product photo and returns a URL for <img src>.
 * claude.ai: uploaded to the Artifact's file store. Locally: kept as a small data URL in localStorage.
 */
export async function storeProductPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG, PNG, WebP or HEIC).");
  if (isArtifact()) {
    const assets = await (assetsPromise ||= withTimeout(runtime()!.use("assets") as Promise<Assets | null>, 10_000).catch(() => null));
    if (!assets) throw new Error("Photo uploads are not available here.");
    // Formats the browser cannot decode (e.g. some HEIC files) are uploaded as they are.
    const blob = await resizeImage(file, 1400, 0.86).catch(() => file);
    const res = await assets.upload(blob, { type: blob.type || file.type });
    return res.url;
  }
  const blob = await resizeImage(file, 800, 0.8);
  return await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Could not read the image.")); r.readAsDataURL(blob); });
}
