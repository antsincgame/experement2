import { create } from 'zustand';
import type { SettingsState } from '@/types/index';

interface SettingsStore extends SettingsState {
  setTheme: (theme: 'light' | 'dark') => void;
  setIsMetric: (isMetric: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  theme: 'light',
  isMetric: true,
  setTheme: (theme) => set({ theme }),
  setIsMetric: (isMetric) => set({ isMetric }),
}));

// EOF