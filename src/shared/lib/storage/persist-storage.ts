// Unifies persisted app storage across web and native so Zustand hydration works on every Expo target.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { createJSONStorage, type StateStorage } from "zustand/middleware";

const memoryStore = new Map<string, string>();

const memoryStorage: StateStorage = {
  getItem: (name) => memoryStore.get(name) ?? null,
  setItem: (name, value) => {
    memoryStore.set(name, value);
  },
  removeItem: (name) => {
    memoryStore.delete(name);
  },
};

const webStorage: StateStorage = {
  getItem: (name) => {
    try {
      if (typeof globalThis.localStorage === "undefined") {
        return memoryStorage.getItem(name);
      }

      return globalThis.localStorage.getItem(name);
    } catch {
      return memoryStorage.getItem(name);
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof globalThis.localStorage === "undefined") {
        memoryStorage.setItem(name, value);
        return;
      }

      globalThis.localStorage.setItem(name, value);
    } catch {
      memoryStorage.setItem(name, value);
    }
  },
  removeItem: (name) => {
    try {
      if (typeof globalThis.localStorage === "undefined") {
        memoryStorage.removeItem(name);
        return;
      }

      globalThis.localStorage.removeItem(name);
    } catch {
      memoryStorage.removeItem(name);
    }
  },
};

const resolveStateStorage = (): StateStorage =>
  Platform.OS === "web" ? webStorage : AsyncStorage;

export const createPersistStorage = <T>() =>
  createJSONStorage<T>(() => resolveStateStorage());
