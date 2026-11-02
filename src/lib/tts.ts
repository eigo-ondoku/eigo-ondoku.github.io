// お手本の読み上げ：ブラウザ（OS）内蔵のアメリカ英語音声を使う。外部サービスは使わない。
import type { Settings } from './storage';

export class TtsError extends Error {}

export function enVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('en-us'));
}

/** 音声一覧は非同期に読み込まれるブラウザがあるため、少し待つ */
export function waitVoices(ms = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((res) => {
    if (!('speechSynthesis' in window)) return res([]);
    const v = enVoices();
    if (v.length) return res(v);
    const t = setTimeout(() => res(enVoices()), ms);
    window.speechSynthesis.addEventListener(
      'voiceschanged',
      () => {
        clearTimeout(t);
        res(enVoices());
      },
      { once: true },
    );
  });
}

function pickVoice(voices: SpeechSynthesisVoice[], name: string) {
  return (
    voices.find((v) => v.name === name) ??
    // 自然な音声を優先（Windows/Edge の Natural、Chrome の Google、Mac/iPhone の Samantha など）
    voices.find((v) => /natural|neural|enhanced|premium/i.test(v.name)) ??
    voices.find((v) => /google us english|samantha|aria|jenny|ava|allison/i.test(v.name)) ??
    voices[0]
  );
}

let keepAlive: number | undefined;
let settle: (() => void) | null = null;

export function stopSpeaking() {
  settle?.();
  settle = null;
  window.clearInterval(keepAlive);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export async function speak(text: string, slow: boolean, s: Settings): Promise<string> {
  if (!('speechSynthesis' in window)) throw new TtsError('このブラウザには読み上げ機能がありません。Chrome・Edge・Safari をお使いください。');
  stopSpeaking();
  // 音声一覧の取得前でも、ユーザー操作の直後に speak を呼ぶ必要がある（iPhone 対策）
  let voices = enVoices();
  if (!voices.length) {
    // 音声一覧がまだ読み込まれていない（iPhone の初回など）：待つと操作直後の扱いが切れるため、言語指定だけで読み上げる
    const all = window.speechSynthesis.getVoices();
    if (!all.length) return speakRaw(text, slow, s);
    voices = await waitVoices();
  }
  if (!voices.length)
    throw new TtsError('この端末にアメリカ英語（en-US）の音声が見つかりません。Windows は「設定 > 時刻と言語 > 音声認識/音声」、Mac・iPhone は「設定 > アクセシビリティ > 読み上げコンテンツ > 声」で英語（米国）の音声を追加してください。');
  const v = pickVoice(voices, s.browserVoice);
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v;
  u.lang = v.lang;
  u.rate = slow ? s.slowRate : 1;
  return new Promise((res, rej) => {
    let started = false;
    settle = () => res(v.name);
    const timer = setTimeout(() => {
      if (!started) {
        window.speechSynthesis.cancel();
        rej(new TtsError('読み上げが始まりませんでした。端末の音量・消音設定を確認して、もう一度押してください。'));
      }
    }, 5000);
    u.onstart = () => {
      started = true;
      // Chrome は長い読み上げが途中で止まることがあるため定期的に再開させる
      keepAlive = window.setInterval(() => {
        if (!window.speechSynthesis.speaking) return;
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }, 10000);
    };
    u.onend = () => {
      clearTimeout(timer);
      window.clearInterval(keepAlive);
      res(v.name);
    };
    u.onerror = (e) => {
      clearTimeout(timer);
      window.clearInterval(keepAlive);
      if (e.error === 'interrupted' || e.error === 'canceled') res(v.name);
      else rej(new TtsError('読み上げエラー：' + e.error));
    };
    window.speechSynthesis.speak(u);
  });
}

function speakRaw(text: string, slow: boolean, s: Settings): Promise<string> {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = slow ? s.slowRate : 1;
  return new Promise((res, rej) => {
    settle = () => res('端末の英語音声');
    u.onend = () => res('端末の英語音声');
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? res('端末の英語音声') : rej(new TtsError('読み上げエラー：' + e.error)));
    window.speechSynthesis.speak(u);
  });
}

export function playUrl(url: string): Promise<void> {
  stopSpeaking();
  const a = new Audio(url);
  return new Promise((res, rej) => {
    a.onended = () => res();
    a.onerror = () => rej(new TtsError('録音を再生できませんでした。'));
    a.play().catch((e) => rej(new TtsError('録音を再生できませんでした（' + (e?.message ?? e) + '）。')));
  });
}
