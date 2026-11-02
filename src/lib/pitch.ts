// 歌唱の音程推移を推定する（自己相関法）。発音評価とは完全に別扱いで、点数には含めない。
// お手本メロディーのデータがアプリに無いため、「正しい音程との一致度」は採点しない。

export function pitchTrack(pcm: Int16Array, rate = 16000, hopMs = 40): (number | null)[] {
  const win = Math.floor(rate * 0.05);
  const hop = Math.floor((rate * hopMs) / 1000);
  const minLag = Math.floor(rate / 1000);
  const maxLag = Math.floor(rate / 70);
  const out: (number | null)[] = [];
  const buf = new Float32Array(win);
  for (let start = 0; start + win + maxLag < pcm.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < win; i++) {
      buf[i] = pcm[start + i] / 32768;
      energy += buf[i] * buf[i];
    }
    if (Math.sqrt(energy / win) < 0.02) {
      out.push(null);
      continue;
    }
    let best = 0,
      bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0,
        n1 = 0,
        n2 = 0;
      for (let i = 0; i < win; i++) {
        const a = buf[i],
          b = pcm[start + i + lag] / 32768;
        s += a * b;
        n1 += a * a;
        n2 += b * b;
      }
      const c = s / Math.sqrt(n1 * n2 + 1e-9);
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    out.push(best > 0.75 ? rate / bestLag : null);
  }
  return out;
}

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
export const midiName = (m: number) => NOTE[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
