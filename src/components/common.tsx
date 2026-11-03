import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../ctx';
import { Recorder, type Recording } from '../lib/recorder';
import { playUrl, speak, stopSpeaking } from '../lib/tts';
import { splitWords } from '../lib/g2p';
import { loadModel, recognize, type RecogProgress } from '../lib/recognizer';
import { assess, prosodyRef, PASS_SCORE, type Assessment, type ProsodyRef, type WordResult } from '../lib/scoring';
import { HEARD_NAME, PAIR_SHORT, SHORT_TIPS, soundName } from '../lib/tips';

// ---------------- お手本 ----------------
export function useSpeaker() {
  const { data } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const say = useCallback(
    async (text: string, slow = false, tag = 'all') => {
      setErr(null);
      setBusy(tag + (slow ? ':slow' : ''));
      try {
        setVoice(await speak(text, slow, data.settings));
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setBusy(null);
      }
    },
    [data.settings],
  );
  useEffect(() => () => stopSpeaking(), []);
  return { say, busy, err, voice, stop: () => (stopSpeaking(), setBusy(null)) };
}

export function ModelButtons({ text, showWords = true }: { text: string; showWords?: boolean }) {
  const { say, busy, err, voice, stop } = useSpeaker();
  const words = splitWords(text);
  return (
    <div className="model">
      <div className="row">
        <button className="btn primary" onClick={() => (busy ? stop() : say(text, false))}>
          {busy === 'all' ? '■ 停止' : '▶ お手本'}
        </button>
        <button className="btn" onClick={() => (busy ? stop() : say(text, true))}>
          {busy === 'all:slow' ? '■ 停止' : '🐢 ゆっくり'}
        </button>
        {voice && <span className="muted small">声：{voice}</span>}
      </div>
      {showWords && (
        <div className="chips" aria-label="単語ごとの発音">
          {words.map((w, i) => (
            <button key={i} className={'chip' + (busy?.startsWith(`w${i}`) ? ' on' : '')} onClick={() => say(w.raw, false, `w${i}`)} onDoubleClick={() => say(w.raw, true, `w${i}`)} title="クリック：通常 / ダブルクリック：ゆっくり">
              {w.raw}
            </button>
          ))}
        </div>
      )}
      {err && <p className="error">🔇 {err}</p>}
    </div>
  );
}

// ---------------- 録音 ----------------
export function useRecording() {
  const rec = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [result, setResult] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const t0 = useRef(0);
  const tick = useRef<number>();

  const stop = useCallback(async () => {
    window.clearInterval(tick.current);
    const r = rec.current;
    rec.current = null;
    setRecording(false);
    setLevel(0);
    if (!r) return null;
    const out = await r.stop();
    setResult(out);
    return out;
  }, []);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const start = useCallback(async () => {
    setError(null);
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    stopSpeaking();
    const r = new Recorder();
    r.onLevel = (v) => setLevel(v);
    r.maxSeconds = 300;
    r.onMaxReached = () => stopRef.current();
    rec.current = r;
    try {
      await r.start();
    } catch (e: any) {
      rec.current = null;
      setError(e?.message ?? String(e));
      return false;
    }
    setRecording(true);
    t0.current = performance.now();
    tick.current = window.setInterval(() => setElapsed((performance.now() - t0.current) / 1000), 200);
    return true;
  }, [result]);

  useEffect(
    () => () => {
      window.clearInterval(tick.current);
      rec.current?.cancel();
    },
    [],
  );
  return { start, stop, recording, level, result, error, elapsed };
}

export function RecordButtons({ r, onStopped, label = '録音開始' }: { r: ReturnType<typeof useRecording>; onStopped: (rec: Recording) => void; label?: string }) {
  return (
    <div className="recbox">
      <div className="row">
        {!r.recording ? (
          <button className="btn rec" onClick={() => r.start()}>
            🎙 {label}
          </button>
        ) : (
          <button
            className="btn rec on"
            onClick={async () => {
              const out = await r.stop();
              if (out) onStopped(out);
            }}
          >
            ■ 録音停止（{r.elapsed.toFixed(1)}秒）
          </button>
        )}
        <button className="btn" disabled={!r.result || r.recording} onClick={() => r.result && playUrl(r.result.url)}>
          🔊 自分の声を再生
        </button>
      </div>
      {r.recording && (
        <div className="meter" aria-hidden>
          <div style={{ width: `${Math.min(100, r.level * 140)}%` }} />
        </div>
      )}
      {r.error && <p className="error">🎙 {r.error}</p>}
    </div>
  );
}

