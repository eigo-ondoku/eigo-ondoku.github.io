import { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { currentText, recordFor, type AppData } from '../lib/storage';
import type { Assessment } from '../lib/scoring';
import type { Recording } from '../lib/recorder';
import { playUrl } from '../lib/tts';
import { isTouch, Kbd, ModelPanel, ResultPanel, SentenceWords, useAssessment, useHotkeys, useRecording, useSpeaker, AnalysisStatus } from '../components/common';
import { MeaningPanel } from '../components/Meaning';

export function addWeak(d: AppData, a: Assessment) {
  for (const w of a.weak) {
    const e = (d.weak[w.p] ??= { count: 0, heardAs: {}, examples: [] });
    e.count++;
    if (w.heardAs) e.heardAs[w.heardAs] = (e.heardAs[w.heardAs] ?? 0) + 1;
    if (!e.examples.includes(w.word)) e.examples = [w.word, ...e.examples].slice(0, 6);
  }
}

export function PracticeView({ goTexts }: { goTexts: () => void }) {
  const { data, update } = useApp();
  const rec = useRecording();
  const as = useAssessment();
  const { say, busy, err: ttsErr, stop: stopTts } = useSpeaker();
  const t = currentText(data);
  const ss = t?.sentences ?? [];
  const idx = Math.min(t?.current ?? 0, Math.max(0, ss.length - 1));
  const s = ss[idx];
  const r = s ? recordFor(data, s) : null;
  const passedCount = ss.filter((x) => recordFor(data, x).passed).length;
  const firstUnpassed = ss.findIndex((x) => !recordFor(data, x).passed);
  const [showMean, setShowMean] = useState(false);
  const [mword, setMword] = useState<string | null>(null);
  const sayWord = (w: string) => {
    say(w, false, 'word');
    setMword(w);
  };
  const saveJa = (ja: string) =>
    t &&
    s &&
    update((d) => {
      const x = d.texts.find((y) => y.id === t.id)?.sentences.find((y) => y.id === s.id);
      if (x) x.ja = ja;
      return d;
    });

  useEffect(() => {
    setMword(null);
    as.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, t?.id]);

  const go = (i: number) => {
    if (!t || i < 0 || i >= ss.length || rec.recording) return;
    if (firstUnpassed !== -1 && i > firstUnpassed && !confirm('前の文がまだ合格していません。練習として開きますか？')) return;
    update((d) => {
      d.texts.find((x) => x.id === t.id)!.current = i;
      return d;
    });
  };

  const onStopped = async (recording: Recording) => {
    if (!s) return;
    const a = await as.run(recording, [s.en]);
    if (!a || a.score == null) return;
    update((d) => {
      const cur = recordFor(d, s);
      d.records[s.id] = {
        text: s.en,
        attempts: cur.attempts + 1,
        last: a.score,
        best: cur.best == null ? a.score : Math.max(cur.best, a.score!),
        passed: cur.passed || a.passed,
        lastAt: Date.now(),
      };
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
  const model = (slow: boolean) => s && (busy ? stopTts() : say(s.en, slow, 'all'));
  const own = () => rec.result && !rec.recording && playUrl(rec.result.url);

  useHotkeys(
    {
      Space: toggleRec,
      p: () => model(false),
      s: () => model(true),
      r: own,
      m: () => setShowMean((v) => !v),
      ArrowRight: () => go(idx + 1),
      ArrowLeft: () => go(idx - 1),
    },
    Boolean(s),
  );

  if (!t || !s)
    return (
      <section>
        <h2>音読練習</h2>
        <p>まだ教材が登録されていません。</p>
        <button className="btn primary" onClick={goTexts}>
          教材を登録する
        </button>
      </section>
    );

  return (
    <section className="practice">
      <div className="topline">
        <span className="crumb">
          📖 {t.title}{' '}
          <button className="linklike small" onClick={goTexts}>
            変更
          </button>
        </span>
        <nav className="dots" aria-label="文の一覧">
          {ss.map((x, i) => {
            const rr = recordFor(data, x);
            return (
              <button key={x.id} className={'dot' + (i === idx ? ' cur' : '') + (rr.passed ? ' ok' : rr.attempts ? ' tried' : '')} onClick={() => go(i)} title={x.en}>
                {rr.passed ? '★' : i + 1}
              </button>
            );
          })}
        </nav>
        <span className="small muted">
          {passedCount}/{ss.length} 合格
        </span>
      </div>
      <ModelPanel compact />

      <div className="pgrid">
        <div className="card left">
          <div className="row between tight">
            <span className="muted small">
              文 {idx + 1} / {ss.length}
            </span>
            <span className="small muted">
              {r!.attempts}回 ｜ 最新 {r!.last ?? '—'} ｜ 最高 {r!.best ?? '—'} {r!.passed && <b className="okmark">✔</b>}
            </span>
          </div>
          <SentenceWords text={s.en} words={as.result?.words} onSay={sayWord} />
          {showMean && <MeaningPanel en={s.en} ja={s.ja} word={mword} onSaveJa={saveJa} />}
          {s.notes && <p className="notes">📝 {s.notes}</p>}

          <div className="controls">
            <button className="btn primary" onClick={() => model(false)}>
              {busy === 'all' ? '■ 停止' : '▶ お手本'} <Kbd k="P" />
            </button>
            <button className="btn" onClick={() => model(true)}>
              {busy === 'all:slow' ? '■ 停止' : '🐢 ゆっくり'} <Kbd k="S" />
            </button>
            <button className={'btn rec' + (rec.recording ? ' on' : '')} onClick={toggleRec} disabled={Boolean(as.status)}>
              {rec.recording ? `■ 停止（${rec.elapsed.toFixed(1)}秒）` : '🎙 録音'} <Kbd k="Space" />
            </button>
            <button className="btn" onClick={own} disabled={!rec.result || rec.recording}>
              🔊 自分の声 <Kbd k="R" />
            </button>
            <button className={'btn' + (showMean ? ' on' : '')} onClick={() => setShowMean((v) => !v)} aria-pressed={showMean}>
              📖 意味 <Kbd k="M" />
            </button>
          </div>
          {rec.recording && (
            <div className="meter" aria-hidden>
              <div style={{ width: `${Math.min(100, rec.level * 140)}%` }} />
            </div>
          )}
          {(rec.error || ttsErr) && <p className="error small">{rec.error ?? ttsErr}</p>}
          <div className="row between navrow">
            <button className="btn sm" onClick={() => go(idx - 1)} disabled={idx === 0}>
              ← 前の文
            </button>
            <button className={'btn sm ' + (r!.passed ? 'primary' : '')} onClick={() => go(idx + 1)} disabled={idx >= ss.length - 1}>
              次の文 → <Kbd k="→" />
            </button>
          </div>
        </div>

        <div className="card right">
          {as.status ? (
            <AnalysisStatus status={as.status} progress={as.progress} />
          ) : as.error ? (
            <p className="error">{as.error}</p>
          ) : as.result ? (
            <ResultPanel a={as.result} prosody={as.prosody} onSay={sayWord} />
          ) : (
            <div className="howto">
              <p>
                <b>使い方</b>
              </p>
              {isTouch() ? (
                <ol>
                  <li>「▶ お手本」で聞く（単語を押すとその単語だけ）</li>
                  <li>「🎙 録音」を押して読み、読み終えたらもう一度押す</li>
                  <li>色の付いた単語と、ここに出る要点を確認</li>
                  <li>すぐ「🎙 録音」で再挑戦、合格したら「次の文 →」</li>
                </ol>
              ) : (
                <ol>
                  <li>
                    <Kbd k="P" /> キーでお手本を聞く（単語を押すとその単語だけ）
                  </li>
                  <li>
                    <Kbd k="Space" /> キーで録音開始、読み終えたらもう一度 <Kbd k="Space" />
                  </li>
                  <li>色の付いた単語と、ここに出る要点を確認</li>
                  <li>
                    <Kbd k="Space" /> キーですぐ再挑戦、合格したら <Kbd k="→" /> キーで次の文へ
                  </li>
                </ol>
              )}
              <p className="small muted">意味を知りたいときは「📖 意味」{isTouch() ? '' : '（M キー）'}を押してから、単語を押します。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
