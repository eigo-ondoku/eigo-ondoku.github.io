// 発音のしかたの図（このアプリ独自のイラスト）
//  左：横から見た口の中の断面（舌・歯・唇・上あご・鼻への通り道・空気の流れ・声の有無）
//  右：正面から見た唇の形
// 音ごとの舌の位置などは下の PHON 表のパラメータから描く。

type Pt = [number, number];
type Manner = 'vowel' | 'stop' | 'fric' | 'affr' | 'nasal' | 'lateral' | 'approx';
type Front = 'spread' | 'neutral' | 'round' | 'tight' | 'closed' | 'labiodental' | 'tongue' | 'teeth';

interface Spec {
  T: Pt; // 舌先
  B: Pt; // 舌の前の方
  D: Pt; // 舌の一番高いところ
  K: Pt; // 舌の奥
  jaw: number; // あごの開き（px）
  gap: number; // 唇の開き（px）
  pro: number; // 唇の突き出し（px）
  front: Front;
  manner: Manner;
  voice: boolean;
  velumDown?: boolean; // 鼻へ空気を通す
  contact?: Pt; // 触れる・近づく場所
  air: string; // 空気の説明
  mouth: string; // 口・唇の説明
  tongue: string; // 舌の説明
}

const REST = { T: [68, 128] as Pt, B: [82, 122] as Pt, D: [112, 117] as Pt, K: [148, 126] as Pt };
const v = (o: Partial<Spec> & Pick<Spec, 'air' | 'mouth' | 'tongue'>): Spec => ({
  ...REST,
  jaw: 4,
  gap: 8,
  pro: 0,
  front: 'neutral',
  manner: 'vowel',
  voice: true,
  ...o,
});

