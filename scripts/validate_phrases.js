#!/usr/bin/env node
'use strict';
// 構文データの検証。使い方: node scripts/validate_phrases.js [--strict] [--quiet]
// エラーがあれば終了コード1。--strict なら警告でも1。単語ID(wordIds・slots の wordId)は words.js
// の実在IDと照合する。
const PhraseLib = require('../src/lib/phraselib.js');
const { loadPhraseData } = require('./load_phrases.js');
const { loadWordData } = require('./load_words.js');

const args = process.argv.slice(2),
  strict = args.includes('--strict'),
  quiet = args.includes('--quiet');
let data, words;
try {
  data = loadPhraseData();
  words = loadWordData();
} catch (e) {
  console.error('構文データを読み込めません: ' + e.message);
  process.exit(1);
}
const t0 = Date.now();
const rep = PhraseLib.validate(data.phrases, {
  wordIds: words.words.map(w => w.id),
  scenes: data.scenes
});
console.log(
  '検証対象: ' +
    data.files.join(', ') +
    ' / ' +
    data.phrases.length +
    '構文 (' +
    (Date.now() - t0) +
    'ms)'
);
rep.errors.forEach(x => console.log('  ✗ エラー ' + PhraseLib.formatIssue(x)));
if (!quiet) rep.warnings.forEach(x => console.log('  △ 警告   ' + PhraseLib.formatIssue(x)));
console.log('エラー ' + rep.errors.length + '件 / 警告 ' + rep.warnings.length + '件');
if (rep.errors.length) {
  console.log('NG: エラーを修正してください(エラーのある構文はゲームから除外されます)');
  process.exit(1);
}
if (strict && rep.warnings.length) {
  console.log('NG(--strict): 警告を修正してください');
  process.exit(1);
}
console.log('OK');
