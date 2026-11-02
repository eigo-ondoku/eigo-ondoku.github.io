// 英文 → 単語ごとの正しい発音（CMU Pronouncing Dictionary を使用）
// 辞書は約13万語。初回に一度だけ読み込む（アプリに同梱、外部通信なし）。

import { arpaToRef, isVowel, type RefPhone } from './phonemes';

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
  notes?: (string | null)[]; // variants と同じ並び。自然な音の変化で作った読みには説明を付ける
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
  const words: RefWord[] = splitWords(text).map((w) => {
    const variants = lookup(w.norm);
    return { ...w, variants, notes: variants.map(() => null) };
  });
  addConnectedSpeech(words);
  return words;
}

const key = (v: RefPhone[]) => v.map((p) => p.p + (p.stress ?? '')).join(' ');
const MAX_VARIANTS = 24; // 組み合わせが増えすぎないように上限を設ける

const STOPS = new Set(['p', 't', 'k', 'b', 'd', 'g']);
const VOICELESS = new Set(['p', 't', 'k', 'f', 'θ', 's', 'ʃ', 'tʃ', 'h']);
const SIBILANT_TH = new Set(['s', 'z', 'θ', 'ð']);
const startsWithConsonant = (w?: RefWord) => Boolean(w?.variants.some((v) => v.length && !isVowel(v[0].p)));
const startsWith = (w: RefWord | undefined, set: Set<string>) => Boolean(w?.variants.some((v) => v.length && set.has(v[0].p)));

type Rule = (v: RefPhone[], w: RefWord, prev?: RefWord, next?: RefWord) => { v: RefPhone[]; note: string }[];

/**
 * 音読で自然に起こる音の変化（同じ文の中だけ）。どれも、アメリカ英語のネイティブの音読で普通に起こるもの。
 * 日本語話者に多い誤り（母音を足す、R→L、TH→S、語末の母音の後の子音を落とす 等）は対象にしない。
 */
const RULES: Rule[] = [
  // 語末の破裂音を破裂させずに止める／落とす（next day, Bright copper, up with）
  (v, w, _p, next) => {
    const last = v[v.length - 1];
    if (!next || v.length < 2 || !STOPS.has(last.p) || !startsWithConsonant(next)) return [];
    const afterConsonant = !isVowel(v[v.length - 2].p);
    return [{ v: v.slice(0, -1), note: afterConsonant ? `${w.raw} の語末の ${last.p} が次の語の前で落ちる（音の脱落）` : `${w.raw} の語末の ${last.p} を破裂させずに止める` }];
  },
  // t/d ＋ you の y がつながる（did you, don't you）— 前の語の側
  (v, w, _p, next) => {
    const last = v[v.length - 1];
    if (!next || !(last?.p === 't' || last?.p === 'd') || !next.variants.some((nv) => nv[0]?.p === 'j')) return [];
    return [{ v: [...v.slice(0, -1), { p: last.p === 't' ? 'tʃ' : 'dʒ', stress: null }], note: `${w.raw} ${next.raw} の t/d と y がつながる（チュ・ジュの音）` }];
  },
  // 同じく後ろの語の側（you の y が前の語に吸収される）
  (v, w, prev) => {
    if (!prev || v[0]?.p !== 'j' || v.length < 2 || !prev.variants.some((pv) => ['t', 'd'].includes(pv[pv.length - 1]?.p))) return [];
    return [{ v: v.slice(1), note: `${prev.raw} ${w.raw} の t/d と y がつながる（チュ・ジュの音）` }];
  },
  // t＋弱い母音＋n で t が喉で止まる（button, certain, mittens）
  (v, w) => {
    const out: { v: RefPhone[]; note: string }[] = [];
    for (let k = 1; k + 2 < v.length + 1; k++) {
      const [a, b, c] = [v[k], v[k + 1], v[k + 2]];
      if (a?.p === 't' && b && (b.p === 'ʌ' || b.p === 'ɪ') && b.stress === 0 && c?.p === 'n' && (k + 3 === v.length || !isVowel(v[k + 3].p)))
        out.push({ v: [...v.slice(0, k), ...v.slice(k + 2)], note: `${w.raw} の t が喉で止まる（声門閉鎖）` });
    }
    return out;
  },
  // 弱い母音＋l/n/m で母音が消え、l/n/m だけで音節になる（woolen, kettles）。語末側の L は「オ」のように響くことがある（暗い L）
  (v, w) => {
    const out: { v: RefPhone[]; note: string }[] = [];
    for (let k = 1; k + 1 < v.length; k++) {
      const [b, c] = [v[k], v[k + 1]];
      if (!(b.stress === 0 && (b.p === 'ʌ' || b.p === 'ɪ') && ['l', 'n', 'm'].includes(c.p))) continue;
      if (!(k + 2 === v.length || !isVowel(v[k + 2].p))) continue;
      if (isVowel(v[k - 1].p)) continue;
      out.push({ v: [...v.slice(0, k), ...v.slice(k + 1)], note: `${w.raw} の弱い母音が消え、${c.p} だけで発音される` });
      if (c.p === 'l')
        for (const dark of ['oʊ', 'ʊ'])
          out.push({ v: [...v.slice(0, k), { p: dark, stress: 0 }, ...v.slice(k + 2)], note: `${w.raw} の語末の L が「オ」のように響く（暗い L）` });
    }
    return out;
  },
  // 語末の th が次の語の影響を受ける（with strings）：無声音の前で声が抜ける／s・z・th の前で弱まって消える
  (v, w, _p, next) => {
    const last = v[v.length - 1];
    if (!next || !(last?.p === 'ð' || last?.p === 'θ')) return [];
    const out: { v: RefPhone[]; note: string }[] = [];
    if (last.p === 'ð' && startsWith(next, VOICELESS)) out.push({ v: [...v.slice(0, -1), { p: 'θ', stress: null }], note: `${w.raw} の th が次の無声音の影響で息だけになる` });
    if (startsWith(next, SIBILANT_TH)) out.push({ v: v.slice(0, -1), note: `${w.raw} の th が次の ${next.raw} の音に吸収される` });
    return out;
  },
  // ng の前の i が「イー」「エイ」寄りになる（strings, things）
  (v, w) => {
    const out: { v: RefPhone[]; note: string }[] = [];
    for (let k = 0; k + 1 < v.length; k++)
      if (v[k].p === 'ɪ' && v[k + 1].p === 'ŋ')
        for (const raised of ['i', 'eɪ']) out.push({ v: [...v.slice(0, k), { ...v[k], p: raised }, ...v.slice(k + 1)], note: `${w.raw} の ng の前の i が「イー」「エイ」寄りになる` });
    return out;
  },
];

export function addConnectedSpeech(words: RefWord[]) {
  // 前後の語の判断は、変化を加える前の読みで行う
  const original = words.map((w) => ({ ...w, variants: [...w.variants] }));
  words.forEach((w, i) => {
    if (!w.variants.length) return;
    const prev = original[i - 1],
      next = original[i + 1];
    const notes = (w.notes ??= w.variants.map(() => null));
    // ルールを順に当て、前のルールで作った読みにも重ねて当てる（複数の変化が同時に起こる場合）
    for (const rule of RULES) {
      const current = w.variants.map((v, j) => ({ v, note: notes[j] }));
      for (const { v, note } of current)
        for (const r of rule(v, w, prev, next)) {
          if (w.variants.length >= MAX_VARIANTS) return;
          if (!r.v.length || w.variants.some((x) => key(x) === key(r.v))) continue;
          w.variants.push(r.v);
          notes.push(note ? `${note}／${r.note}` : r.note);
        }
    }
  });
}
