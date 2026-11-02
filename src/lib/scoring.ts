// 発音判定AIの出力（音素の確率）と、辞書による正しい発音を照合して採点する。
//
// ■ 点数にするのは「個々の音の正確さ」だけ（このAIで実際に測定できるのはこれだけのため）。
//   点数 = 正しく発音できた音の数 ÷（正しい発音の音の数 ＋ 余分に入った音の数）× 100
//   アクセント・強弱 / リズム / イントネーションは、このAIでは測定できないため点数を付けない。
// ■ 判定の一貫性：同じ音声には常に同じ計算をする。挑戦回数による補正はしない。
// ■ 判定が微妙な箇所（AIの聞き取り誤りの可能性）は区別して表示する（AIコーチ方針 7）。

import { normalizeToken, mergePair, LONE, lenient, subCost, isVowel, type RefPhone } from './phonemes';
import { textToRef, type RefWord } from './g2p';
import type { RecogOutput } from './recognizer';
import { JP_PAIRS, PHONEME_TIPS, soundName } from './tips';

export const PASS_SCORE = 85;
const UNCERTAIN_P = 0.15; // 正しい音の確率がこれ以上あれば「判定が微妙」とする

export interface Heard {
  p: string;
  start: number;
  end: number;
  conf: number;
}

export function ctcDecode(out: RecogOutput): { phones: Heard[]; idsOf: (p: string) => number[] } {
  const canon = out.vocab.map((t) => (t == null ? 'SKIP' : normalizeToken(t)));
  const raw: Heard[] = [];
  let prev = -1;
  for (let t = 0; t < out.frames; t++) {
    let k = 0,
      mx = -1;
      for (let v = 0; v < out.V; v++) {
      const x = out.probs[t * out.V + v];
      if (x > mx) {
        mx = x;
        k = v;
      }
    }
    const c = canon[k] ?? 'SKIP';
    if (k !== prev && c !== 'BLANK' && c !== 'SKIP' && c !== 'WORD') raw.push({ p: c, start: t, end: t, conf: mx });
    else if (k === prev && c !== 'BLANK' && c !== 'SKIP' && c !== 'WORD' && raw.length) {
      const h = raw[raw.length - 1];
      h.conf = (h.conf * (h.end - h.start + 1) + mx) / (h.end - h.start + 2);
      h.end = t;
    }
    prev = k;
  }
  // 2記号に分かれた二重母音などをまとめる
  const phones: Heard[] = [];
  for (const h of raw) {
    const last = phones[phones.length - 1];
    const m = last ? mergePair(last.p, h.p) : null;
    if (last && m && h.start - last.end <= 3) {
      last.p = m;
      last.end = h.end;
      last.conf = Math.min(last.conf, h.conf);
    } else phones.push({ ...h });
  }
  for (const h of phones) if (LONE[h.p]) h.p = LONE[h.p];

  const idsOf = (p: string) => {
    const ids: number[] = [];
    canon.forEach((c, i) => {
      const cc = LONE[c] ?? c;
      // 二重母音が2記号で出るモデルの場合は、最初の記号の確率で判断する
      if (cc === p || (p.length > 1 && isVowel(p) && c === p[0])) ids.push(i);
    });
    return ids;
  };
  return { phones, idsOf };
}

// ---------------- 照合 ----------------
export type OpKind = 'ok' | 'lenient' | 'sub' | 'del';
export interface Op {
  kind: OpKind;
  ref: RefPhone;
  heard?: number; // phones のインデックス
  heardP?: string; // 聞こえた音
  uncertain?: boolean;
}
export interface WordResult {
  raw: string;
  norm: string;
  sentence: number; // 何番目の文か（通し読み用）
  scored: boolean; // 辞書にない語は採点対象外
  ops: Op[];
  inserted: { idx: number; epenthesis: boolean; leading?: boolean }[];
  heard: string; // この語の位置で聞こえた音（表示用）
  correct: number;
  total: number;
  score: number | null; // 0〜100
  omitted: boolean;
  connected?: string | null; // 自然な音の変化として正解にした説明
}

interface Cell {
  cost: number;
  j: number;
  v: number;
}

