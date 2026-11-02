// 英文 → 単語ごとの正しい発音（CMU Pronouncing Dictionary を使用）
// 辞書は約13万語。初回に一度だけ読み込む（アプリに同梱、外部通信なし）。

import { arpaToRef, type RefPhone } from './phonemes';

let dict: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;

export function loadDictionary(): Promise<Record<string, string>> {
  if (dict) return Promise.resolve(dict);
  return (loading ??= import('cmu-pronouncing-dictionary').then((m) => (dict = m.dictionary)));
}

// 辞書には1つの読みしか入っていないため、よく使う語の別の読み（弱形・強形・同綴異音語）を補う
const EXTRA: Record<string, string[]> = {
  a: ['EY1'], the: ['DH IY0', 'DH IY1'], to: ['T UW1', 'T AH0'], of: ['AH1 V'], and: ['AE1 N D', 'AH0 N', 'N'],
  for: ['F ER0'], you: ['Y AH0'], your: ['Y ER0'], can: ['K AE1 N'], was: ['W AA1 Z'], are: ['ER0'], at: ['AH0 T'],
  from: ['F ER0 M'], that: ['DH AH0 T'], them: ['DH AH0 M'], have: ['HH AH0 V'], has: ['HH AH0 Z'], or: ['ER0'],
  read: ['R IY1 D'], live: ['L AY1 V'], lead: ['L EH1 D'], wind: ['W AY1 N D'], tear: ['T EH1 R'], close: ['K L OW1 Z'],
  use: ['Y UW1 S'], record: ['R IH0 K AO1 R D'], present: ['P R IY0 Z EH1 N T'], object: ['AH0 B JH EH1 K T'],
  wound: ['W AW1 N D'], minute: ['M AY0 N UW1 T'], content: ['K AH0 N T EH1 N T'], desert: ['D IH0 Z ER1 T'],
  either: ['AY1 DH ER0'], neither: ['N AY1 DH ER0'], often: ['AO1 F T AH0 N'], been: ['B IH1 N'], just: ['JH AH0 S T'],
};

export interface RefWord {
  raw: string; // 表示用（句読点を除いた形）
  norm: string;
  variants: RefPhone[][]; // 正しい読み（複数可）。空なら辞書にない語
}

export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\-]/g, '')
    .replace(/^'+|'+$/g, '');
}

export function splitWords(text: string): { raw: string; norm: string }[] {
  return text
    .replace(/[—–]/g, ' ')
    .split(/\s+/)
    .flatMap((t) => {
      const raw = t.replace(/^[^\w'’]+|[^\w'’]+$/g, '');
      const norm = normalizeWord(raw);
      if (!norm) return [];
      // ハイフンでつながった語は辞書にあればそのまま、なければ分割
      if (norm.includes('-') && dict && !dict[norm]) return norm.split('-').filter(Boolean).map((p) => ({ raw: p, norm: p }));
      return [{ raw, norm: norm.replace(/-/g, '') }];
    });
}

export function lookup(norm: string): RefPhone[][] {
  if (!dict) throw new Error('辞書が読み込まれていません');
  const out: string[] = [];
  if (dict[norm]) out.push(dict[norm]);
  for (const e of EXTRA[norm] ?? []) if (!out.includes(e)) out.push(e);
  // 所有格・複数の 's で辞書にない場合は語幹＋s/z
  if (!out.length && norm.endsWith("'s") && dict[norm.slice(0, -2)]) {
    const base = dict[norm.slice(0, -2)];
    out.push(base + ' Z', base + ' S', base + ' IH0 Z');
  }
  return out.map(arpaToRef).filter((v) => v.length > 0);
}

export function textToRef(text: string): RefWord[] {
  return splitWords(text).map((w) => ({ ...w, variants: lookup(w.norm) }));
}
