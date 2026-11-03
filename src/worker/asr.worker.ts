/// <reference lib="webworker" />
// 発音判定AIモデル（wav2vec2 音素認識・ONNX）をブラウザ内で動かすワーカー。
// 録音はこの端末の中だけで処理され、外部には送信されない。
import * as ort from 'onnxruntime-web/wasm';

declare const self: DedicatedWorkerGlobalScope;

const CACHE = 'ondoku-model-v1';
let session: ort.InferenceSession | null = null;
let vocab: string[] = [];
let doNormalize = true;
let inputName = 'input_values';
let hasMask = false;

type Msg =
  | { type: 'status'; urls: Urls }
  | { type: 'load'; urls: Urls; wasmBase: string; lowMem?: boolean }
  | { type: 'run'; id: number; audio: Float32Array }
  | { type: 'clear' };
interface Urls {
  model: string;
  vocab: string;
  preproc: string;
}

const post = (m: any, t?: Transferable[]) => self.postMessage(m, t ?? []);

async function cached(url: string): Promise<Response | undefined> {
  try {
    return await (await caches.open(CACHE)).match(url);
  } catch {
    return undefined;
  }
}

async function fetchBytes(url: string, label: string, big: boolean): Promise<ArrayBuffer> {
  const hit = await cached(url);
  if (hit) return hit.arrayBuffer();
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label}をダウンロードできませんでした（HTTP ${r.status}）`);
  if (!big || !r.body) {
    const buf = await r.arrayBuffer();
    try {
      await (await caches.open(CACHE)).put(url, new Response(buf.slice(0)));
    } catch {
      /* 保存できなくても今回は使える */
    }
    return buf;
  }
  // 大きなモデルは、メモリに全部ためずに端末の保存領域へ直接流し込む（iPhone のメモリ対策）
  const total = Number(r.headers.get('content-length') ?? 0);
  let got = 0;
  let lastPost = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      got += chunk.length;
      if (performance.now() - lastPost > 200) {
        lastPost = performance.now();
        post({ type: 'progress', loaded: got, total });
      }
      ctl.enqueue(chunk);
    },
  });
  try {
    const c = await caches.open(CACHE);
    await c.put(url, new Response(r.body.pipeThrough(counter), { headers: { 'content-type': 'application/octet-stream' } }));
    post({ type: 'progress', loaded: got, total: got });
    const saved = await c.match(url);
    if (saved) return saved.arrayBuffer();
  } catch {
    // 保存領域が使えない場合は、もう一度ダウンロードしてメモリで扱う
  }
  const again = await fetch(url);
  if (!again.ok) throw new Error(`${label}をダウンロードできませんでした（HTTP ${again.status}）`);
  return again.arrayBuffer();
}

let lowMem = false;
async function load(urls: Urls, _wasmBase: string, low: boolean) {
  lowMem = low;
  // 実行環境（.wasm）はビルド時にアプリ自身のファイルとして同梱される
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

  const v = JSON.parse(new TextDecoder().decode(await fetchBytes(urls.vocab, '音素の一覧', false))) as Record<string, number>;
  vocab = [];
  for (const [tok, id] of Object.entries(v)) vocab[id] = tok;
  try {
    const pc = JSON.parse(new TextDecoder().decode(await fetchBytes(urls.preproc, '前処理の設定', false)));
    doNormalize = pc.do_normalize !== false;
  } catch {
    doNormalize = true;
  }
  let model: ArrayBuffer | null = await fetchBytes(urls.model, 'AIモデル', true);
  post({ type: 'phase', phase: 'init' });
  // 省メモリ設定：作業用メモリの先取り（アリーナ・メモリパターン）を止め、最適化による重みの複製を抑える
  session = await ort.InferenceSession.create(new Uint8Array(model), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: lowMem ? 'basic' : 'all',
    enableCpuMemArena: !lowMem,
    enableMemPattern: !lowMem,
  });
  model = null; // 元のデータを手放す
  inputName = session.inputNames.includes('input_values') ? 'input_values' : session.inputNames[0];
  hasMask = session.inputNames.includes('attention_mask');
  post({ type: 'ready', vocab, threads: ort.env.wasm.numThreads });
}

/** 長い録音は、なるべく静かな位置で 18 秒以下に分割して処理する */
function chunks(a: Float32Array, rate = 16000): [number, number][] {
  const max = (lowMem ? 7 : 18) * rate;
  const out: [number, number][] = [];
  let s = 0;
  while (a.length - s > max) {
    const lo = s + (lowMem ? 4 : 12) * rate;
    const hi = s + max;
    let best = hi,
      bestE = Infinity;
    for (let i = lo; i + 320 < hi; i += 160) {
      let e = 0;
      for (let j = 0; j < 320; j++) e += a[i + j] * a[i + j];
      if (e < bestE) {
        bestE = e;
        best = i + 160;
      }
    }
    out.push([s, best]);
    s = best;
  }
  out.push([s, a.length]);
  return out;
}

async function run(audio: Float32Array, id?: number): Promise<{ probs: Float32Array; frames: number; V: number; frameSec: number }> {
  if (!session) throw new Error('AIモデルが読み込まれていません');
  const outs: Float32Array[] = [];
  let V = 0,
    frames = 0;
  const parts = chunks(audio);
  for (const [a, b] of parts) {
    let x = audio.slice(a, b);
    if (x.length < 1600) continue;
    if (doNormalize) {
      let m = 0;
      for (const v of x) m += v;
      m /= x.length;
      let s = 0;
      for (const v of x) s += (v - m) * (v - m);
      const sd = Math.sqrt(s / x.length + 1e-7);
      x = x.map((v) => (v - m) / sd);
    }
    const feeds: Record<string, ort.Tensor> = { [inputName]: new ort.Tensor('float32', x, [1, x.length]) };
    if (hasMask) feeds.attention_mask = new ort.Tensor('int64', BigInt64Array.from({ length: x.length }, () => 1n), [1, x.length]);
    const res = await session.run(feeds);
    const logits = res[session.outputNames[0]];
    const [, T, VV] = logits.dims as number[];
    V = VV;
    const d = logits.data as Float32Array;
    const p = new Float32Array(T * V);
    for (let t = 0; t < T; t++) {
      let mx = -Infinity;
      for (let k = 0; k < V; k++) mx = Math.max(mx, d[t * V + k]);
      let sum = 0;
      for (let k = 0; k < V; k++) sum += p[t * V + k] = Math.exp(d[t * V + k] - mx);
      for (let k = 0; k < V; k++) p[t * V + k] /= sum;
    }
    outs.push(p);
    frames += T;
    // 分割して処理したときは、実際に終わった割合を画面へ知らせる
    if (parts.length > 1) post({ type: 'runprog', id, done: b / audio.length });
  }
  const probs = new Float32Array(frames * V);
  let o = 0;
  for (const p of outs) {
    probs.set(p, o);
    o += p.length;
  }
  return { probs, frames, V, frameSec: frames ? audio.length / 16000 / frames : 0.02 };
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === 'status') {
      const ok = Boolean(await cached(m.urls.model));
      post({ type: 'status', cached: ok, loaded: Boolean(session) });
    } else if (m.type === 'load') {
      if (session) return post({ type: 'ready', vocab, threads: ort.env.wasm.numThreads });
      await load(m.urls, m.wasmBase, Boolean(m.lowMem));
    } else if (m.type === 'run') {
      const t0 = performance.now();
      const r = await run(m.audio, m.id);
      post({ type: 'result', id: m.id, ...r, ms: performance.now() - t0 }, [r.probs.buffer]);
    } else if (m.type === 'clear') {
      await caches.delete(CACHE);
      post({ type: 'cleared' });
    }
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    post({
      type: 'error',
      id: (m as any).id,
      message: /memory|allocation|Out of memory|RangeError/i.test(msg)
        ? 'メモリが足りずAIモデルを動かせませんでした。他のタブを閉じるか、パソコンでお試しください。（' + msg + '）'
        : msg,
    });
  }
};