function editTable(ref: RefPhone[], R: Heard[], j: number, maxB: number) {
  const L = ref.length;
  const W = Math.min(maxB, R.length - j);
  const E: Float32Array[] = [];
  for (let a = 0; a <= L; a++) {
    E.push(new Float32Array(W + 1));
    for (let b = 0; b <= W; b++) {
      if (a === 0) E[a][b] = b;
      else if (b === 0) E[a][b] = a;
      else {
        const h = R[j + b - 1].p;
        const sc = lenient(ref[a - 1], h) ? 0 : subCost(ref[a - 1].p, h);
        E[a][b] = Math.min(E[a - 1][b - 1] + sc, E[a - 1][b] + 1, E[a][b - 1] + 1);
      }
    }
  }
  return E;
}

export function alignWords(words: RefWord[], R: Heard[]) {
  const n = R.length;
  const W = words.length;
  // D[w][k]：最初の w 語で、聞こえた音の先頭 k 個を使ったときの最小コスト
  const D: Cell[][] = Array.from({ length: W + 1 }, () => Array.from({ length: n + 1 }, () => ({ cost: Infinity, j: -1, v: -1 })));
  for (let k = 0; k <= n; k++) D[0][k] = { cost: k * 0.5, j: -1, v: -1 }; // 読み始め前の雑音は安く扱う
  for (let w = 0; w < W; w++) {
    const row = D[w];
    const finite = row.map((c, k) => [c.cost, k] as const).filter(([c]) => c < Infinity);
    const best = Math.min(...finite.map(([c]) => c));
    const starts = finite
      .filter(([c]) => c <= best + 10)
      .sort((a, b) => a[0] - b[0])
      .slice(0, 60)
      .map(([, k]) => k);
    const vars = words[w].variants;
    for (const j of starts) {
      if (!vars.length) {
        // 辞書にない語：任意の数の音を少ないコストで飲み込む（採点対象外）
        for (let b = 0; b <= Math.min(12, n - j); b++) {
          const c = row[j].cost + b * 0.3;
          if (c < D[w + 1][j + b].cost) D[w + 1][j + b] = { cost: c, j, v: -1 };
        }
        continue;
      }
      vars.forEach((ref, vi) => {
        const maxB = ref.length * 3 + 4;
        const E = editTable(ref, R, j, maxB);
        const last = E[ref.length];
        for (let b = 0; b < last.length; b++) {
          const c = row[j].cost + last[b];
          if (c < D[w + 1][j + b].cost) D[w + 1][j + b] = { cost: c, j, v: vi };
        }
      });
    }
  }
  // 読み終わり後の余分な音
  let endK = 0,
    endC = Infinity;
  for (let k = 0; k <= n; k++) {
    const c = D[W][k].cost + (n - k);
    if (c < endC) {
      endC = c;
      endK = k;
    }
  }
  // 逆にたどって各語の範囲と読みを決める
  const spans: { j: number; k: number; v: number }[] = new Array(W);
  let k = endK;
  for (let w = W; w > 0; w--) {
    const c = D[w][k];
    spans[w - 1] = { j: c.j, k, v: c.v };
    k = c.j;
  }
  return { spans, leading: k, trailingFrom: endK };
}

function opsFor(ref: RefPhone[], R: Heard[], j: number, k: number) {
  const E = editTable(ref, R, j, k - j);
  const ops: Op[] = [];
  const ins: number[] = [];
  let a = ref.length,
    b = k - j;
  const seq: ({ op: Op } | { ins: number })[] = [];
  while (a > 0 || b > 0) {
    if (a > 0 && b > 0) {
      const h = R[j + b - 1].p;
      const len = lenient(ref[a - 1], h);
      const sc = len ? 0 : subCost(ref[a - 1].p, h);
      if (Math.abs(E[a][b] - (E[a - 1][b - 1] + sc)) < 1e-6) {
        seq.push({ op: { kind: ref[a - 1].p === h ? 'ok' : len ? 'lenient' : 'sub', ref: ref[a - 1], heard: j + b - 1, heardP: h } });
        a--;
        b--;
        continue;
      }
    }
    if (a > 0 && Math.abs(E[a][b] - (E[a - 1][b] + 1)) < 1e-6) {
      seq.push({ op: { kind: 'del', ref: ref[a - 1] } });
      a--;
    } else {
      seq.push({ ins: j + b - 1 });
      b--;
    }
  }
  seq.reverse();
  return { seq, ops, ins };
}

export interface ProsodyRef {
  pitchRangeSemitones: number | null; // 声の高さの幅（10〜90パーセンタイル）
  longPauses: number; // 文の途中の 0.35 秒以上の間
  speechSec: number;
}

