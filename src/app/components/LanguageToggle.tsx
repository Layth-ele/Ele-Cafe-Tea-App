import { useLanguageStore } from '@/store/languageStore';

import { useT } from '@/i18n/useT';
function CanadaFlag({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.6);
  return (
    <svg width={size} height={h} viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" className="lang-flag-svg">
      <rect x="0"  y="0" width="7.5" height="20" fill="#D52B1E"/>
      <rect x="7.5" y="0" width="15"  height="20" fill="#FFFFFF"/>
      <rect x="22.5" y="0" width="7.5" height="20" fill="#D52B1E"/>
      {/* Maple leaf */}
      <path
        d="M15 2.5 l1.0 3.0h3.0l-2.4 1.8 0.9 2.8L15 8.8l-2.5 1.3 0.9-2.8-2.4-1.8h3.0z
           M13.8 10.5l1.2 4.5h-1.5z M16.2 10.5l-1.2 4.5h1.5z"
        fill="#D52B1E"
        fillRule="evenodd"
      />
    </svg>
  );
}

export function LanguageToggle() {
  const t = useT();
  const { language, toggleLanguage } = useLanguageStore();
  const isFR = language === 'fr';

  return (
    <button
      onClick={toggleLanguage}
      className="nav-icon lang-toggle"
      aria-label={isFR ? t('Switch to English') : t('Passer au français')}
      title={isFR ? t('Switch to English') : t('Passer au français')}
    >
      <CanadaFlag size={22} />
      <span className="lang-toggle-label">
        {language.toUpperCase()}
      </span>
    </button>
  );
}
