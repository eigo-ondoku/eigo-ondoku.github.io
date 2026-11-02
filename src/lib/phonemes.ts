// 音素の表記をそろえるための定義。
// 判定用AIモデル（TIMIT準拠の39音素・IPA表記）と、発音辞書 CMUdict（ARPAbet表記）を
// 同じ「基準音素」に変換して比較する。TIMIT の 39 音素への統合規則（ao→aa, zh→sh, ax→ah など）に従う。

export const VOWELS = new Set(['i', 'ɪ', 'ɛ', 'æ', 'ɑ', 'ʌ', 'ʊ', 'u', 'ɝ', 'eɪ', 'aɪ', 'ɔɪ', 'aʊ', 'oʊ']);
export const isVowel = (p: string) => VOWELS.has(p);

/** CMUdict(ARPAbet) → 基準音素 */
const ARPA: Record<string, string> = {
  AA: 'ɑ', AO: 'ɑ', AE: 'æ', AH: 'ʌ', EH: 'ɛ', ER: 'ɝ', IH: 'ɪ', IY: 'i', UH: 'ʊ', UW: 'u',
  EY: 'eɪ', AY: 'aɪ', OY: 'ɔɪ', AW: 'aʊ', OW: 'oʊ',
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'g', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ',
  P: 'p', R: 'ɹ', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʃ',
};

export interface RefPhone {
  p: string; // 基準音素
  stress: number | null; // 母音の強勢 0/1/2（子音は null）
}

export function arpaToRef(arpa: string): RefPhone[] {
  return arpa
    .trim()
    .split(/\s+/)
    .map((t) => {
      const m = /^([A-Z]+)([012])?$/.exec(t);
      if (!m || !ARPA[m[1]]) return null;
      return { p: ARPA[m[1]], stress: m[2] != null ? Number(m[2]) : null };
    })
    .filter((x): x is RefPhone => x != null);
}

/** モデルが出す記号 → 基準音素（特殊記号は 'BLANK' / 'WORD' / 'SKIP'） */
const TOKEN_MAP: Record<string, string> = {
  ə: 'ʌ', ɐ: 'ʌ', ɚ: 'ɝ', ɜ: 'ɝ', 'ɜː': 'ɝ', ɔ: 'ɑ', ɒ: 'ɑ', a: 'a', ɨ: 'ɪ', ʉ: 'u', 'iː': 'i', 'uː': 'u', 'ɑː': 'ɑ', 'ɔː': 'ɑ',
  e: 'e', o: 'o', ʒ: 'ʃ', r: 'ɹ', ɾ: 'ɾ', ɦ: 'h', ɡ: 'g', ʔ: 'SKIP', 'l̩': 'l', 'n̩': 'n', 'm̩': 'm', 'ŋ̍': 'ŋ',
  ʧ: 'tʃ', ʤ: 'dʒ', 't͡ʃ': 'tʃ', 'd͡ʒ': 'dʒ', y: 'j',
  ei: 'eɪ', ai: 'aɪ', au: 'aʊ', ou: 'oʊ', oi: 'ɔɪ', əʊ: 'oʊ', 'ɔi': 'ɔɪ',
  '|': 'WORD', ' ': 'WORD', '<pad>': 'BLANK', '[PAD]': 'BLANK', '<s>': 'SKIP', '</s>': 'SKIP', '<unk>': 'SKIP', '[UNK]': 'SKIP',
};

// 見た目が似ている別の文字（上付き文字・全角・巻き舌の r など）を、英語の基準音素にそろえる
const LOOKALIKE: Record<string, string> = {
  r: 'ɹ', ʳ: 'ɹ', ɼ: 'ɹ', ɽ: 'ɹ', ɻ: 'ɹ', ʀ: 'ɹ', ʁ: 'ɹ', ᵣ: 'ɹ', ɺ: 'l', ɫ: 'l', ʟ: 'l', ɡ: 'g', ɑ̃: 'ɑ', ɒ: 'ɑ', ɔ: 'ɑ',
  ʤ: 'dʒ', ʧ: 'tʃ', ʒ: 'ʃ', ə: 'ʌ', ɚ: 'ɝ', ɜ: 'ɝ', ɨ: 'ɪ', ʉ: 'u', ɦ: 'h', y: 'j',
};
export const CANON = new Set([...VOWELS, 'p', 'b', 't', 'd', 'k', 'g', 'tʃ', 'dʒ', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'h', 'm', 'n', 'ŋ', 'l', 'ɹ', 'w', 'j', 'ɾ']);

