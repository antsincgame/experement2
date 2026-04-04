// Guards the shared persistence adapter so web fallback and native AsyncStorage delegation stay stable.
import { afterEach, describe, expect, it, vi } from "vitest";

interface PersistedValue {
  state: {
    value: string;
  };
  version: number;
}

const importPersistStorage = async (
  platform: "web" | "android",
  asyncStorageOverrides?: {
    getItem?: ReturnType<typeof vi.fn>;
    setItem?: ReturnType<typeof vi.fn>;
    removeItem?: ReturnType<typeof vi.fn>;
  }
) => {
  vi.resetModules();

  vi.doMock("react-native", () => ({
    Platform: { OS: platform },
  }));

  const asyncStorage = {
    getItem: asyncStorageOverrides?.getItem ?? vi.fn(),
    setItem: asyncStorageOverrides?.setItem ?? vi.fn(),
    removeItem: asyncStorageOverrides?.removeItem ?? vi.fn(),
  };

  vi.doMock("@react-native-async-storage/async-storage", () => ({
    default: asyncStorage,
  }));

  const mod = await import("../../../src/shared/lib/storage/persist-storage.ts");
  return { asyncStorage, createPersistStorage: mod.createPersistStorage };
};

afterEach(() => {
  vi.resetModules();
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe("createPersistStorage", () => {
  it("falls back to in-memory storage on web when localStorage is unavailable", async () => {
    const { createPersistStorage } = await importPersistStorage("web");
    const storage = createPersistStorage<PersistedValue["state"]>();
    const payload: PersistedValue = {
      state: { value: "web" },
      version: 0,
    };

    await storage.setItem("demo", payload);

    expect(storage.getItem("demo")).toEqual(payload);
  });

  it("delegates to AsyncStorage on native platforms", async () => {
    const getItem = vi.fn().mockResolvedValue(
      JSON.stringify({ state: { value: "native" }, version: 0 })
    );
    const setItem = vi.fn().mockResolvedValue(undefined);
    const { asyncStorage, createPersistStorage } = await importPersistStorage(
      "android",
      { getItem, setItem }
    );
    const storage = createPersistStorage<PersistedValue["state"]>();
    const payload: PersistedValue = {
      state: { value: "native" },
      version: 0,
    };

    await storage.setItem("demo", payload);
    await storage.getItem("demo");

    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      "demo",
      JSON.stringify(payload)
    );
    expect(asyncStorage.getItem).toHaveBeenCalledWith("demo");
  });
});
