import { useState } from 'react';
import { AppProvider, useApp } from './ctx';
import { TextsView } from './views/Texts';
import { PracticeView } from './views/Practice';
import { ReviewView } from './views/Review';
import { RecordsView } from './views/Records';
import { SettingsView } from './views/Settings';

const TABS = [
  ['texts', '教材', '📖'],
  ['practice', '音読', '🎯'],
  ['review', '通し読み', '🔁'],
  ['records', '記録', '📊'],
  ['settings', '設定', '⚙️'],
] as const;
type Tab = (typeof TABS)[number][0];

function Shell() {
  const { data } = useApp();
  const [tab, setTab] = useState<Tab>(data.texts.length ? 'practice' : 'texts');
  return (
    <div className="app">
      <header>
        <h1>英語音読コーチ</h1>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => (setTab(id), window.scrollTo(0, 0))}>
            <span aria-hidden>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'texts' && <TextsView goPractice={() => setTab('practice')} />}
        {tab === 'practice' && <PracticeView goTexts={() => setTab('texts')} />}
        {tab === 'review' && <ReviewView goTexts={() => setTab('texts')} />}
        {tab === 'records' && <RecordsView />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <footer className="small muted">
        英文・録音・記録はこの端末内だけで扱います ｜ 発音判定：wav2vec2-xls-r-300m-timit-phoneme（Apache-2.0） ｜ 辞書：CMU Pronouncing Dictionary
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