export function normalizeToken(tok: string): string {
  if (tok in TOKEN_MAP) return TOKEN_MAP[tok];
  const trimmed = tok.trim();
  if (!trimmed) return 'WORD';
  // 互換文字の統一（ʳ→r、全角→半角など）→ 補助記号（長音記号・音節主音記号など）を取り除く
  const t = trimmed
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯːˑˈˌ]/g, '')
    .normalize('NFC')
    .toLowerCase();
  if (t in TOKEN_MAP) return TOKEN_MAP[t];
  if (CANON.has(t)) return t;
  if (t in LOOKALIKE) return LOOKALIKE[t];
  if (t.length === 2 && MERGE[`${t[0]}+${t[1]}`]) return MERGE[`${t[0]}+${t[1]}`];
  return t;
}

/** 設定画面に出す、モデルの記号の解釈一覧 */
export function describeVocab(vocab: string[]): { tok: string; as: string; known: boolean }[] {
  return vocab
    .map((tok) => {
      const as = normalizeToken(tok ?? '');
      return { tok, as, known: as === 'BLANK' || as === 'WORD' || as === 'SKIP' || CANON.has(as) || CANON.has(LONE[as] ?? '') || ['a', 'e', 'o'].includes(as) };
    })
    .filter((x) => x.tok != null);
}

/** 二重母音・破擦音が2記号に分かれて出力された場合にまとめる */
const MERGE: Record<string, string> = {
  'a+ɪ': 'aɪ', 'a+i': 'aɪ', 'ɑ+ɪ': 'aɪ', 'a+ʊ': 'aʊ', 'ɑ+ʊ': 'aʊ', 'a+u': 'aʊ', 'e+ɪ': 'eɪ', 'ɛ+ɪ': 'eɪ', 'e+i': 'eɪ',
  'o+ʊ': 'oʊ', 'ʌ+ʊ': 'oʊ', 'o+u': 'oʊ', 'o+ɪ': 'ɔɪ', 't+ʃ': 'tʃ', 'd+ʒ': 'dʒ', 'd+ʃ': 'dʒ',
};
export function mergePair(a: string, b: string): string | null {
  return MERGE[`${a}+${b}`] ?? null;
}
/** 単独で残った a/e/o は最も近い基準音素へ */
export const LONE: Record<string, string> = { a: 'ɑ', e: 'ɛ', o: 'oʊ' };

// 同じ種類の音（母音どうし・子音どうし）は照合時の置換コストを少し下げ、対応付けを安定させる
export function subCost(a: string, b: string): number {
  if (a === b) return 0;
  return isVowel(a) === isVowel(b) ? 1 : 1.4;
}

/**
 * 「ネイティブでも普通に起こる発音のゆれ」を正解として扱う（厳しすぎる判定を防ぐ）。
 * - 弱く読む母音（強勢0）は ʌ(ə) / ɪ / i / ʊ / ɝ のあいだのゆれを許容
 * - t / d の弾き音（water の t など）
 * - 強勢0の ɪ と i（happy の y など）
 */
export function lenient(ref: RefPhone, heard: string): boolean {
  if (ref.p === heard) return true;
  if (ref.stress === 0 && isVowel(heard)) {
    const reduced = ['ʌ', 'ɪ', 'i', 'ʊ', 'ɝ', 'ɛ'];
    if (reduced.includes(ref.p) && reduced.includes(heard)) return true;
  }
  if ((ref.p === 't' || ref.p === 'd') && heard === 'ɾ') return true;
  if (ref.p === 'ɝ' && heard === 'ɹ') return true;
  // 母音の後の r は「アー」のような r の響きとして聞こえることがある（year, near, there）
  if (ref.p === 'ɹ' && heard === 'ɝ') return true;
  return false;
}
