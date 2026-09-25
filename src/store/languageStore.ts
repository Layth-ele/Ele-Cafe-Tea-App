/**
 * languageStore.ts — EN/FR language state
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { translateStatic } from '@/i18n/useT';

export type Language = 'en' | 'fr';

interface LanguageState {
  language:       Language;
  setLanguage:    (lang: Language) => void;
  toggleLanguage: () => void;
  /** Quick synchronous translate — use useT() hook in components */
  t:              (key: string) => string;
}

const applyLang = (lang: Language) => {
  document.documentElement.lang = lang;
  document.documentElement.dir  = 'ltr'; // both EN and FR are LTR
};

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'en' as Language,

      setLanguage: (lang) => {
        applyLang(lang);
        set({ language: lang });
      },

      toggleLanguage: () => {
        const next: Language = get().language === 'en' ? 'fr' : 'en';
        applyLang(next);
        set({ language: next });
      },

      t: (key) => translateStatic(key, get().language),
    }),
    {
      name: 'ele-cafe-language',
      onRehydrateStorage: () => (state) => {
        if (state) applyLang(state.language);
      },
    }
  )
);
