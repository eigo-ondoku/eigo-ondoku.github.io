import { useEffect, useState } from 'react';
import { useApp } from '../ctx';
import { enVoices } from '../lib/tts';
import { clearModel, modelVocab } from '../lib/recognizer';
import { describeVocab } from '../lib/phonemes';
import { defaultSettings } from '../lib/storage';
import { ModelButtons, ModelPanel } from '../components/common';
import { PASS_SCORE } from '../lib/scoring';

export function SettingsView() {
  const { data, update, saveError, model } = useApp();
  const s = data.settings;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(enVoices());
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const f = () => setVoices(enVoices());
    window.speechSynthesis.addEventListener('voiceschanged', f);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', f);
  }, []);
  const set = (patch: Partial<typeof s>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  return (
    <section>
      <h2>設定</h2>
      {saveError && <p className="error">{saveError}</p>}

      <div className="card">
        <h3>発音判定AI</h3>
        <ModelPanel />
        <p className="small muted">
          wav2vec2 をもとに音素認識用に学習されたモデル（Apache-2.0、約355MB）を、この端末のブラウザ内で動かします。録音した音声は外部に送信されません。保存したモデルを削除すると空き容量が戻ります（次回はまたダウンロードが必要）。
        </p>
        <button className="btn sm danger" onClick={() => confirm('保存したAIモデルを削除しますか？') && clearModel()}>
          保存したAIモデルを削除
        </button>
        {model.state === 'ready' && (
          <details>
            <summary>AIが使う音の記号と、このアプリでの読み替え</summary>
            <p className="small muted">赤い記号は読み替えが未対応です（採点が正しく行われない可能性）。気になる場合はこの一覧を作者に伝えてください。</p>
            <div className="vocab">
              {describeVocab(modelVocab()).map((v, i) => (
                <span key={i} className={'ph ' + (v.known ? 'good' : 'bad')}>
                  {JSON.stringify(v.tok)}→{v.as}
                </span>
              ))}
            </div>
          </details>
        )}
        <details>
          <summary>上級者向け：モデルの取得先</summary>
          <label>
            モデル（ONNX）
            <input value={s.modelUrl} onChange={(e) => set({ modelUrl: e.target.value })} />
          </label>
          <label>
            音素の一覧（vocab.json）
            <input value={s.vocabUrl} onChange={(e) => set({ vocabUrl: e.target.value })} />
          </label>
          <label>
            前処理の設定（preprocessor_config.json）
            <input value={s.preprocUrl} onChange={(e) => set({ preprocUrl: e.target.value })} />
          </label>
          <button className="btn sm" onClick={() => set({ modelUrl: defaultSettings.modelUrl, vocabUrl: defaultSettings.vocabUrl, preprocUrl: defaultSettings.preprocUrl })}>
            初期値に戻す
          </button>
        </details>
      </div>

      <div className="card">
        <h3>お手本の音声</h3>
        <p className="small muted">この端末に入っているアメリカ英語の音声で読み上げます（外部サービスは使いません）。</p>
        <label>
          声
          <select value={s.browserVoice} onChange={(e) => set({ browserVoice: e.target.value })}>
            <option value="">自動選択</option>
            {voices.map((v) => (
              <option key={v.name}>{v.name}</option>
            ))}
          </select>
        </label>
        {voices.length === 0 && (
          <p className="small fail">
            アメリカ英語（en-US）の音声が見つかりません。Windows は「設定 → 時刻と言語 → 音声」、Mac・iPhone は「設定 → アクセシビリティ → 読み上げコンテンツ → 声」から英語（米国）の音声を追加してください。
          </p>
        )}
        <label>
          ゆっくり再生の速さ：{Math.round(s.slowRate * 100)}%
          <input type="range" min={0.5} max={0.9} step={0.05} value={s.slowRate} onChange={(e) => set({ slowRate: +e.target.value })} />
        </label>
        <ModelButtons text="This is a test of the model voice." showWords={false} />
      </div>

      <div className="card">
        <h3>文字の書体</h3>
        <label>
          書体
          <select value={s.font} onChange={(e) => set({ font: e.target.value as typeof s.font })}>
            <option value="ud-gothic">BIZ UDPゴシック（標準・どの端末でも同じ）</option>
            <option value="ud-kyokasho">UDデジタル教科書体（Windowsのみ）</option>
            <option value="system">端末の標準書体</option>
          </select>
        </label>
        <p className="small muted">
          UDデジタル教科書体は Windows 10/11 に入っている書体です。Mac・iPhone には入っていないため、選んでも BIZ UDPゴシックで表示されます。
        </p>
        <p className="font-sample">
          あ・ア・文字 <span>The quick brown fox jumps over a lazy dog. agqy 1lI</span>
        </p>
      </div>

      <div className="card">
        <h3>採点のしくみ</h3>
        <table className="table">
          <thead>
            <tr>
              <th>項目</th>
              <th>このアプリでの扱い</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>個々の音の正確さ</td>
              <td>
                <b>点数あり（100点満点）。</b>
                AIが録音から聞き取った音を、発音辞書（CMU Pronouncing Dictionary）の正しい発音と1音ずつ照合します。点数＝正しく発音できた音 ÷（正しい発音の音の数＋余分に入った音）。
              </td>
            </tr>
            <tr>
              <td>アクセント・強弱／リズム／イントネーション</td>
              <td>
                <b>点数なし。</b>このAIは音の種類だけを聞き分けるもので、強弱や抑揚を評価する根拠がないためです。参考として「声の高さの幅」と「文の途中の長い間」の数値だけを表示します。
              </td>
            </tr>
          </tbody>
        </table>
        <ul className="small">
          <li>合格：音の正確さ {PASS_SCORE}点以上、かつ読み飛ばした語がないこと。</li>
          <li>同じ計算で毎回採点します。挑戦回数による加点はありません。</li>
          <li>ネイティブでも普通に起こるゆれ（弱く読む母音のあいまい化、water の t が軽い「ラ」になる弾き音など）は正解として扱います。</li>
          <li>AIが別の音と判断しても、正しい音の可能性が残っている箇所は「判定が微妙」と表示し、苦手な発音の集計には入れません。</li>
          <li>辞書にない語（固有名詞・数字など）は採点対象外です。</li>
          <li>
            このAIはアメリカ英語の読み上げ音声（TIMIT）で学習されています。精度には限界があり、雑音・小さな声・速すぎる読み方では誤判定が増えます。静かな場所で、マイクに近づいて読むと安定します。
          </li>
        </ul>
      </div>
    </section>
  );
}
