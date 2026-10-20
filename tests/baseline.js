'use strict';
// 出荷済み教材の基準データ(tests/fixtures/baseline_content*.json)の共通部品。*.test.js
// ではないので、単独ではテストとして実行されない。
// 教材は「出荷(リリース)」ごとに基準ファイルを1つ持つ。出荷済みのファイルは編集せず、
// 次の出荷では新しいファイルを追加する:
//   baseline_content.json    = 初版(w01〜w134 / p01〜p60)   ← R1
//   baseline_content_r2.json = 第2弾(w135〜w182 / p61〜p84) ← R2
// テストを教材の追加で壊さないための道具:
// - BASE / ALL_*   : 出荷済みの全リリースを合わせたもの。
// ID・並び順・内容の保護(content_baseline.test.js)に使う。
// - WORD_COUNT など / onlyBaseline : 「初版(R1)」だけ。
// 初版の教材を前提にした検査(完全一致の検索結果、初版の品詞・レベルの制限など)に使う。
//     初版より後に追加した教材がこの検査に混ざって失敗しないようにするため、意味を変えない。
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'fixtures');
const files = fs
  .readdirSync(dir)
  .filter(f => /^baseline_content(_r\d+)?\.json$/.test(f))
  .sort((a, b) => {
    const n = f => (f === 'baseline_content.json' ? 1 : Number(f.match(/_r(\d+)\.json$/)[1]));
    return n(a) - n(b);
  });
const RELEASES = files.map(f => ({
  file: f,
  data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
}));
const R1 = RELEASES[0].data;
const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
const BASE = {
  words: RELEASES.reduce((a, r) => a.concat(r.data.words), []),
  phrases: RELEASES.reduce((a, r) => a.concat(r.data.phrases), []),
  categories: uniq(RELEASES.reduce((a, r) => a.concat(r.data.categories), [])),
  scenes: Object.assign({}, ...RELEASES.map(r => r.data.scenes))
};

const R1_IDS = new Set(R1.words.map(w => w.id).concat(R1.phrases.map(p => p.id)));
const isBaseline = id => R1_IDS.has(id); // 初版の教材か
const onlyBaseline = list =>
  list.filter(x => isBaseline(typeof x === 'string' ? x : x.id || x.pid));

module.exports = {
  BASE,
  RELEASES,
  isBaseline,
  onlyBaseline,
  WORD_COUNT: R1.words.length,
  PHRASE_COUNT: R1.phrases.length, // 初版の件数(R1)
  // 出荷済みの全リリースの件数
  ALL_WORD_COUNT: BASE.words.length,
  ALL_PHRASE_COUNT: BASE.phrases.length
};