export interface Assessment {
  score: number | null;
  passed: boolean;
  words: WordResult[];
  sentenceScores: { score: number | null; passed: boolean }[];
  heardAll: string;
  advice: { kind: 'pron' | 'tip' | 'epenthesis' | 'uncertain' | 'info'; text: string }[];
  weak: { p: string; heardAs?: string; word: string }[];
  unscored: string[];
  ms: number;
  /** 画面にすぐ出す要点（はっきりした誤りがある語、点数の低い順） */
  issues: Issue[];
  /** 自然な音の変化として正解にした箇所 */
  connected: string[];
  /** 判定が微妙な箇所（AIの聞き取り誤りの可能性） */
  uncertain: { word: string; p: string; heard?: string }[];
}

export interface Issue {
  word: string;
  wordIndex: number;
  score: number | null;
  omitted: boolean;
  errs: { p: string; heard: string | null }[];
  epenthesis: boolean;
}

const ph = (p: string) => `/${p}/`;

export function assess(out: RecogOutput, sentences: string[]): Assessment {
  const { phones, idsOf } = ctcDecode(out);
  const words: (RefWord & { sentence: number })[] = [];
  sentences.forEach((s, si) => textToRef(s).forEach((w) => words.push({ ...w, sentence: si })));
  const { spans, trailingFrom } = alignWords(words, phones);

  const maxProb = (ids: number[], f0: number, f1: number) => {
    let m = 0;
    for (let t = Math.max(0, f0); t <= Math.min(out.frames - 1, f1); t++) for (const id of ids) m = Math.max(m, out.probs[t * out.V + id]);
    return m;
  };

  const results: WordResult[] = words.map((w, wi) => {
    const sp = spans[wi];
    const heard = phones
      .slice(sp.j, sp.k)
      .map((h) => h.p)
      .join('');
    if (sp.v < 0 || !w.variants.length)
      return { raw: w.raw, norm: w.norm, sentence: w.sentence, scored: false, ops: [], inserted: [], heard, correct: 0, total: 0, score: null, omitted: false };
    const ref = w.variants[sp.v];
    const connected = w.notes?.[sp.v] ?? null;
    const { seq } = opsFor(ref, phones, sp.j, sp.k);
    const ops: Op[] = [];
    const inserted: WordResult['inserted'] = [];
    let prevConsonant = false;
    let seenOp = false;
    let lastHeardEnd = sp.j > 0 ? phones[sp.j - 1].end : -1;
    seq.forEach((s, si) => {
      if ('op' in s) {
        const op = s.op;
        if (op.kind === 'sub') {
          const h = phones[op.heard!];
          op.uncertain = maxProb(idsOf(op.ref.p), h.start, h.end) >= UNCERTAIN_P;
        } else if (op.kind === 'del') {
          const nextIdx = (seq.slice(si + 1).find((x) => ('op' in x ? x.op.heard != null : true)) as any) ?? null;
          const nextStart = nextIdx ? ('op' in nextIdx ? phones[nextIdx.op.heard].start : phones[nextIdx.ins].start) : sp.k < phones.length ? phones[sp.k].start : out.frames;
          // 前後の音にはさまれたすき間（前後の音そのものは含めない）に、正しい音の確率が残っているか
          op.uncertain = nextStart - 1 >= lastHeardEnd + 1 && maxProb(idsOf(op.ref.p), lastHeardEnd + 1, nextStart - 1) >= UNCERTAIN_P;
        }
        if (op.heard != null) lastHeardEnd = phones[op.heard].end;
        prevConsonant = !isVowel(op.ref.p) && op.kind !== 'del';
        seenOp = true;
        ops.push(op);
      } else {
        const hp = phones[s.ins];
        inserted.push({ idx: s.ins, epenthesis: prevConsonant && isVowel(hp.p), leading: !seenOp });
        lastHeardEnd = hp.end;
      }
    });
    // 語ごと読み飛ばした場合は「読み飛ばし」として扱い、個々の音の「判定が微妙」は付けない
    if (ops.every((o) => o.kind === 'del')) ops.forEach((o) => (o.uncertain = false));
    const correct = ops.filter((o) => o.kind === 'ok' || o.kind === 'lenient').length;
    const total = ref.length + inserted.length;
    return {
      raw: w.raw, norm: w.norm, sentence: w.sentence, scored: true, ops, inserted, heard,
      correct, total, score: Math.round((correct / Math.max(1, total)) * 100), omitted: ops.every((o) => o.kind === 'del'), connected,
    };
  });

  // 語の先頭に付いた余分な母音は、直前の語の語末に母音を足したもの（good → グッド「ゥ」）として前の語に移す
  for (let i = 1; i < results.length; i++) {
    const cur = results[i],
      prev = results[i - 1];
    if (!cur.scored || !prev.scored) continue;
    const lastOp = prev.ops[prev.ops.length - 1];
    if (!lastOp || isVowel(lastOp.ref.p) || lastOp.kind === 'del') continue;
    const lead = cur.inserted.filter((x) => x.leading && isVowel(phones[x.idx].p));
    if (!lead.length) continue;
    const first = lead[0];
    cur.inserted = cur.inserted.filter((x) => x !== first);
    cur.total--;
    cur.score = Math.round((cur.correct / Math.max(1, cur.total)) * 100);
    prev.inserted.push({ idx: first.idx, epenthesis: true });
    prev.total++;
    prev.score = Math.round((prev.correct / prev.total) * 100);
  }

  // 読み終わり後の余分な母音（最後の語の語末に母音が付いた場合）
  const lastScored = [...results].reverse().find((r) => r.scored);
  if (lastScored) {
    for (let i = trailingFrom; i < phones.length; i++) {
      const lastOp = lastScored.ops[lastScored.ops.length - 1];
      if (isVowel(phones[i].p) && lastOp && !isVowel(lastOp.ref.p) && i === trailingFrom) {
        lastScored.inserted.push({ idx: i, epenthesis: true });
        lastScored.total++;
        lastScored.score = Math.round((lastScored.correct / lastScored.total) * 100);
      }
    }
  }

  const scored = results.filter((r) => r.scored);
  const sumC = scored.reduce((s, r) => s + r.correct, 0);
  const sumT = scored.reduce((s, r) => s + r.total, 0);
  const score = sumT ? Math.round((sumC / sumT) * 100) : null;
  const omittedAny = scored.some((r) => r.omitted);
  const sentenceScores = sentences.map((_, si) => {
    const ws = scored.filter((r) => r.sentence === si);
    const c = ws.reduce((s, r) => s + r.correct, 0);
    const t = ws.reduce((s, r) => s + r.total, 0);
    const sc = t ? Math.round((c / t) * 100) : null;
    return { score: sc, passed: sc != null && sc >= PASS_SCORE && !ws.some((r) => r.omitted) };
  });

  // ---------------- フィードバック（根拠のある指摘だけ） ----------------
  const advice: Assessment['advice'] = [];
  const weak: Assessment['weak'] = [];
  const tipShown = new Set<string>();
  const omitted = scored.filter((r) => r.omitted);
  if (omitted.length) advice.push({ kind: 'pron', text: `音声の中に見つからなかった語：${omitted.map((r) => `「${r.raw}」`).join('、')}。読み飛ばしがあると合格になりません。` });

  const bad = scored.filter((r) => !r.omitted && r.ops.some((o) => (o.kind === 'sub' || o.kind === 'del') && !o.uncertain)).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  for (const r of bad.slice(0, 6)) {
    const errs = r.ops.filter((o) => (o.kind === 'sub' || o.kind === 'del') && !o.uncertain);
    const parts = errs.slice(0, 3).map((o) => {
      const h = o.heard != null ? phones[o.heard].p : null;
      weak.push({ p: o.ref.p, heardAs: h ?? '（なし）', word: r.raw });
      const key = `${o.ref.p}>${h ?? ''}`;
      return h ? `${soundName(o.ref.p)} が ${ph(h)} に聞こえました${JP_PAIRS[key] ? `（${JP_PAIRS[key]}）` : ''}` : `${soundName(o.ref.p)} が聞こえませんでした`;
    });
    advice.push({ kind: 'pron', text: `「${r.raw}」${r.score}点：${parts.join('、')}。` });
    for (const o of errs.slice(0, 2))
      if (PHONEME_TIPS[o.ref.p] && !tipShown.has(o.ref.p)) {
        tipShown.add(o.ref.p);
        advice.push({ kind: 'tip', text: `${soundName(o.ref.p)}：${PHONEME_TIPS[o.ref.p]}` });
      }
  }
  const epi = scored.filter((r) => r.inserted.some((x) => x.epenthesis));
  if (epi.length)
    advice.push({
      kind: 'epenthesis',
      text: `${epi.slice(0, 5).map((r) => `「${r.raw}」`).join('、')}で、子音の後に余分な母音が入っています（例：「ト」「ク」「ル」のように母音を足す）。英語は子音だけで止めたり、次の語へつなげたりします。`,
    });
  const unc = scored.flatMap((r) => r.ops.filter((o) => o.uncertain).map((o) => ({ r, o })));
  if (unc.length)
    advice.push({
      kind: 'uncertain',
      text: `判定が微妙な箇所：${unc
        .slice(0, 5)
        .map(({ r, o }) => `「${r.raw}」の ${ph(o.ref.p)}`)
        .join('、')}。AIは別の音と判断しましたが、正しい音の可能性もかなり残っています。AIの聞き取り誤りかもしれないため、苦手な発音の集計には入れていません。気になる場合はもう一度録音してください。`,
    });
  const unscored = results.filter((r) => !r.scored).map((r) => r.raw);
  if (unscored.length) advice.push({ kind: 'info', text: `辞書にない語は採点対象外です：${unscored.join(', ')}（数字は英語のつづりで書くと採点できます）。` });
  if (!advice.some((a) => a.kind === 'pron' || a.kind === 'epenthesis'))
    advice.push({ kind: 'info', text: `AIがはっきり別の音と判断した音・読み飛ばし・余分な母音は見つかりませんでした（正しく判定された音 ${sumC}/${sumT}）。` });

  const issues: Issue[] = results
    .map((r, wordIndex) => ({ r, wordIndex }))
    .filter(({ r }) => r.scored && (r.omitted || r.inserted.some((x) => x.epenthesis) || r.ops.some((o) => (o.kind === 'sub' || o.kind === 'del') && !o.uncertain)))
    .map(({ r, wordIndex }) => ({
      word: r.raw,
      wordIndex,
      score: r.score,
      omitted: r.omitted,
      errs: r.omitted ? [] : r.ops.filter((o) => (o.kind === 'sub' || o.kind === 'del') && !o.uncertain).map((o) => ({ p: o.ref.p, heard: o.heardP ?? null })),
      epenthesis: r.inserted.some((x) => x.epenthesis),
    }))
    .sort((a, b) => (a.omitted === b.omitted ? (a.score ?? 0) - (b.score ?? 0) : a.omitted ? -1 : 1));
  const uncertain = scored.flatMap((r) => r.ops.filter((o) => o.uncertain).map((o) => ({ word: r.raw, p: o.ref.p, heard: o.heardP })));

  const connected = [...new Set(results.filter((r) => r.connected && !r.omitted).map((r) => r.connected!))];
  return {
    issues,
    uncertain,
    connected,
    score,
    passed: score != null && score >= PASS_SCORE && !omittedAny,
    words: results,
    sentenceScores,
    heardAll: phones.map((h) => h.p).join(' '),
    advice,
    weak,
    unscored,
    ms: out.ms,
  };
}

