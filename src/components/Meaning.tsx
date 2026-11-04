import { Fragment, useEffect, useState } from 'react';
import { lookupMeaning, translateToJa, translatorStatus, type WordMeaning } from '../lib/meaning';

/** 『…』（主な意味）を太字にして表示 */
function Sense({ t }: { t: string }) {
  const parts = t.split(/『|』/);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

function WordBox({ word }: { word: string }) {
  const [res, setRes] = useState<WordMeaning[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    let live = true;
    setRes(null);
    setErr(null);
    setMore(false);
    lookupMeaning(word)
      .then((r) => live && setRes(r))
      .catch((e) => live && setErr(String(e?.message ?? e)));
    return () => {
      live = false;
    };
  }, [word]);
  if (err) return <p className="error small">{err}</p>;
  if (!res) return <p className="small muted">辞書を読み込み中…（初回のみ・約2MB）</p>;
  if (res.length === 0) return <p className="small muted">「{word}」は辞書に見つかりませんでした（人名・固有名詞などの可能性があります）。</p>;
  const total = res.reduce((n, r) => n + r.senses.length, 0);
  return (
    <div className="wmean">
      {res.map((r) => (
        <div key={r.head}>
          <b className="en whead">{r.head}</b>
          <ol>
            {(more ? r.senses : r.senses.slice(0, 4)).map((s, i) => (
              <li key={i}>
                <Sense t={s} />
              </li>
            ))}
          </ol>
        </div>
      ))}
      {total > 4 * res.length && !more && (
        <button className="linklike small" onClick={() => setMore(true)}>
          ほかの意味も見る
        </button>
      )}
    </div>
  );
}

function SentenceTranslation({ en, ja, onSaveJa }: { en: string; ja: string; onSaveJa?: (ja: string) => void }) {
  const [st, setSt] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setOut(null);
    setErr(null);
  }, [en]);
  useEffect(() => {
    if (!ja) translatorStatus().then(setSt);
  }, [ja]);
  if (ja) return <p className="ja">{ja}</p>;
  const run = async () => {
    setErr(null);
    setBusy('翻訳中…');
    try {
      setOut(await translateToJa(en, (f) => setBusy(`翻訳データを準備中… ${Math.round(f * 100)}%（初回のみ）`)));
    } catch (e: any) {
      setErr('翻訳できませんでした：' + (e?.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  };
  if (out)
    return (
      <div>
        <p className="ja">
          {out} <span className="tag">自動翻訳・参考</span>
        </p>
        {onSaveJa && (
          <button className="btn sm" onClick={() => onSaveJa(out)}>
            この訳を教材に保存
          </button>
        )}
      </div>
    );
  if (st === null) return null;
  if (st === 'unsupported' || st === 'unavailable')
    return <p className="small muted">文の訳はまだ登録されていません。「教材」タブで書き込めます。（自動翻訳は、パソコンの Chrome・Edge で使えます）</p>;
  return (
    <div className="row wrap">
      <button className="btn sm" onClick={run} disabled={Boolean(busy)}>
        🌐 文を自動翻訳（この端末の中で処理）
      </button>
      {busy && <span className="small muted">{busy}</span>}
      {err && <span className="error small">{err}</span>}
    </div>
  );
}

/** 「意味」パネル：文の訳と、押した単語の意味 */
export function MeaningPanel({ en, ja, word, onSaveJa }: { en: string; ja: string; word: string | null; onSaveJa?: (ja: string) => void }) {
  return (
    <div className="meaning">
      <SentenceTranslation en={en} ja={ja} onSaveJa={onSaveJa} />
      {word ? <WordBox word={word} /> : <p className="small muted">英文の単語を押すと、その単語の意味が出ます。</p>}
    </div>
  );
}