export const PHON: Record<string, Spec> = {
  // ---- 子音 ----
  θ: v({ T: [55, 119], B: [70, 118], D: [106, 119], jaw: 2, gap: 6, front: 'tongue', manner: 'fric', voice: false, contact: [57, 117], air: '舌と上の歯のすき間から息をこすらせる', mouth: '少し開けて、舌先を見せる', tongue: '舌先を上下の前歯で軽くはさむ' }),
  ð: v({ T: [55, 119], B: [70, 118], D: [106, 119], jaw: 2, gap: 6, front: 'tongue', manner: 'fric', voice: true, contact: [57, 117], air: '舌と歯のすき間から、声を出しながら', mouth: '少し開けて、舌先を見せる', tongue: '舌先を上下の前歯で軽くはさむ' }),
  s: v({ T: [70, 112], B: [84, 109], D: [112, 113], jaw: 1, gap: 4, front: 'teeth', manner: 'fric', voice: false, contact: [71, 108], air: '歯ぐきと舌先の細いすき間から息', mouth: '歯を軽く合わせて横に引く', tongue: '舌先を上の歯ぐきに近づける（付けない）' }),
  z: v({ T: [70, 112], B: [84, 109], D: [112, 113], jaw: 1, gap: 4, front: 'teeth', manner: 'fric', voice: true, contact: [71, 108], air: '細いすき間から、声を出しながら', mouth: '歯を軽く合わせて横に引く', tongue: '舌先を上の歯ぐきに近づける（付けない）' }),
  ʃ: v({ T: [76, 111], B: [90, 105], D: [116, 110], jaw: 2, gap: 7, pro: 6, front: 'round', manner: 'fric', voice: false, contact: [80, 104], air: '舌と上あごの広めのすき間から息', mouth: '唇を丸めて前に突き出す', tongue: '舌全体を上あごに近づける' }),
  tʃ: v({ T: [74, 106], B: [88, 103], D: [116, 110], jaw: 2, gap: 7, pro: 6, front: 'round', manner: 'affr', voice: false, contact: [75, 105], air: 'いったん止めて、こすらせながら出す', mouth: '唇を丸めて前に突き出す', tongue: '舌先を歯ぐきのすぐ後ろに付けてから離す' }),
  dʒ: v({ T: [74, 106], B: [88, 103], D: [116, 110], jaw: 2, gap: 7, pro: 6, front: 'round', manner: 'affr', voice: true, contact: [75, 105], air: 'いったん止めて、声を出しながら離す', mouth: '唇を丸めて前に突き出す', tongue: '舌先を歯ぐきのすぐ後ろに付けてから離す' }),
  t: v({ T: [72, 107], B: [86, 112], D: [114, 117], jaw: 2, gap: 6, front: 'neutral', manner: 'stop', voice: false, contact: [72, 106], air: '止めた息を一気に離す（母音を足さない）', mouth: '軽く開ける', tongue: '舌先を上の歯ぐきにしっかり付ける' }),
  d: v({ T: [72, 107], B: [86, 112], D: [114, 117], jaw: 2, gap: 6, front: 'neutral', manner: 'stop', voice: true, contact: [72, 106], air: '声を出しながら一気に離す（「ド」にしない）', mouth: '軽く開ける', tongue: '舌先を上の歯ぐきにしっかり付ける' }),
  n: v({ T: [72, 107], B: [86, 112], D: [114, 117], jaw: 2, gap: 6, front: 'neutral', manner: 'nasal', voice: true, velumDown: true, contact: [72, 106], air: '口は閉じたまま、鼻から声を出す', mouth: '軽く開ける', tongue: '舌先を上の歯ぐきに付けたまま' }),
  l: v({ T: [72, 106], B: [86, 113], D: [114, 120], K: [146, 122], jaw: 3, gap: 8, front: 'neutral', manner: 'lateral', voice: true, contact: [72, 106], air: '舌の両脇から声を流す', mouth: '軽く開ける', tongue: '舌先を上の歯ぐきに付けたまま（弾かない）' }),
  ɹ: v({ T: [86, 106], B: [82, 116], D: [116, 114], K: [150, 118], jaw: 3, gap: 8, pro: 4, front: 'round', manner: 'approx', voice: true, contact: [88, 102], air: '舌と上あごの間から声を流す', mouth: '唇を少し丸める', tongue: '舌先を少し奥へ引いて持ち上げる。どこにも触れない' }),
  f: v({ jaw: 1, gap: 0, front: 'labiodental', manner: 'fric', voice: false, contact: [60, 117], air: '上の歯と下唇のすき間から息', mouth: '上の前歯を下唇に軽く当てる', tongue: '力を抜いて下に置いたまま' }),
  v: v({ jaw: 1, gap: 0, front: 'labiodental', manner: 'fric', voice: true, contact: [60, 117], air: '歯と下唇のすき間から、声を出しながら', mouth: '上の前歯を下唇に軽く当てる', tongue: '力を抜いて下に置いたまま' }),
  b: v({ jaw: 1, gap: 0, front: 'closed', manner: 'stop', voice: true, contact: [42, 114], air: '唇で止めて、声と一緒に一気に開く', mouth: '両唇をしっかり閉じる', tongue: '力を抜いて下に置いたまま' }),
  p: v({ jaw: 1, gap: 0, front: 'closed', manner: 'stop', voice: false, contact: [42, 114], air: '唇で止めた息を一気に開く', mouth: '両唇をしっかり閉じる', tongue: '力を抜いて下に置いたまま' }),
  m: v({ jaw: 1, gap: 0, front: 'closed', manner: 'nasal', voice: true, velumDown: true, contact: [42, 114], air: '唇を閉じたまま、鼻から声を出す', mouth: '両唇を閉じる', tongue: '力を抜いて下に置いたまま' }),
  w: v({ D: [140, 106], K: [154, 116], jaw: 2, gap: 5, pro: 8, front: 'tight', manner: 'approx', voice: true, contact: [36, 114], air: '小さく丸めた唇から声を出し、すぐ次の母音へ', mouth: '唇を小さく丸めて強く突き出す', tongue: '舌の奥を持ち上げる' }),
  j: v({ T: [66, 126], B: [80, 112], D: [98, 104], jaw: 2, gap: 6, front: 'spread', manner: 'approx', voice: true, contact: [98, 98], air: '舌と上あごの間から声を流し、すぐ次の母音へ', mouth: '横に軽く引く', tongue: '舌の前の方を上あごに近づける（「イ」の形）' }),
  h: v({ jaw: 6, gap: 12, front: 'neutral', manner: 'fric', voice: false, air: 'のどから息だけを出す', mouth: '次の母音の口の形のまま', tongue: '力を抜く（唇も使わない）' }),
  k: v({ T: [66, 128], D: [146, 100], K: [156, 116], jaw: 3, gap: 8, front: 'neutral', manner: 'stop', voice: false, contact: [146, 98], air: '舌の奥で止めた息を一気に離す', mouth: '軽く開ける', tongue: '舌の奥を上あごの奥に付ける' }),
  g: v({ T: [66, 128], D: [146, 100], K: [156, 116], jaw: 3, gap: 8, front: 'neutral', manner: 'stop', voice: true, contact: [146, 98], air: '声を出しながら舌の奥を離す', mouth: '軽く開ける', tongue: '舌の奥を上あごの奥に付ける' }),
  ŋ: v({ T: [66, 128], D: [146, 100], K: [156, 116], jaw: 3, gap: 8, front: 'neutral', manner: 'nasal', voice: true, velumDown: true, contact: [146, 98], air: '舌の奥でふさいだまま、鼻から声（「グ」を付けない）', mouth: '軽く開ける', tongue: '舌の奥を上あごの奥に付けたまま' }),
  // ---- 母音 ----
  i: v({ T: [64, 124], B: [78, 111], D: [98, 103], K: [140, 122], jaw: 1, gap: 5, front: 'spread', air: '口から声', mouth: '口を横に引く', tongue: '舌の前の方を高く上げる（「イー」）' }),
  ɪ: v({ T: [65, 125], B: [80, 114], D: [104, 108], jaw: 3, gap: 8, front: 'spread', air: '口から声（短く、力を抜く）', mouth: '軽く横に引く（「イ」と「エ」の間）', tongue: '「イー」より少し低く、力を抜く' }),
  eɪ: v({ T: [65, 126], B: [80, 116], D: [104, 112], jaw: 5, gap: 10, front: 'spread', air: '口から声。「エ」から「イ」へ動かす', mouth: '軽く横に引く', tongue: '「エ」の位置から「イ」の位置へ上げる' }),
  ɛ: v({ T: [65, 127], B: [80, 118], D: [106, 115], jaw: 7, gap: 13, front: 'spread', air: '口から声', mouth: '日本語の「エ」より少し大きく開ける', tongue: '舌の前の方を中くらいの高さに' }),
  æ: v({ T: [64, 133], B: [80, 127], D: [108, 124], K: [146, 130], jaw: 12, gap: 22, front: 'spread', air: '口から声', mouth: '縦にも横にも大きく開ける（「エ」の口で「ア」）', tongue: '舌の前の方を低く平らに' }),
  ʌ: v({ D: [122, 118], jaw: 6, gap: 11, front: 'neutral', air: '口から声（短く弱く）', mouth: 'あまり開けず、力を抜く', tongue: '舌の真ん中あたりを少し上げる（力を抜く）' }),
  ɑ: v({ T: [66, 135], B: [84, 130], D: [136, 126], K: [156, 130], jaw: 14, gap: 24, front: 'neutral', air: '口から声', mouth: '縦に大きく開ける（あくびの口）', tongue: '舌全体を低く、奥へ引く' }),
  ɝ: v({ T: [86, 108], B: [82, 117], D: [116, 115], K: [150, 118], jaw: 4, gap: 9, pro: 3, front: 'round', air: '口から声。舌を丸めたまま「アー」', mouth: '少し開けて、唇を軽く丸める', tongue: '舌先を少し持ち上げて奥へ引く（どこにも触れない）' }),
  ʊ: v({ D: [136, 110], K: [152, 120], jaw: 4, gap: 9, pro: 3, front: 'round', air: '口から声（短く、ゆるく）', mouth: '唇を軽く丸める', tongue: '舌の奥を少し上げる（力を抜く）' }),
  u: v({ D: [140, 104], K: [154, 116], jaw: 2, gap: 6, pro: 7, front: 'tight', air: '口から声（長めに）', mouth: '唇を丸めて前に突き出す', tongue: '舌の奥を高く上げる' }),
  oʊ: v({ D: [138, 113], K: [154, 122], jaw: 6, gap: 11, pro: 5, front: 'round', air: '口から声。「オ」から「ウ」へ唇をすぼめる', mouth: '丸めた唇を、さらにすぼめる', tongue: '舌の奥を中くらいから高めへ' }),
  aɪ: v({ T: [66, 135], B: [84, 130], D: [128, 126], jaw: 13, gap: 22, front: 'neutral', air: '口から声。「ア」を強く、「イ」へ移る', mouth: '大きく開けてから、横に引きながら閉じる', tongue: '低い位置から、前の方へ上げる' }),
  aʊ: v({ T: [66, 135], B: [84, 130], D: [128, 126], jaw: 13, gap: 22, front: 'neutral', air: '口から声。「ア」を強く、「ウ」へ移る', mouth: '大きく開けてから、唇を丸める', tongue: '低い位置から、奥の方へ上げる' }),
  ɔɪ: v({ D: [138, 116], K: [154, 124], jaw: 7, gap: 12, pro: 4, front: 'round', air: '口から声。「オ」を強く、「イ」へ移る', mouth: '丸めた唇から、横に引く', tongue: '奥から、前の方へ上げる' }),
};
PHON['ɾ'] = { ...PHON.d, manner: 'stop', air: '舌先で一度だけ軽く弾く', tongue: '舌先で歯ぐきを素早くたたく' };

