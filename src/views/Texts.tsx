import { useState } from 'react';
import { useApp } from '../ctx';
import { currentText, recordFor, splitSentences, uid, type Sentence, type TextDoc } from '../lib/storage';
import { ModelButtons } from '../components/common';
import { sampleTexts } from '../lib/samples';
import { lookup, splitWords } from '../lib/g2p';

export function TextsView({ goPractice }: { goPractice: () => void }) {
  const { data, update, toast, dictReady } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'sentence' | 'line'>('sentence');
  const [adding, setAdding] = useState(data.texts.length === 0);
  const [open, setOpen] = useState<string | null>(null);
  const cur = currentText(data);

  const add = () => {
    const ss = splitSentences(body, mode);
    if (!ss.length) return toast('英文が入力されていません');
    const t: TextDoc = {
      id: uid(),
      title: title.trim() || ss[0].slice(0, 30),
      sentences: ss.map((en) => ({ id: uid(), en, ja: '', notes: '' })),
      current: 0,
      createdAt: Date.now(),
      mastered: false,
      fullRuns: [],
    };
    update((d) => ({ ...d, texts: [...d.texts, t], currentText: t.id }));
    setTitle('');
    setBody('');
    setAdding(false);
    toast(`「${t.title}」を ${ss.length} 文で登録しました`);
  };

  const editS = (sid: string, patch: Partial<Sentence>) =>
    update((d) => {
      const t = d.texts.find((x) => x.id === cur?.id);
      const s = t?.sentences.find((x) => x.id === sid);
      if (s) Object.assign(s, patch);
      return d;
    });
  const moveS = (i: number, dir: -1 | 1) =>
    update((d) => {
      const t = d.texts.find((x) => x.id === cur?.id)!;
      const j = i + dir;
      if (j >= 0 && j < t.sentences.length) [t.sentences[i], t.sentences[j]] = [t.sentences[j], t.sentences[i]];
      return d;
    });
  const removeS = (sid: string) =>
    update((d) => {
      const t = d.texts.find((x) => x.id === cur?.id)!;
      t.sentences = t.sentences.filter((s) => s.id !== sid);
      t.current = Math.min(t.current, Math.max(0, t.sentences.length - 1));
      delete d.records[sid];
      return d;
    });
  const removeText = (id: string) =>
    update((d) => {
      const t = d.texts.find((x) => x.id === id);
      t?.sentences.forEach((s) => delete d.records[s.id]);
      const texts = d.texts.filter((x) => x.id !== id);
      return { ...d, texts, currentText: texts[0]?.id ?? null };
    });

  const missing = (en: string) => (dictReady ? splitWords(en).filter((w) => !lookup(w.norm).length).map((w) => w.raw) : []);

  return (
    <section>
      <h2>教材（音読したい英文）</h2>
      <p className="muted small">教科書・記事・スピーチ・歌詞など、読めるようになりたい英文を登録して練習できます。英文はこの端末のブラウザ内にだけ保存されます。市販の教材などは、ご自身の学習の範囲でお使いください。</p>

      {data.texts.length > 0 && (
        <div className="texts">
          {data.texts.map((t) => {
            const passed = t.sentences.filter((s) => recordFor(data, s).passed).length;
            return (
              <div key={t.id} className={'card textcard' + (t.id === cur?.id ? ' cur' : '')}>
                <div className="row between">
                  <button className="linklike" onClick={() => update((d) => ({ ...d, currentText: t.id }))}>
                    {t.mastered ? '🏅 ' : ''}
                    <b>{t.title}</b>
                  </button>
                  <span className="small muted">
                    {passed}/{t.sentences.length} 文合格
                  </span>
                </div>
                {t.id === cur?.id ? (
                  <div className="row">
                    <button className="btn sm primary" onClick={goPractice}>
                      練習する →
                    </button>
                    <button className="btn sm danger" onClick={() => confirm(`「${t.title}」と学習記録を削除しますか？`) && removeText(t.id)}>
                      削除
                    </button>
                  </div>
                ) : (
                  <button className="btn sm" onClick={() => update((d) => ({ ...d, currentText: t.id }))}>
                    この教材を選ぶ
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!adding ? (
        <div className="row wrap">
          <button className="btn" onClick={() => setAdding(true)}>
            ＋ 新しい教材を追加
          </button>
          {!data.texts.some((t) => t.title.startsWith('例）')) && (
            <button
              className="btn"
              onClick={() => {
                const ex = sampleTexts();
                update((d) => ({ ...d, texts: [...d.texts, ...ex] }));
                toast('教材の例を2つ追加しました');
              }}
            >
              ＋ 教材の例を追加
            </button>
          )}
        </div>
      ) : (
        <div className="card">
          <h3>新しい教材</h3>
          <label>
            タイトル
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例）教科書 Lesson 3" />
          </label>
          <label>
            英文
            <textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder={'例）\nThe library opens at nine. I usually study there after school.'} />
          </label>
          <div className="row">
            区切り方：
            <label className="check">
              <input type="radio" checked={mode === 'sentence'} onChange={() => setMode('sentence')} /> 文ごと（. ? ! で区切る）
            </label>
            <label className="check">
              <input type="radio" checked={mode === 'line'} onChange={() => setMode('line')} /> 改行ごと（歌詞・詩など）
            </label>
          </div>
          <div className="row">
            <button className="btn primary" onClick={add}>
              登録する
            </button>
            {data.texts.length > 0 && (
              <button className="btn" onClick={() => setAdding(false)}>
                やめる
              </button>
            )}
          </div>
        </div>
      )}

      {cur && (
        <>
          <h3 className="mt">「{cur.title}」の文</h3>
          <p className="muted small">日本語訳と、単語・表現のメモを書き込めます。英文を変更すると、その文の学習記録はリセットされます。</p>
          <ol className="plist">
            {cur.sentences.map((s, i) => {
              const miss = missing(s.en);
              return (
                <li key={s.id} className="card">
                  <div className="row between">
                    <span className="en">
                      {i + 1}. {s.en}
                    </span>
                    <div className="row tight">
                      <button className="btn sm" onClick={() => moveS(i, -1)} aria-label="上へ">
                        ↑
                      </button>
                      <button className="btn sm" onClick={() => moveS(i, 1)} aria-label="下へ">
                        ↓
                      </button>
                      <button className="btn sm" onClick={() => setOpen(open === s.id ? null : s.id)}>
                        {open === s.id ? '閉じる' : '編集'}
                      </button>
                    </div>
                  </div>
                  {s.ja && <p className="ja">{s.ja}</p>}
                  {s.notes && <p className="notes">📝 {s.notes}</p>}
                  {miss.length > 0 && <p className="small fail">辞書にない語（採点対象外）：{miss.join(', ')}</p>}
                  {open === s.id && (
                    <div className="editor">
                      <label>
                        英語
                        <input value={s.en} onChange={(e) => editS(s.id, { en: e.target.value })} />
                      </label>
                      <label>
                        日本語訳
                        <input value={s.ja} onChange={(e) => editS(s.id, { ja: e.target.value })} placeholder="自然な日本語訳" />
                      </label>
                      <label>
                        単語・表現のメモ
                        <textarea rows={2} value={s.notes} onChange={(e) => editS(s.id, { notes: e.target.value })} />
                      </label>
                      <ModelButtons text={s.en} />
                      <button className="btn sm danger" onClick={() => confirm('この文を削除しますか？') && removeS(s.id)}>
                        この文を削除
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
