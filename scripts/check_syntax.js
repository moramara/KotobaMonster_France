#!/usr/bin/env node
'use strict';
// すべての .js(index.html・data・src・scripts・tests)が構文エラーなく読めるか確認する。
// 使い方: node scripts/check_syntax.js    (読むだけ。実行はしない)
// 新しい .js を足したときも、ここで自動的に対象になる(ファイルの一覧を書き足す必要はない)。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const DIRS = ['data', 'src', 'scripts', 'tests'];

function listJs(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') listJs(p, out);
    } else if (e.name.endsWith('.js')) out.push(p);
  });
  return out;
}
// 構文エラーのあるファイルの { file, message } の一覧(なければ空)
function checkAll(root) {
  root = root || ROOT;
  const bad = [];
  let n = 0;
  DIRS.forEach(d => {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) return;
    listJs(dir, []).forEach(f => {
      n++;
      try {
        // 先頭の #! 行は Node が許す書き方なので、空白に置き換えて(行番号は保ったまま)調べる
        const src = fs.readFileSync(f, 'utf8').replace(/^#!.*/, m => ' '.repeat(m.length));
        new vm.Script(src, { filename: path.relative(root, f) });
      } catch (e) {
        bad.push({ file: path.relative(root, f), message: e.message });
      }
    });
  });
  return { checked: n, bad };
}
module.exports = { checkAll };

if (require.main === module) {
  const r = checkAll();
  r.bad.forEach(b => console.log('  ✗ ' + b.file + ': ' + b.message));
  console.log('構文チェック: ' + r.checked + 'ファイル / エラー ' + r.bad.length + '件');
  if (r.bad.length) process.exit(1);
  console.log('OK');
}