// ---------------- 採点 ----------------
export function useAssessment() {
  const { data, model, dictReady } = useApp();
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<RecogProgress | null>(null);
  const [result, setResult] = useState<Assessment | null>(null);
  const [prosody, setProsody] = useState<ProsodyRef | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (rec: Recording, sentences: string[]): Promise<Assessment | null> => {
      setResult(null);
      setProsody(null);
      setError(null);
      if (rec.seconds < 0.4) {
        setError('録音が短すぎます。もう一度録音してください。（採点は行っていません）');
        return null;
      }
      if (rec.peak < 0.02) {
        setError('ほとんど無音でした。マイクの位置・音量を確認してもう一度録音してください。（採点は行っていません）');
        return null;
      }
      try {
        if (model.state !== 'ready') {
          if (model.state === 'none' || model.state === 'unknown' || model.state === 'error') {
            setError('採点できません：発音判定AIがまだ準備されていません。上の「AIを準備する」を押してください（初回のみ約355MBのダウンロード）。録音の再生とお手本は使えます。');
            return null;
          }
          setStatus('発音判定AIを準備中…');
          await loadModel(data.settings);
        }
        if (!dictReady) setStatus('発音辞書を準備中…');
        const { loadDictionary } = await import('../lib/g2p');
        await loadDictionary();
        setStatus(`音声を分析中（${rec.seconds.toFixed(0)}秒の録音・この端末の中で処理）`);
        const out = await recognize(rec.pcm, setProgress);
        const a = assess(out, sentences);
        setProsody(prosodyRef(rec.pcm));
        if (a.score == null) {
          setError('採点できる単語がありませんでした（英文が辞書にない語だけでできている可能性があります）。');
          return null;
        }
        setResult(a);
        return a;
      } catch (e: any) {
        setError('採点できませんでした：' + (e?.message ?? String(e)));
        return null;
      } finally {
        setStatus(null);
        setProgress(null);
      }
    },
    [model.state, data.settings, dictReady],
  );
  const reset = () => {
    setResult(null);
    setError(null);
    setProsody(null);
  };
  return { run, status, progress, result, prosody, error, reset };
}

