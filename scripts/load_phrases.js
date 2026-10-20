'use strict';
// index.html が読み込む data/phrases*.js を、ブラウザと同じ順序で1つのコンテキストに評価して PHRASES /
// PHRASE_SCENES を取り出す。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPhraseData(root) {
  root = root || path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const files = [];
  html.replace(/<script[^>]+src="([^"]+)"/g, (m, src) => {
    if (/^data\/phrases[^/]*\.js$/.test(src)) files.push(src);
    return m;
  });
  if (!files.length) throw new Error('index.html に phrases*.js の <script> が見つかりません');
  const ctx = vm.createContext({ console });
  files.forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f })
  );
  const got = vm.runInContext(
    "({ phrases: PHRASES, scenes: typeof PHRASE_SCENES === 'undefined' ? null : PHRASE_SCENES })",
    ctx
  );
  return { phrases: got.phrases, scenes: got.scenes, files };
}
module.exports = { loadPhraseData };
