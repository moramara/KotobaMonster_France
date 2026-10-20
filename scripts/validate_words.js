#!/usr/bin/env node
'use strict';
// 単語データの検証。使い方: node scripts/validate_words.js [--strict] [--quiet]
//   エラーがあれば終了コード1。--strict なら警告でも1。--quiet は警告の個別表示を省略。
const WordLib = require('../src/lib/wordlib.js');
const { loadWordData } = require('./load_words.js');

const args = process.argv.slice(2),
  strict = args.includes('--strict'),
  quiet = args.includes('--quiet');
let data;
try {
  data = loadWordData();
} catch (e) {
  console.error('単語データを読み込めません: ' + e.message);
  process.exit(1);
}
const t0 = Date.now();
const rep = WordLib.validate(data.words, { categories: data.categories });
console.log(
  '検証対象: ' +
    data.files.join(', ') +
    ' / ' +
    data.words.length +
    '語 (' +
    (Date.now() - t0) +
    'ms)'
);
rep.errors.forEach(x => console.log('  ✗ エラー ' + WordLib.formatIssue(x)));
if (!quiet) rep.warnings.forEach(x => console.log('  △ 警告   ' + WordLib.formatIssue(x)));
console.log('エラー ' + rep.errors.length + '件 / 警告 ' + rep.warnings.length + '件');
if (rep.errors.length) {
  console.log('NG: エラーを修正してください(エラーのある単語はゲームから除外されます)');
  process.exit(1);
}
if (strict && rep.warnings.length) {
  console.log('NG(--strict): 警告を修正してください');
  process.exit(1);
}
console.log('OK');