// ---------------- 参考値（点数には含めない） ----------------
import { pitchTrack, hzToMidi } from './pitch';
export function prosodyRef(pcm: Int16Array): ProsodyRef {
  const hop = 160; // 10ms
  const en: number[] = [];
  for (let i = 0; i + 320 < pcm.length; i += hop) {
    let e = 0;
    for (let j = 0; j < 320; j++) e += (pcm[i + j] / 32768) ** 2;
    en.push(Math.sqrt(e / 320));
  }
  const peak = Math.max(...en, 1e-6);
  const th = Math.max(0.01, peak * 0.08);
  const first = en.findIndex((e) => e > th);
  const last = en.length - 1 - [...en].reverse().findIndex((e) => e > th);
  let pauses = 0,
    run = 0;
  for (let i = first; i <= last && first >= 0; i++) {
    if (en[i] < th) run++;
    else {
      if (run >= 35) pauses++;
      run = 0;
    }
  }
  const midis = pitchTrack(pcm)
    .filter((h): h is number => h != null && h > 60 && h < 500)
    .map(hzToMidi)
    .sort((a, b) => a - b);
  const range = midis.length >= 15 ? midis[Math.floor(midis.length * 0.9)] - midis[Math.floor(midis.length * 0.1)] : null;
  return { pitchRangeSemitones: range == null ? null : Math.round(range * 10) / 10, longPauses: pauses, speechSec: first >= 0 ? ((last - first) * hop) / 16000 : 0 };
}
