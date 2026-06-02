// Source for the blessed local-first data layer scaffolded into every generated
// project (src/services/db.ts). Generated apps import persistence from a single
// stable surface ("@/services/db") instead of hand-writing SQL or platform code,
// removing whole classes of persistence bugs. The layer is backed by AsyncStorage
// so data survives reloads identically on web (preview), iOS, and Android — keeping
// the instant web preview working while still giving real local-first persistence.

/** Content for src/services/db.ts. Inner key strings use concatenation (not
 *  template literals) so the outer template stays escape-free. */
const DB_TS = `// Local-first data layer for this app. Persists JSON to AsyncStorage, which works
// identically on web, iOS, and Android — data survives reloads with zero backend.
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Identifiable {
  id: string;
}

export interface Collection<T extends Identifiable> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  save(item: T): Promise<void>;
  saveAll(items: T[]): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const collectionKey = (name: string): string => "collection:" + name;

async function readCollection<T>(name: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(collectionKey(name));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeCollection<T>(name: string, items: T[]): Promise<void> {
  await AsyncStorage.setItem(collectionKey(name), JSON.stringify(items));
}

/**
 * Create a typed, persistent collection of records. Every item needs a string id.
 * All methods are async — await them inside handlers/useEffect, then mirror the
 * result into Zustand/useState for rendering.
 */
export function createCollection<T extends Identifiable>(name: string): Collection<T> {
  return {
    async getAll() {
      return readCollection<T>(name);
    },
    async getById(id) {
      const items = await readCollection<T>(name);
      return items.find((item) => item.id === id);
    },
    async save(item) {
      const items = await readCollection<T>(name);
      const index = items.findIndex((existing) => existing.id === item.id);
      if (index >= 0) {
        items[index] = item;
      } else {
        items.push(item);
      }
      await writeCollection(name, items);
    },
    async saveAll(items) {
      await writeCollection(name, items);
    },
    async remove(id) {
      const items = await readCollection<T>(name);
      await writeCollection(name, items.filter((item) => item.id !== id));
    },
    async clear() {
      await AsyncStorage.removeItem(collectionKey(name));
    },
  };
}

const kvKey = (key: string): string => "kv:" + key;

/** Typed key-value store for single objects (settings, profile, preferences). */
export const kv = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await AsyncStorage.getItem(kvKey(key));
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(kvKey(key), JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(kvKey(key));
  },
};
`;

/** Blessed data-layer files scaffolded into every project (parallel to the UI kit). */
export const SCAFFOLD_DB_FILES: Record<string, string> = {
  "src/services/db.ts": DB_TS,
};
