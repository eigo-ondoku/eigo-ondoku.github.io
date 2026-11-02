import { useApp } from '../ctx';
import { currentText, emptyData, exportJson, importJson, recordFor } from '../lib/storage';
import { PHONEME_TIPS, soundName } from '../lib/tips';
import { Progress } from '../components/common';
import { MouthDiagram, hasDiagram } from '../components/MouthDiagram';

export function RecordsView() {
  const { data, update, toast } = useApp();
  const t = currentText(data);
  const ss = t?.sentences ?? [];
  const passed = ss.filter((s) => recordFor(data, s).passed).length;
  const allS = data.texts.flatMap((x) => x.sentences);
  const allPassed = allS.filter((s) => recordFor(data, s).passed).length;
  const weak = Object.entries(data.weak)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  const download = () => {
    const b = new Blob([exportJson(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `ondoku-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const upload = async (f?: File) => {
    if (!f) return;
    try {
      const d = importJson(await f.text());
      update(() => d);
      toast('学習記録を読み込みました');
    } catch (e: any) {
      toast('読み込めませんでした：' + e.message);
    }
  };

  return (
    <section>
      <h2>学習記録</h2>
      <p className="small muted">
        全教材：{data.texts.length} 教材・{allPassed}/{allS.length} 文合格 ｜ マスター {data.texts.filter((x) => x.mastered).length} 教材
      </p>
      {t && (
        <div className="card">
          <h3>📖 {t.title}</h3>
          <Progress done={passed} total={ss.length} />
          <div className="scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>文</th>
                  <th>最高</th>
                  <th>最新</th>
                  <th>回数</th>
                  <th>合格</th>
                </tr>
              </thead>
              <tbody>
                {ss.map((s, i) => {
                  const r = recordFor(data, s);
                  return (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td className="en">{s.en}</td>
                      <td>{r.best ?? '—'}</td>
                      <td>{r.last ?? '—'}</td>
                      <td>{r.attempts}</td>
                      <td>{r.passed ? '⭐' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3>苦手な発音（全教材の集計）</h3>
        {weak.length === 0 ? (
          <p className="muted">採点を重ねると、AIがはっきり別の音と判断した音がここに集計されます（判定が微妙な箇所は含めません）。</p>
        ) : (
          <ul className="weak">
            {weak.map(([p, w], idx) => {
              const heard = Object.entries(w.heardAs).sort((a, b) => b[1] - a[1])[0];
              return (
                <li key={p}>
                  <b>{soundName(p)}</b> — {w.count}回{heard ? `（よく ${heard[0] === '（なし）' ? '抜けています' : `/${heard[0]}/ に聞こえています`}）` : ''}
                  <br />
                  <span className="small muted">例：{w.examples.join(', ')}</span>
                  {PHONEME_TIPS[p] && <p className="small">{PHONEME_TIPS[p]}</p>}
                  {hasDiagram(p) && (
                    <details className="mouth-wrap" open={idx === 0}>
                      <summary>👄 口の形と空気の通り道を見る</summary>
                      <MouthDiagram p={p} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>バックアップ</h3>
        <p className="small muted">記録と教材はこのブラウザに保存されています。ブラウザのデータを消すと失われるため、ときどき書き出してください。別の端末へ移すときにも使えます。</p>
        <div className="row wrap">
          <button className="btn" onClick={download}>
            ⬇ 書き出し
          </button>
          <label className="btn">
            ⬆ 読み込み
            <input type="file" accept="application/json" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          <button
            className="btn danger"
            onClick={() =>
              confirm('学習記録をリセットしますか？（教材は残ります）') &&
              update((d) => ({ ...emptyData(), texts: d.texts.map((x) => ({ ...x, current: 0, mastered: false, fullRuns: [] })), currentText: d.currentText, settings: d.settings }))
            }
          >
            記録をリセット
          </button>
        </div>
      </div>
    </section>
  );
}
