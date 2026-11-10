// 初めて開いたときに入れておく教材の例（オリジナルの文。自由に編集・削除できる）
import { uid, type TextDoc } from './storage';

const SAMPLES: { title: string; s: [string, string][] }[] = [
  {
    title: '例）自己紹介',
    s: [
      ['Hi, nice to meet you.', 'こんにちは、はじめまして。'],
      ["I'm a teacher at an elementary school.", '私は小学校の教員です。'],
      ['I moved here from Japan last year.', '去年、日本からここに引っ越してきました。'],
      ['I like cooking and walking in the park.', '料理と公園の散歩が好きです。'],
      ['How about you? What do you do?', 'あなたはどうですか？お仕事は何をしていますか？'],
    ],
  },
  {
    title: '例）カフェで注文',
    s: [
      ['Hi, can I get a small coffee, please?', 'こんにちは、スモールのコーヒーをお願いできますか？'],
      ['For here or to go?', '店内でお召し上がりですか、お持ち帰りですか？'],
      ['To go, please.', '持ち帰りでお願いします。'],
      ['Would you like anything else?', 'ほかにご注文はありますか？'],
      ["No, that's all. Thank you.", 'いいえ、以上です。ありがとう。'],
      ['Have a nice day!', 'よい一日を！'],
    ],
  },
];

export function sampleTexts(): TextDoc[] {
  return SAMPLES.map((x, i) => ({
    id: uid(),
    title: x.title,
    sentences: x.s.map(([en, ja]) => ({ id: uid(), en, ja, notes: '' })),
    current: 0,
    createdAt: Date.now() + i,
    mastered: false,
    fullRuns: [],
  }));
}
