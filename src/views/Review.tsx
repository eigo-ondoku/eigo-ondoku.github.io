import { useRef, useState } from 'react';
import { useApp } from '../ctx';
import { currentText, recordFor, type Sentence } from '../lib/storage';
import { speak, stopSpeaking } from '../lib/tts';
import { isTouch, Kbd, ModelPanel, ResultPanel, SentenceWords, useAssessment, useHotkeys, useRecording, useSpeaker } from '../components/common';
import type { Recording } from '../lib/recorder';
import { playUrl } from '../lib/tts';
import { addWeak } from './Practice';

export function groupsOf(ss: Sentence[]): Sentence[][] {
  const g: Sentence[][] = [];
  for (let i = 0; i < ss.length; i += 4) g.push(ss.slice(i, i + 4));
  if (g.length > 1 && g[g.length - 1].length === 1) g[g.length - 2].push(...g.pop()!);
  return g;
}

export function ReviewView({ goTexts }: { goTexts: () => void }) {
  const { data, update } = useApp();
  const t = currentText(data);
  const ss = t?.sentences ?? [];
  const groups = groupsOf(ss);
  const [gi, setGi] = useState<number | 'all'>(0);
  const [playing, setPlaying] = useState(false);
  const [playErr, setPlayErr] = useState<string | null>(null);
  const [lineIdx, setLineIdx] = useState(-1);
  const cancel = useRef(false);
  const rec = useRecording();
  const as = useAssessment();
  const { say } = useSpeaker();
  const hk = useRef<Record<string, () => void>>({});
  useHotkeys({ Space: () => hk.current.Space?.(), p: () => hk.current.p?.(), s: () => hk.current.s?.(), r: () => hk.current.r?.() });

  if (!t || ss.length < 2)
    return (
      <section>
        <h2>通し読み</h2>
        <p>2文以上ある教材で使えます。</p>
        <button className="btn" onClick={goTexts}>
          教材へ
        </button>
      </section>
    );

  const all = gi === 'all';
  const g = all ? ss : groups[Math.min(gi as number, groups.length - 1)];
  const key = g.map((s) => s.id).join('|');
  const gr = data.groups[key];
  const allPassed = ss.every((s) => recordFor(data, s).passed);

  const playAll = async (slow: boolean) => {
    if (playing) {
      cancel.current = true;
      stopSpeaking();
      setPlaying(false);
      setLineIdx(-1);
      return;
    }
    cancel.current = false;
    setPlaying(true);
    setPlayErr(null);
    try {
      for (let i = 0; i < g.length && !cancel.current; i++) {
        setLineIdx(i);
        await speak(g[i].en, slow, data.settings);
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (e: any) {
      setPlayErr(e?.message ?? String(e));
    }
    setPlaying(false);
    setLineIdx(-1);
  };

  const onStopped = async (r: Recording) => {
    const a = await as.run(
      r,
      g.map((s) => s.en),
    );
    if (!a || a.score == null) return;
    update((d) => {
      const cur = d.groups[key];
      d.groups[key] = { attempts: (cur?.attempts ?? 0) + 1, last: a.score, best: cur?.best == null ? a.score : Math.max(cur.best, a.score!) };
      if (all) {
        const tt = d.texts.find((x) => x.id === t.id)!;
        tt.fullRuns.push({ at: Date.now(), score: a.score, passed: a.passed });
        if (a.passed) tt.mastered = true;
      }
      addWeak(d, a);
      return d;
    });
  };

  const toggleRec = async () => {
    if (rec.recording) {
      const out = await rec.stop();
      if (out) onStopped(out);
    } else if (!as.status) rec.start();
  };
  hk.current = { Space: toggleRec, p: () => playAll(false), s: () => playAll(true), r: () => rec.result && !rec.recording && playUrl(rec.result.url) };

  const prevBest = t.fullRuns.reduce<number | null>((m, x) => (x.score == null ? m : m == null ? x.score : Math.max(m, x.score)), null);
  const weakSentences = as.result
    ? as.result.sentenceScores
        .map((x, i) => ({ ...x, i }))
        .filter((x) => !x.passed)
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    : [];

  return (
    <section>
      <h2>通し読み</h2>
      <p className="muted small">数文を続けて音読。全文で合格すると「🏅マスター」。</p>
      <div className="row wrap">
        {groups.map((x, i) => (
          <button key={i} className={'btn sm' + (gi === i ? ' primary' : '')} onClick={() => (setGi(i), as.reset())}>
            {x.every((s) => recordFor(data, s).passed) ? '★ ' : ''}
            {ss.indexOf(x[0]) + 1}〜{ss.indexOf(x[x.length - 1]) + 1}
          </button>
        ))}
        <button className={'btn sm' + (all ? ' primary' : '')} onClick={() => (setGi('all'), as.reset())}>
          {t.mastered ? '🏅 ' : ''}全文（{ss.length}文）
        </button>
      </div>
      <ModelPanel compact />
      {all && !allPassed && <div className="banner info small">全文の通し読みは、すべての文を音読練習で合格してから挑戦するのがおすすめです（今も挑戦はできます）。</div>}

      <div className="pgrid">
      <div className="card left">
        <ol className="glines" start={ss.indexOf(g[0]) + 1}>
          {g.map((s, i) => (
            <li key={s.id} className={i === lineIdx ? 'on' : ''}>
              {as.result ? (
                <SentenceWords text={s.en} words={as.result.words.filter((w) => w.sentence === i)} onSay={(w) => say(w, false, 'word')} />
              ) : (
                <span className="en">{s.en}</span>
              )}
              {s.ja && <span className="ja small">{s.ja}</span>}
              {as.result && <span className={'pscore small ' + (as.result.sentenceScores[i]?.passed ? 'pass' : 'fail')}>この文 {as.result.sentenceScores[i]?.score ?? '—'}点</span>}
            </li>
          ))}
        </ol>
        <div className="row">
          <button className="btn primary" onClick={() => playAll(false)}>
            {playing ? '■ 停止' : '▶ お手本を続けて再生'} <Kbd k="P" />
          </button>
          <button className="btn" onClick={() => playAll(true)} disabled={playing}>
            🐢 ゆっくり <Kbd k="S" />
          </button>
          <button className={'btn rec' + (rec.recording ? ' on' : '')} onClick={toggleRec} disabled={Boolean(as.status)}>
            {rec.recording ? `■ 停止（${rec.elapsed.toFixed(1)}秒）` : all ? '🎙 全文を録音' : '🎙 録音'} <Kbd k="Space" />
          </button>
          <button className="btn" onClick={() => rec.result && playUrl(rec.result.url)} disabled={!rec.result || rec.recording}>
            🔊 自分の声 <Kbd k="R" />
          </button>
        </div>
        {playErr && <p className="error">{playErr}</p>}
        {gr && (
          <p className="small muted">
            この範囲の記録：{gr.attempts}回 ｜ 最新 {gr.last ?? '—'} ｜ 最高 {gr.best ?? '—'}
          </p>
        )}
      </div>

      <div className="card right">
        {!(rec.recording || rec.error || as.status || as.error || as.result) && (
          <div className="howto">
            {isTouch() ? (
              <ol>
                <li>「▶ お手本を続けて再生」で聞く</li>
                <li>「🎙 録音」を押して続けて読み、読み終えたらもう一度押す</li>
                <li>色の付いた単語と、ここに出る要点を確認</li>
              </ol>
            ) : (
              <ol>
                <li>
                  <Kbd k="P" /> キーでお手本を続けて聞く
                </li>
                <li>
                  <Kbd k="Space" /> キーで録音開始、全部読んだらもう一度 <Kbd k="Space" />
                </li>
                <li>色の付いた単語と、ここに出る要点を確認</li>
              </ol>
            )}
          </div>
        )}
        {rec.recording && (
          <div className="meter" aria-hidden>
            <div style={{ width: `${Math.min(100, rec.level * 140)}%` }} />
          </div>
        )}
        {rec.error && <p className="error small">{rec.error}</p>}
        {as.status && <p className="loading">⏳ {as.status}</p>}
        {as.error && <p className="error">{as.error}</p>}
        {as.result && (
          <>
            {all && as.result.passed && (
              <div className="cert">
                <div className="cert-inner">
                  <p className="cert-title">🏅 MASTER</p>
                  <p>{t.title}</p>
                  <p className="cert-score">{as.result.score} 点</p>
                  <p className="small">{new Date().toLocaleDateString('ja-JP')} 全文の通し読みに合格</p>
                </div>
              </div>
            )}
            {all && (
              <p>
                これまでの全文の最高：{prevBest ?? '—'} 点 → 今回：<b>{as.result.score}</b>
              </p>
            )}
            <ResultPanel a={as.result} prosody={as.prosody} onSay={(w) => say(w, false, 'word')} />
            {weakSentences.length > 0 && (
              <>
                <h4>点数の低い文</h4>
                <ul className="small">
                  {weakSentences.slice(0, 5).map((x) => (
                    <li key={x.i}>
                      {ss.indexOf(g[x.i]) + 1}. {g[x.i].en} — <b className="fail">{x.score ?? '—'}点</b>
                    </li>
                  ))}
                </ul>
              </>
            )}

          </>
        )}
      </div>
      </div>

      {all && t.fullRuns.length > 0 && (
        <div className="card">
          <h3>全文の過去の記録</h3>
          <table className="table">
            <tbody>
              {[...t.fullRuns]
                .reverse()
                .slice(0, 10)
                .map((x, i) => (
                  <tr key={i}>
                    <td>{new Date(x.at).toLocaleString('ja-JP')}</td>
                    <td>{x.score ?? '—'}点</td>
                    <td>{x.passed ? '🏅 合格' : ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
