// EJDict-hand（パブリックドメイン CC0, https://github.com/kujirahand/EJDict）から
// アプリ用の辞書ファイル public/ejdict.tsv を作る。使い方：node tools/build-ejdict.mjs <EJDict/src のパス>
import fs from 'node:fs';
import path from 'node:path';
const src = process.argv[2];
const rows = [];
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.txt')).sort()) {
  for (const line of fs.readFileSync(path.join(src, f), 'utf8').split('\n')) {
    const i = line.indexOf('\t');
    if (i < 0) continue;
    const keys = line.slice(0, i).split(',').map((k) => k.trim()).filter(Boolean);
    const mean = line.slice(i + 1).trim();
    for (const k of keys) rows.push([k.toLowerCase(), k === k.toLowerCase() ? 0 : 1, mean]);
  }
}
// 学習者向けに分かりにくい語の補足（先頭に表示）
const extra = {
  a: '不定冠詞：1つの、ある（数えられる名詞の前）',
  an: '不定冠詞：1つの、ある（母音で始まる語の前で a の代わりに使う）',
  "it's": 'it is / it has の短縮形',
  "i'll": 'I will の短縮形',
  "i've": 'I have の短縮形',
  "i'd": 'I would / I had の短縮形',
};
for (const [k, v] of Object.entries(extra)) rows.push([k, -1, v]);
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
const seen = new Set();
const out = rows.filter((r) => { const k = r[0] + '\t' + r[2]; if (seen.has(k)) return false; seen.add(k); return true; });
fs.writeFileSync('public/ejdict.tsv', out.map((r) => r[0] + '\t' + r[2]).join('\n') + '\n');
console.log(out.length, 'entries');
