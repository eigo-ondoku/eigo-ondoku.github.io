// 単語の意味（英和辞書）と文の自動翻訳
// 辞書：EJDict-hand（パブリックドメイン CC0, kujirahand）。初めて意味を調べたときだけ読み込む（約4.5MB、圧縮転送で約1.8MB）
// 翻訳：ブラウザ内蔵の Translator API（PCの Chrome 138+／Edge 148+）。端末の中で翻訳し、外部へ送らない

let dict: Map<string, string[]> | null = null;
let loading: Promise<Map<string, string[]>> | null = null;

export function loadEJ(): Promise<Map<string, string[]>> {
  if (dict) return Promise.resolve(dict);
  if (!loading) {
    loading = fetch('./ejdict.tsv')
      .then((r) => {
        if (!r.ok) throw new Error('辞書を読み込めませんでした（' + r.status + '）');
        return r.text();
      })
      .then((t) => {
        const m = new Map<string, string[]>();
        for (const line of t.split('\n')) {
          const i = line.indexOf('\t');
          if (i < 0) continue;
          const k = line.slice(0, i);
          const v = line.slice(i + 1);
          const a = m.get(k);
          if (a) a.push(v);
          else m.set(k, [v]);
        }
        dict = m;
        return m;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

/** 活用形・複数形などから、辞書の見出し語の候補を作る */
export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
  const out: string[] = [w];
  const add = (x: string) => x.length > 1 && !out.includes(x) && out.push(x);
  const base = w.replace(/'s$|s'$/, (m) => (m === "s'" ? 's' : ''));
  add(base);
  const dbl = (x: string) => (/([bdfgklmnprtvz])\1$/.test(x) ? x.slice(0, -1) : null);
  for (const x of [base]) {
    if (/ies$/.test(x)) add(x.slice(0, -3) + 'y');
    if (/(s|x|z|ch|sh|o)es$/.test(x)) add(x.slice(0, -2));
    if (/s$/.test(x) && !/ss$/.test(x)) add(x.slice(0, -1));
    if (/ied$/.test(x)) add(x.slice(0, -3) + 'y');
    if (/ed$/.test(x)) {
      const s = x.slice(0, -2);
      const d = dbl(s);
      if (d) add(d);
      add(s);
      add(x.slice(0, -1));
    }
    if (/ing$/.test(x)) {
      const s = x.slice(0, -3);
      const d = dbl(s);
      if (d) add(d);
      add(s);
      add(s + 'e');
      if (/y$/.test(s)) add(s.slice(0, -1) + 'ie');
    }
    if (/ier$|iest$/.test(x)) add(x.replace(/ier$|iest$/, 'y'));
    if (/er$|est$/.test(x)) {
      const s = x.replace(/er$|est$/, '');
      const d = dbl(s);
      if (d) add(d);
      add(s);
      add(s + 'e');
    }
    if (/ly$/.test(x)) add(x.slice(0, -2));
    const m = x.match(/^(.+)'(ll|re|ve|d|m)$/);
    if (m) add(m[1]);
  }
  return out;
}

export interface WordMeaning {
  head: string;
  senses: string[];
}

/** 単語の意味。見つかった見出し語（最大2つ：そのままの形＋元の形）を返す */
export async function lookupMeaning(word: string): Promise<WordMeaning[]> {
  const d = await loadEJ();
  const res: WordMeaning[] = [];
  for (const c of lemmaCandidates(word)) {
    const e = d.get(c);
    if (!e) continue;
    res.push({ head: c, senses: e.flatMap((x) => x.split(' / ')).map((x) => x.trim()).filter(Boolean) });
    if (res.length >= 2) break;
  }
  return res;
}

// ---------- 文の自動翻訳（ブラウザ内蔵） ----------
declare const Translator: any;
const opts = { sourceLanguage: 'en', targetLanguage: 'ja' };
let translator: any = null;

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' */
export async function translatorStatus(): Promise<string> {
  try {
    if (typeof Translator === 'undefined') return 'unsupported';
    // 環境によっては応答が返らないことがあるため、3秒で打ち切る
    return await Promise.race([Translator.availability(opts), new Promise<string>((r) => setTimeout(() => r('unavailable'), 3000))]);
  } catch {
    return 'unsupported';
  }
}

/** ボタン操作の中で呼ぶこと（初回は翻訳データのダウンロードにユーザー操作が必要） */
export async function translateToJa(text: string, onProgress?: (f: number) => void): Promise<string> {
  if (typeof Translator === 'undefined') throw new Error('この端末のブラウザには翻訳機能がありません');
  if (!translator) {
    translator = await Translator.create({
      ...opts,
      monitor(m: any) {
        m.addEventListener('downloadprogress', (e: any) => onProgress?.(e.loaded));
      },
    });
  }
  return await translator.translate(text);
}
