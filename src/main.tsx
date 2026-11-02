import { createRoot } from 'react-dom/client';
import App from './App';
import { waitVoices } from './lib/tts';
import '@fontsource/biz-udpgothic/400.css';
import '@fontsource/biz-udpgothic/700.css';
import './styles.css';

waitVoices(); // お手本の音声一覧を先に読み込んでおく
createRoot(document.getElementById('root')!).render(<App />);
