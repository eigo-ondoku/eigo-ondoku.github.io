// 画面側から発音判定AI（ワーカー）を使うための窓口
import type { Settings } from './storage';

export type ModelState = 'unknown' | 'none' | 'cached' | 'downloading' | 'initializing' | 'ready' | 'error';
export interface ModelInfo {
  state: ModelState;
  loaded?: number;
  total?: number;
  error?: string;
  threads?: number;
}

export interface RecogOutput {
  probs: Float32Array; // frames × V の事後確率
  frames: number;
  V: number;
  vocab: string[];
  frameSec: number;
  ms: number;
}

let worker: Worker | null = null;
let info: ModelInfo = { state: 'unknown' };
let vocab: string[] = [];
const listeners = new Set<(i: ModelInfo) => void>();
const pending = new Map<number, { res: (r: RecogOutput) => void; rej: (e: Error) => void }>();
let readyWaiters: { res: () => void; rej: (e: Error) => void }[] = [];
let nextId = 1;

function set(i: Partial<ModelInfo>) {
  info = { ...info, ...i };
  listeners.forEach((l) => l(info));
}
export const modelInfo = () => info;
export function onModel(l: (i: ModelInfo) => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function urls(s: Settings) {
  return { model: s.modelUrl, vocab: s.vocabUrl, preproc: s.preprocUrl };
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../worker/asr.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'status') set({ state: m.loaded ? 'ready' : m.cached ? 'cached' : 'none' });
    else if (m.type === 'progress') set({ state: 'downloading', loaded: m.loaded, total: m.total });
    else if (m.type === 'phase') set({ state: 'initializing' });
    else if (m.type === 'ready') {
      vocab = m.vocab;
      clearCrashFlag();
      set({ state: 'ready', error: undefined, threads: m.threads });
      readyWaiters.forEach((w) => w.res());
      readyWaiters = [];
    } else if (m.type === 'result') {
      clearCrashFlag();
      pending.get(m.id)?.res({ probs: m.probs, frames: m.frames, V: m.V, vocab, frameSec: m.frameSec, ms: m.ms });
      pending.delete(m.id);
    } else if (m.type === 'cleared') set({ state: 'none' });
    else if (m.type === 'error') {
      if (m.id != null && pending.has(m.id)) {
        clearCrashFlag();
        pending.get(m.id)!.rej(new Error(m.message));
        pending.delete(m.id);
      } else {
        clearCrashFlag();
        set({ state: 'error', error: m.message });
        readyWaiters.forEach((w) => w.rej(new Error(m.message)));
        readyWaiters = [];
      }
    }
  };
  worker.onerror = (e) => set({ state: 'error', error: 'AIモデルの実行環境を起動できませんでした：' + (e.message || 'ワーカーエラー') });
  return worker;
}

export function checkModel(s: Settings) {
  getWorker().postMessage({ type: 'status', urls: urls(s) });
}

/** iPhone / iPad（Safari 系）はメモリ制限が厳しい */
export const isAppleMobile = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// 読み込み中にタブが落ちたかを記録する（iPhone ではメモリ不足時にエラーなしで再読み込みされるため）
const CRASH_KEY = 'ondoku-model-loading';
export function crashedLastTime(): boolean {
  try {
    return localStorage.getItem(CRASH_KEY) != null;
  } catch {
    return false;
  }
}
export function clearCrashFlag() {
  try {
    localStorage.removeItem(CRASH_KEY);
  } catch {
    /* ignore */
  }
}

export function loadModel(s: Settings): Promise<void> {
  if (info.state === 'ready') return Promise.resolve();
  const p = new Promise<void>((res, rej) => readyWaiters.push({ res, rej }));
  if (info.state !== 'downloading' && info.state !== 'initializing') {
    set({ state: info.state === 'cached' ? 'initializing' : 'downloading', loaded: 0, total: 0, error: undefined });
    try {
      localStorage.setItem(CRASH_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    getWorker().postMessage({ type: 'load', urls: urls(s), wasmBase: '', lowMem: isAppleMobile() });
  }
  return p;
}

export function clearModel() {
  worker?.terminate();
  worker = null;
  info = { state: 'unknown' };
  caches.delete('ondoku-model-v1').finally(() => set({ state: 'none' }));
}

export function recognize(pcm: Int16Array): Promise<RecogOutput> {
  if (info.state !== 'ready') return Promise.reject(new Error('AIモデルが読み込まれていません'));
  try {
    localStorage.setItem(CRASH_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  const audio = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) audio[i] = pcm[i] / 32768;
  const id = nextId++;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    getWorker().postMessage({ type: 'run', id, audio }, [audio.buffer]);
  });
}

export const modelVocab = () => vocab;
