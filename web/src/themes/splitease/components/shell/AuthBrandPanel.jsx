// SplitEase-only: green brand panel beside the auth card (design D37). Feature bullets describe
// shipped features only (no stats / user counts).
import { useT } from '../../../../prefs.jsx';
import { BrandMark } from '../../../../components/Shell.jsx';
import { ThemedIcon } from '../../../../components/ThemedIcon.jsx';

const FEATURES = [
  { key: 'scan', ms: 'document_scanner' },
  { key: 'split', ms: 'call_split' },
  { key: 'settle', ms: 'hub' },
  { key: 'currency', ms: 'currency_exchange' },
];

export function AuthBrandPanel() {
  const t = useT();
  return (
    <aside className="se-auth-panel">
      <div className="se-auth-panel-brand" aria-hidden>
        <BrandMark size={44} />
        <span className="se-auth-panel-word">{t('shell.brand')}</span>
      </div>
      <span className="se-auth-panel-kicker">
        <ThemedIcon ms="verified" size={16} />
        {t('se.auth.kicker')}
      </span>
      <h2 className="se-auth-panel-headline">{t('se.auth.headline')}</h2>
      <p className="se-auth-panel-body">{t('se.auth.body')}</p>
      <ul className="se-auth-panel-features">
        {FEATURES.map((f) => (
          <li key={f.key}>
            <ThemedIcon ms={f.ms} size={18} />
            {t(`se.auth.feature.${f.key}`)}
          </li>
        ))}
      </ul>
    </aside>
  );
}