/** 分析中の表示：進み具合のバーと残り時間の目安 */
export function AnalysisStatus({ status, progress }: { status: string; progress: RecogProgress | null }) {
  const pct = progress?.frac != null ? Math.round(progress.frac * 100) : null;
  let note = '';
  if (progress) {
    if (pct == null) note = `${Math.floor(progress.elapsed)}秒経過（初回は処理時間を測っています。次回から残り時間の目安が出ます）`;
    else if (progress.remain != null && progress.remain >= 1) note = `${pct}%・残り約${Math.ceil(progress.remain)}秒`;
    else note = `${pct}%・まもなく終わります`;
  }
  return (
    <div className="analysis" role="status" aria-live="polite">
      <p className="loading">⏳ {status}</p>
      {progress && (
        <>
          <div className={'abar' + (pct == null ? ' indet' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
            <div style={pct == null ? undefined : { width: pct + '%' }} />
          </div>
          <p className="small muted">{note}</p>
        </>
      )}
    </div>
  );
}

function wordClass(w: WordResult) {
  if (!w.scored) return 'w na';
  if (w.omitted) return 'w omit';
  const s = w.score ?? 0;
  const hasUnc = w.ops.some((o) => o.uncertain);
  return 'w ' + (s >= 100 ? 'good' : s >= 75 ? 'mid' : 'bad') + (hasUnc ? ' unc' : '') + (w.inserted.some((x) => x.epenthesis) ? ' epi' : '');
}

/** キーボード操作。入力欄に文字を打っているときは反応しない */
export function useHotkeys(map: Record<string, () => void>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const fn = ref.current[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled]);
}

export const Kbd = ({ k }: { k: string }) => <kbd className="kbd">{k}</kbd>;

/** タッチ操作の端末（スマホ・タブレット）か */
export const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

/** 文を単語ボタンで表示。採点後は単語が色分けされ、押すとお手本と音ごとの判定を表示 */
export function SentenceWords({ text, words, onSay }: { text: string; words?: WordResult[]; onSay: (w: string) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [text, words]);
  const plain = splitWords(text);
  const w = sel != null && words ? words[sel] : null;
  return (
    <div className="sentence">
      <div className="swords">
        {words
          ? words.map((x, i) => (
              <button key={i} className={wordClass(x) + (sel === i ? ' sel' : '')} onClick={() => (setSel(i), onSay(x.raw))} title="押すとお手本と、音ごとの判定を表示">
                {x.raw}
                <small>{!x.scored ? '対象外' : x.omitted ? '抜け' : x.score}</small>
              </button>
            ))
          : plain.map((x, i) => (
              <button key={i} className="w plain" onClick={() => onSay(x.raw)} title="押すとこの単語のお手本">
                {x.raw}
              </button>
            ))}
      </div>
      {w && w.scored && (
        <div className="phonemes">
          {w.ops.map((o, i) => (
            <span key={i} className={'ph ' + (o.kind === 'ok' || o.kind === 'lenient' ? 'good' : o.uncertain ? 'mid' : 'bad')} title={soundName(o.ref.p)}>
              /{o.ref.p}/{o.kind === 'sub' && <em>→/{o.heardP}/</em>}
              {o.kind === 'del' && <em>→なし</em>}
            </span>
          ))}
          {w.inserted.length > 0 && <span className="ph bad">＋余分な音</span>}
        </div>
      )}
    </div>
  );
}

/** 採点結果の要点（1画面に収まる量だけ）＋詳細は折りたたみ */
export function ResultPanel({ a, prosody, onSay }: { a: Assessment; prosody: ProsodyRef | null; onSay: (w: string) => void }) {
  // 続けて読み飛ばした語は1行にまとめる
  const merged: typeof a.issues = [];
  for (const x of [...a.issues].sort((p, q) => p.wordIndex - q.wordIndex)) {
    const last = merged[merged.length - 1];
    if (x.omitted && last?.omitted && last.wordIndex + last.word.split(' ').length === x.wordIndex) last.word += ' ' + x.word;
    else merged.push({ ...x });
  }
  merged.sort((p, q) => (p.omitted === q.omitted ? (p.score ?? 0) - (q.score ?? 0) : p.omitted ? -1 : 1));
  const top = merged.slice(0, 4);
  const more = merged.length - top.length;
  return (
    <div className="result">
      <div className="score-head">
        <div className={'total ' + (a.passed ? 'pass' : 'fail')}>
          {a.score}
          <small>点</small>
        </div>
        <div>
          <p className={a.passed ? 'passmsg' : 'failmsg'}>{a.passed ? '⭐ 合格' : 'もう一度'}</p>
          <p className="small muted">音の正確さ（合格 {PASS_SCORE}点・抜けなし）</p>
        </div>
      </div>

      {top.length > 0 ? (
        <ul className="issues">
          {top.map((x) => (
            <li key={x.wordIndex}>
              <button className="iword" onClick={() => onSay(x.word)} title="お手本を聞く">
                {x.word}
              </button>
              {x.omitted ? (
                <span className="itxt">読み飛ばし</span>
              ) : (
                <span className="itxt">
                  {x.errs.slice(0, 2).map((e, i) => (
                    <span key={i} className="err">
                      <b>/{e.p}/</b>→{e.heard ? `/${e.heard}/` : '聞こえない'}
                      {e.heard && (PAIR_SHORT[`${e.p}>${e.heard}`] || HEARD_NAME[e.heard]) && (
                        <span className="pair">（{PAIR_SHORT[`${e.p}>${e.heard}`] ?? HEARD_NAME[e.heard]}）</span>
                      )}
                      {SHORT_TIPS[e.p] && <span className="tip1">→ {SHORT_TIPS[e.p]}</span>}
                    </span>
                  ))}
                  {x.epenthesis && (
                    <span className="err">
                      <b>語末</b>に母音<span className="tip1">子音だけで止める</span>
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
          {more > 0 && <li className="muted small">ほか {more} 語（詳しくは下）</li>}
        </ul>
      ) : (
        <p className="noissue">はっきりした誤りは見つかりませんでした。</p>
      )}
      {a.connected.length > 0 && (
        <p className="small conn-note" title="ネイティブの音読でも起こる自然な音の変化なので、減点していません">
          ✓ 自然な音の変化として正解：{a.connected.slice(0, 3).join('／')}
        </p>
      )}
      {a.uncertain.length > 0 && (
        <p className="small unc-note" title="AIの聞き取り誤りの可能性があるため、点数の指摘とは分けています">
          判定が微妙：{a.uncertain.slice(0, 3).map((u) => `${u.word} /${u.p}/`).join('、')}
        </p>
      )}

      <details className="more">
        <summary>詳しく見る</summary>
        <AssessmentDetails a={a} prosody={prosody} />
      </details>
    </div>
  );
}

const GROUPS: [string, Assessment['advice'][number]['kind'][]][] = [
  ['発音の改善点とコツ', ['pron', 'tip']],
  ['余分な母音', ['epenthesis']],
  ['判定が微妙な箇所（AIの聞き取り誤りの可能性）', ['uncertain']],
  ['その他', ['info']],
];

export function AssessmentDetails({ a, prosody }: { a: Assessment; prosody: ProsodyRef | null }) {
  return (
    <div className="details-body">
      {GROUPS.map(([title, kinds]) => {
        const items = a.advice.filter((x) => kinds.includes(x.kind));
        if (!items.length) return null;
        return (
          <div key={title}>
            <h4>{title}</h4>
            <ul className="advice">
              {items.map((x, i) => (
                <li key={i} className={x.kind === 'tip' ? 'tip' : x.kind === 'uncertain' ? 'recog-note' : ''}>
                  {x.text}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <h4>AIが聞き取った音</h4>
      <p className="recog ipa">/{a.heardAll || '—'}/</p>
      {prosody && (
        <>
          <h4>参考値（点数には含めません）</h4>
          <p className="small">
            声の高さの幅 {prosody.pitchRangeSemitones ?? '—'} 半音{prosody.pitchRangeSemitones != null && prosody.pitchRangeSemitones < 3 ? '（平坦ぎみ）' : ''}／文の途中の長い間 {prosody.longPauses} 回
          </p>
        </>
      )}
      <p className="small muted">強弱・リズム・イントネーションは、このAIでは測定できないため点数にしていません。分析 {(a.ms / 1000).toFixed(1)} 秒（端末内）。</p>
    </div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress" aria-label={`進捗 ${pct}%`}>
      <div className="bar big">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span>
        {done} / {total} 文 合格（{pct}%）
      </span>
    </div>
  );
}

export function ModelPanel({ compact }: { compact?: boolean }) {
  const { data, model, crashed, dismissCrash } = useApp();
  const [err, setErr] = useState<string | null>(null);
  const go = () => {
    setErr(null);
    dismissCrash();
    loadModel(data.settings).catch((e) => setErr(e.message));
  };
  if (crashed && model.state !== 'ready' && model.state !== 'downloading' && model.state !== 'initializing')
    return (
      <div className="banner warn">
        <b>前回、AIの準備中または分析中にページが再読み込みされました。</b>
        この端末ではメモリが足りず、発音判定AIを動かせない可能性があります（iPhone・iPad で起こりやすい現象です）。他のアプリやタブを閉じてから再挑戦するか、パソコンでお使いください。お手本・録音・自分の声の再生はこのまま使えます。{' '}
        <button className="btn sm" onClick={go}>
          もう一度試す
        </button>
      </div>
    );
  if (model.state === 'ready') return compact ? null : <p className="pass">✔ 発音判定AI：準備完了（この端末内で動作{model.threads ? `・${model.threads}スレッド` : ''}）</p>;
  const mb = (n?: number) => ((n ?? 0) / 1e6).toFixed(0);
  return (
    <div className="banner warn">
      {model.state === 'downloading' ? (
        <>
          <b>発音判定AIをダウンロード中…</b> {mb(model.loaded)} / {model.total ? mb(model.total) : '約355'} MB
          <div className="bar">
            <div style={{ width: model.total ? `${((model.loaded ?? 0) / model.total) * 100}%` : '5%' }} />
          </div>
          <span className="small">初回のみです。完了後はこの端末に保存され、次回からはすぐ使えます。</span>
        </>
      ) : model.state === 'initializing' ? (
        <b>発音判定AIを起動中…（数十秒かかることがあります）</b>
      ) : model.state === 'cached' ? (
        <>
          発音判定AIはこの端末に保存済みです。{' '}
          <button className="btn sm primary" onClick={go}>
            AIを起動する
          </button>
        </>
      ) : model.state === 'unknown' ? (
        <span>発音判定AIの状態を確認中…</span>
      ) : (
        <>
          <b>採点には発音判定AIの準備が必要です。</b>（初回のみ約355MBのダウンロード。Wi-Fi 環境をおすすめします。録音はこの端末の外へは送信されません）{' '}
          <button className="btn sm primary" onClick={go}>
            AIを準備する
          </button>
          {model.state === 'error' && <p className="error">前回のエラー：{model.error}</p>}
        </>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
