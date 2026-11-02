// マイク録音 → 16kHz / 16bit / モノラル PCM（Azure の推奨形式）と再生用 WAV を作る。

export interface Recording {
  pcm: Int16Array; // 16kHz mono
  wav: Blob;
  url: string;
  seconds: number;
  peak: number; // 0〜1 音量の最大値（無音検出用）
}

export class Recorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  private rate = 48000;
  onLevel?: (v: number) => void;
  maxSeconds = 360;
  private startedAt = 0;
  onMaxReached?: () => void;

  static supported(): boolean {
    return Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && (window.AudioContext || (window as any).webkitAudioContext));
  }

  async start(): Promise<void> {
    if (!Recorder.supported()) throw new Error('このブラウザは録音に対応していません。最新のChrome / Safari / Edgeをお使いください。');
    // Safari は「ボタンを押した直後」に作った AudioContext でないと音を受け取れないことがあるため、先に作る
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    const resumed = this.ctx.resume().catch(() => {});
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e: any) {
      await this.ctx.close().catch(() => {});
      this.ctx = null;
      if (e?.name === 'NotAllowedError') throw new Error('マイクの使用が許可されていません。iPhone は「設定 → Safari → マイク」、パソコンはアドレスバー左のアイコンから許可してください。');
      if (e?.name === 'NotFoundError') throw new Error('マイクが見つかりません。接続を確認してください。');
      throw new Error('マイクを開始できませんでした: ' + (e?.message ?? e));
    }
    await resumed;
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    this.rate = this.ctx.sampleRate;
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.startedAt = performance.now();
    this.node.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(d));
      if (this.onLevel) {
        let m = 0;
        for (let i = 0; i < d.length; i += 16) m = Math.max(m, Math.abs(d[i]));
        this.onLevel(m);
      }
      if ((performance.now() - this.startedAt) / 1000 > this.maxSeconds) this.onMaxReached?.();
    };
    this.src.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  get recording(): boolean {
    return this.ctx !== null;
  }

  async stop(): Promise<Recording> {
    this.node?.disconnect();
    this.src?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) {
      all.set(c, o);
      o += c.length;
    }
    this.chunks = [];
    const pcm = downsampleTo16k(all, this.rate);
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]) / 32768);
    const wav = encodeWav(pcm, 16000);
    return { pcm, wav, url: URL.createObjectURL(wav), seconds: pcm.length / 16000, peak };
  }

  cancel() {
    this.stop().then((r) => URL.revokeObjectURL(r.url)).catch(() => {});
  }
}

function downsampleTo16k(input: Float32Array, rate: number): Int16Array {
  const ratio = rate / 16000;
  const len = Math.floor(input.length / ratio);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    // 区間平均（簡易ローパス）
    const s = Math.floor(i * ratio);
    const e = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = s; j < e; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, e - s)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

export function encodeWav(pcm: Int16Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}
