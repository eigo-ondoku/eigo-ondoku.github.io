// 学習データはすべてブラウザ内（localStorage）に保存する。外部には送信しない。

export interface Sentence {
  id: string;
  en: string;
  ja: string;
  notes: string;
}

export interface TextDoc {
  id: string;
  title: string;
  sentences: Sentence[];
  current: number;
  createdAt: number;
  mastered: boolean;
  fullRuns: { at: number; score: number | null; passed: boolean }[];
}

export interface PhraseRecord {
  text: string; // 採点時の英文。英文を書き換えたら記録をリセットする
  best: number | null;
  last: number | null;
  attempts: number;
  passed: boolean;
  lastAt?: number;
}

export interface GroupRecord {
  best: number | null;
  last: number | null;
  attempts: number;
}

export interface WeakPhoneme {
  count: number;
  heardAs: Record<string, number>;
  examples: string[];
}

const HF = 'https://huggingface.co/robg/speako-phoneme-recognizer/resolve/main/';
export interface Settings {
  browserVoice: string;
  slowRate: number;
  modelUrl: string;
  vocabUrl: string;
  preprocUrl: string;
  font: 'ud-gothic' | 'ud-kyokasho' | 'system';
}
export const defaultSettings: Settings = {
  browserVoice: '',
  slowRate: 0.7,
  modelUrl: HF + 'onnx/model_quantized.onnx',
  vocabUrl: HF + 'vocab.json',
  preprocUrl: HF + 'preprocessor_config.json',
  font: 'ud-gothic',
};

export interface AppData {
  version: 2;
  texts: TextDoc[];
  currentText: string | null;
  records: Record<string, PhraseRecord>;
  groups: Record<string, GroupRecord>;
  weak: Record<string, WeakPhoneme>;
  settings: Settings;
}

const KEY = 'eigo-ondoku-v2';

export function emptyData(): AppData {
  return { version: 2, texts: [], currentText: null, records: {}, groups: {}, weak: {}, settings: { ...defaultSettings } };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const d = JSON.parse(raw) as AppData;
    return { ...emptyData(), ...d, settings: { ...defaultSettings, ...d.settings } };
  } catch {
    return emptyData();
  }
}

export function saveData(d: AppData): string | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return null;
  } catch {
    return 'ブラウザに学習記録を保存できませんでした（プライベートモードや容量不足の可能性があります）。';
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function recordFor(d: AppData, s: Sentence): PhraseRecord {
  const r = d.records[s.id];
  if (!r || r.text !== s.en) return { text: s.en, best: null, last: null, attempts: 0, passed: false };
  return r;
}

export function currentText(d: AppData): TextDoc | null {
  return d.texts.find((t) => t.id === d.currentText) ?? d.texts[0] ?? null;
}

/** 本文を文に分ける。mode=line：改行ごと / sentence：. ? ! で区切る */
export function splitSentences(body: string, mode: 'line' | 'sentence'): string[] {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (mode === 'line') return lines;
  const out: string[] = [];
  const abbr = /\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|e\.g|i\.e|U\.S)\.$/i;
  for (const l of lines) {
    let buf = '';
    for (const part of l.split(/(?<=[.!?]["”’)]?)\s+/)) {
      buf = buf ? buf + ' ' + part : part;
      if (!abbr.test(buf)) {
        out.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

export function exportJson(d: AppData): string {
  return JSON.stringify(d, null, 2);
}
export function importJson(s: string): AppData {
  const d = JSON.parse(s) as AppData;
  if (!d || !Array.isArray(d.texts)) throw new Error('形式が正しくありません');
  return { ...emptyData(), ...d, settings: { ...defaultSettings, ...d.settings } };
}