// Catmull-Rom → 3次ベジェで滑らかな曲線にする
function smooth(pts: Pt[]): string {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const C = {
  skin: '#f4d6c3',
  skinLine: '#c99a82',
  air: '#ffffff',
  tongue: '#e8837d',
  tongueLine: '#b4534c',
  tooth: '#fffdf6',
  toothLine: '#a9a39a',
  lip: '#d9786f',
  flow: '#2f7fd1',
  voice: '#d0453a',
  contact: '#1f2a24',
};

function SideView({ s }: { s: Spec }) {
  const jaw = s.jaw;
  const ulb = 113; // 上唇の下端
  const llt = s.front === 'labiodental' ? 114 : ulb + s.gap; // 下唇の上端
  const p = s.pro;
  const ld = s.front === 'labiodental' ? 10 : 0; // 下唇を内側へ
  const lowerStart: Pt = [s.T[0] + 4, s.T[1] + 7];
  const lower = smooth([lowerStart, [84, 146 + jaw * 0.6], [118, 166 + jaw * 0.4], [150, 197]]).replace(/^M/, 'L');
  const tongue = smooth([[158, 197], [163, 168], s.K, s.D, s.B, s.T]) + ' ' + lower + ' Z';
  const mouthY = (ulb + llt) / 2;
  // 空気の流れ
  const oral = smooth([[167, 192], [166, 140], [150, 112], [s.D[0], s.D[1] - 8], [s.B[0], s.B[1] - 7], [Math.min(s.T[0] - 6, 56), Math.min(s.T[1] - 4, mouthY)], [20 - p, mouthY]]);
  const nasal = smooth([[167, 192], [167, 120], [168, 92], [130, 84], [70, 86], [26, 91]]);
  const stopAt = s.manner === 'stop' || s.manner === 'affr';
  const showOral = s.manner !== 'nasal';
  return (
    <svg viewBox="16 62 168 146" className="mouth-side" role="img" aria-label="横から見た口の中">
      {/* 顔 */}
      <path d={`M 72 0 C 58 20 52 40 50 56 L 22 80 C 19 86 25 91 35 90 C 40 92 44 95 47 98 L 52 ${130 + jaw} C 46 ${146 + jaw} 44 ${160 + jaw} 52 ${172 + jaw} C 64 ${184 + jaw} 92 ${188} 112 210 L 220 210 L 220 0 Z`} fill={C.skin} stroke={C.skinLine} strokeWidth="1.2" />
      {/* 鼻の通り道 */}
      <path d="M 30 90 C 50 84 90 77 140 77 L 168 79 L 177 84 L 177 100 L 166 98 C 150 90 120 89 90 90 C 70 91 52 93 36 94 Z" fill={C.air} />
      {/* 口とのどの空間 */}
      <path d={`M ${30 - p} ${ulb} L 60 ${ulb} L 66 106 C 74 101 86 95 110 93 C 128 92 140 93 150 96 L 166 100 L 177 100 L 177 205 L 150 205 L 118 ${168 + jaw * 0.4} L 70 ${150 + jaw} L ${30 - p} ${llt + jaw}`} fill={C.air} />
      {/* 上あごの線 */}
      <path d="M 60 112 C 64 104 70 102 74 103 C 82 99 96 94 112 93 C 128 92 140 93 148 96" fill="none" stroke={C.skinLine} strokeWidth="1.6" />
      {/* やわらかい上あご（のどちんこ） */}
      <path d={s.velumDown ? 'M 146 95 C 152 98 156 106 154 116 C 151 118 148 114 147 108 C 146 103 144 99 142 97 Z' : 'M 146 95 C 154 95 164 94 170 92 C 172 96 168 100 162 101 C 156 102 150 100 142 98 Z'} fill={C.skin} stroke={C.skinLine} strokeWidth="1.2" />
      {/* のどの後ろの壁 */}
      <path d="M 177 78 L 177 205" stroke={C.skinLine} strokeWidth="1.6" />
      {/* 舌 */}
      <path d={tongue} fill={C.tongue} stroke={C.tongueLine} strokeWidth="1.3" />
      {/* 歯 */}
      <path d="M 58 99 L 66 99 L 64 111 L 61 118 L 58 118 L 57 108 Z" fill={C.tooth} stroke={C.toothLine} strokeWidth="1.1" />
      <path d={`M 59 ${121 + jaw} L 63 ${121 + jaw} L 66 ${131 + jaw} L 67 ${141 + jaw} L 59 ${141 + jaw} L 58 ${130 + jaw} Z`} fill={C.tooth} stroke={C.toothLine} strokeWidth="1.1" />
      {/* 唇 */}
      <path d={`M 48 95 C ${36 - p} 97 ${31 - p} 104 ${32 - p} 109 C ${33 - p} ${ulb} ${42 - p} ${ulb + 1} 57 ${ulb} L 59 ${ulb - 3} L 57 98 Z`} fill={C.lip} stroke={C.tongueLine} strokeWidth="1.2" />
      <path d={`M ${58 - ld} ${llt + jaw * 0.3} C ${42 - p + ld} ${llt + jaw * 0.3} ${31 - p + ld} ${llt + 5 + jaw * 0.6} ${33 - p + ld} ${llt + 11 + jaw} C ${35 - p + ld} ${llt + 18 + jaw} 48 ${llt + 20 + jaw} 55 ${llt + 18 + jaw} L ${60 - ld * 0.2} ${llt + 6 + jaw * 0.6} Z`} fill={C.lip} stroke={C.tongueLine} strokeWidth="1.2" />
      {/* のど（声） */}
      <g transform="translate(150 199)">
        {s.voice ? <path d="M 0 0 q 3 -7 6 0 t 6 0 t 6 0 t 6 0" fill="none" stroke={C.voice} strokeWidth="2.4" /> : <path d="M 0 0 L 24 0" stroke={C.flow} strokeWidth="2" strokeDasharray="2 3" />}
        <text x="-30" y="4" fontSize="9" fill={s.voice ? C.voice : C.flow} fontWeight="700">{s.voice ? '声' : '息'}</text>
      </g>
      {/* 空気の流れ */}
      {showOral && <path d={oral} fill="none" stroke={C.flow} strokeWidth="2.4" strokeDasharray={stopAt ? '5 3' : undefined} markerEnd="url(#arr)" opacity="0.9" />}
      {s.velumDown && <path d={nasal} fill="none" stroke={C.flow} strokeWidth="2.4" markerEnd="url(#arr)" opacity="0.9" />}
      {/* 触れる・近づく場所 */}
      {s.contact && <circle cx={s.contact[0]} cy={s.contact[1]} r="4" fill="none" stroke={C.contact} strokeWidth="2" />}
      {(s.manner === 'fric' || s.manner === 'affr') && s.contact && (
        <g stroke={C.flow} strokeWidth="1.3">
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M ${s.contact![0] - 8 - i * 4} ${s.contact![1] + 7 - i * 2} q -3 -2 -6 0`} fill="none" />
          ))}
        </g>
      )}
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C.flow} />
        </marker>
      </defs>
    </svg>
  );
}

function FrontView({ s }: { s: Spec }) {
  const f = s.front;
  const W = f === 'spread' ? 66 : f === 'teeth' ? 62 : f === 'neutral' ? 54 : f === 'round' ? 38 : f === 'tight' ? 28 : 56;
  const H = f === 'closed' || f === 'labiodental' ? 0 : Math.max(4, s.gap + s.jaw * 0.8);
  const cx = 60,
    cy = 48;
  const outerH = H + (f === 'round' || f === 'tight' ? 16 : 12);
  return (
    <svg viewBox="14 18 92 62" className="mouth-front" role="img" aria-label="正面から見た唇">
      <ellipse cx="60" cy="40" rx="56" ry="56" fill={C.skin} stroke={C.skinLine} />
      {/* 唇（外側） */}
      <ellipse cx={cx} cy={cy} rx={W / 2 + 6} ry={outerH / 2 + 4} fill={C.lip} stroke={C.tongueLine} />
      {f === 'closed' && <path d={`M ${cx - W / 2} ${cy} Q ${cx} ${cy + 2} ${cx + W / 2} ${cy}`} stroke={C.tongueLine} strokeWidth="1.6" fill="none" />}
      {f === 'labiodental' && (
        <>
          <rect x={cx - 12} y={cy - 6} width="24" height="7" rx="2" fill={C.tooth} stroke={C.toothLine} />
          <path d={`M ${cx - W / 2} ${cy - 5} Q ${cx} ${cy - 9} ${cx + W / 2} ${cy - 5}`} stroke={C.tongueLine} strokeWidth="1.4" fill="none" />
        </>
      )}
      {H > 0 && (
        <>
          <ellipse cx={cx} cy={cy} rx={W / 2} ry={H / 2} fill="#5b2323" />
          <clipPath id={`m${f}${H}`}>
            <ellipse cx={cx} cy={cy} rx={W / 2} ry={H / 2} />
          </clipPath>
          <g clipPath={`url(#m${f}${H})`}>
            <rect x={cx - 16} y={cy - H / 2 - 1} width="32" height={f === 'teeth' ? H / 2 + 1 : Math.min(6, H / 2)} fill={C.tooth} stroke={C.toothLine} strokeWidth="0.6" />
            {f === 'teeth' && <rect x={cx - 15} y={cy} width="30" height={H / 2 + 1} fill={C.tooth} stroke={C.toothLine} strokeWidth="0.6" />}
            {f === 'tongue' && <ellipse cx={cx} cy={cy + 1} rx="11" ry="4" fill={C.tongue} stroke={C.tongueLine} strokeWidth="0.8" />}
            {f !== 'tongue' && f !== 'teeth' && H > 10 && <ellipse cx={cx} cy={cy + H / 2 + 2} rx={W / 3} ry={H / 3} fill={C.tongue} />}
          </g>
        </>
      )}
    </svg>
  );
}

export function hasDiagram(p: string) {
  return Boolean(PHON[p]);
}

export function MouthDiagram({ p }: { p: string }) {
  const s = PHON[p];
  if (!s) return null;
  return (
    <div className="mouth">
      <div className="mouth-pics">
        <SideView s={s} />
        <FrontView s={s} />
      </div>
      <dl className="mouth-notes">
        <dt>口・唇</dt>
        <dd>{s.mouth}</dd>
        <dt>舌</dt>
        <dd>{s.tongue}</dd>
        <dt>空気</dt>
        <dd>
          {s.air}
          {s.velumDown ? '（鼻から）' : ''}
        </dd>
        <dt>のど</dt>
        <dd>{s.voice ? <span className="voiced">声を出す（ふるえる）</span> : <span className="voiceless">息だけ（声は出さない）</span>}</dd>
      </dl>
      <p className="mouth-legend">
        <span className="lg-flow">→</span>空気 <span className="lg-dash">‐‐→</span>止めてから出す <span className="lg-dot">◯</span>触れる・近づく所
      </p>
    </div>
  );
}
