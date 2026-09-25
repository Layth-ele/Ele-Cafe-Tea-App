/**
 * themeStore.ts — Zustand store replaces ThemeContext
 *
 * Before (Context): 40 lines, Provider wrapper needed in App.tsx
 * After (Zustand):  25 lines, no Provider, import anywhere directly
 *
 * Usage: const { theme, toggleTheme } = useThemeStore();
 */
import { create } from 'zustand';
import { persist  } from 'zustand/middleware';
import { getTheme, setTheme as applyTheme, initTheme, type Theme } from '@/lib/theme';

interface ThemeState {
  theme:       Theme;
  setTheme:    (t: Theme)  => void;
  toggleTheme: ()          => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: getTheme(),

      setTheme: (t) => {
        applyTheme(t);
        set({ theme: t });
      },

      toggleTheme: () => {
        const next: Theme = get().theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        set({ theme: next });
      },
    }),
    {
      name:    'ele-cafe-theme',
      onRehydrateStorage: () => () => { initTheme(); },
    },
  ),
);
