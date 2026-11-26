/**
 * Data store: seed JSON → React state → localStorage.
 *
 * - On first load the seed files in ./seed are used.
 * - Every change is saved to localStorage (key below), so edits survive reloads.
 * - Settings → Import backup replaces everything with a JSON file in the `Database` shape;
 *   Settings → Export backup downloads the current data in the same shape.
 * - Settings → Reset restores the seed data.
 *
 * To connect a real backend later, replace `loadDatabase` / `saveDatabase` with API calls;
 * the pages only use the hooks exported here.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CollectionKey, Database, Settings } from "./types";
import settings from "./seed/settings.json";
import products from "./seed/products.json";
import stockMovements from "./seed/stockMovements.json";
import shipments from "./seed/shipments.json";
import orders from "./seed/orders.json";
import expenses from "./seed/expenses.json";
import partners from "./seed/partners.json";
import quotes from "./seed/quotes.json";
import campaigns from "./seed/campaigns.json";
import content from "./seed/content.json";
import tasks from "./seed/tasks.json";
import skroutzStats from "./seed/skroutzStats.json";

const STORAGE_KEY = "innometrics.control-center.db.v1";

export const seedDatabase = (): Database =>
  structuredClone({
    version: 1,
    settings,
    products,
    stockMovements,
    shipments,
    orders,
    expenses,
    partners,
    quotes,
    campaigns,
    content,
    tasks,
    skroutzStats,
  } as Database);

/** Validates an imported object enough to be safe to render. */
export function normalizeDatabase(input: unknown): Database {
  if (!input || typeof input !== "object") throw new Error("The file is not a JSON object.");
  const obj = input as Record<string, unknown>;
  const base = seedDatabase();
  const out = { ...base } as Database;
  const keys: CollectionKey[] = ["products", "stockMovements", "shipments", "orders", "expenses", "partners", "quotes", "campaigns", "content", "tasks", "skroutzStats"];
  let found = 0;
  for (const k of keys) {
    if (k in obj) {
      if (!Array.isArray(obj[k])) throw new Error(`"${k}" must be a list.`);
      (out as unknown as Record<string, unknown>)[k] = obj[k];
      found++;
    }
  }
  if (obj.settings && typeof obj.settings === "object") out.settings = { ...base.settings, ...(obj.settings as Partial<Settings>) };
  if (!found) throw new Error("No Innometrics data found in this file.");
  return out;
}

function loadDatabase(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeDatabase(JSON.parse(raw));
  } catch {
    /* corrupted or blocked storage → fall back to seed */
  }
  return seedDatabase();
}

function saveDatabase(db: Database) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

type WithId = { id: string };
type Item<K extends CollectionKey> = Database[K][number];

interface StoreValue {
  db: Database;
  ready: boolean;
  saveError: boolean;
  upsert: <K extends CollectionKey>(key: K, item: Item<K>) => void;
  remove: <K extends CollectionKey>(key: K, id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  replaceAll: (db: Database) => void;
  resetToSeed: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(() => loadDatabase());
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const first = useRef(true);

  // Short, deliberate loading phase so skeletons render smoothly on first paint.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 450);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setSaveError(!saveDatabase(db)), 250);
    return () => clearTimeout(t);
  }, [db]);

  const upsert = useCallback(<K extends CollectionKey>(key: K, item: Item<K>) => {
    setDb((prev) => {
      const list = prev[key] as unknown as WithId[];
      const it = item as unknown as WithId;
      const idx = list.findIndex((x) => x.id === it.id);
      const next = idx >= 0 ? list.map((x, i) => (i === idx ? it : x)) : [...list, it];
      return { ...prev, [key]: next };
    });
  }, []);

  const remove = useCallback(<K extends CollectionKey>(key: K, id: string) => {
    setDb((prev) => ({ ...prev, [key]: (prev[key] as unknown as WithId[]).filter((x) => x.id !== id) }));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => setDb((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } })), []);
  const replaceAll = useCallback((next: Database) => setDb(next), []);
  const resetToSeed = useCallback(() => setDb(seedDatabase()), []);

  const value = useMemo(() => ({ db, ready, saveError, upsert, remove, updateSettings, replaceAll, resetToSeed }), [db, ready, saveError, upsert, remove, updateSettings, replaceAll, resetToSeed]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
