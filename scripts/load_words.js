'use strict';
// index.html が読み込む data/words*.js を、ブラウザと同じ順序で1つのコンテキストに評価して WORDS /
// CATEGORIES を取り出す。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadWordData(root) {
  root = root || path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const files = [];
  html.replace(/<script[^>]+src="([^"]+)"/g, (m, src) => {
    if (/^data\/words[^/]*\.js$/.test(src)) files.push(src);
    return m;
  });
  if (!files.length) throw new Error('index.html に words*.js の <script> が見つかりません');
  const ctx = vm.createContext({ console });
  files.forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f })
  );
  const got = vm.runInContext(
    "({ words: WORDS, categories: typeof CATEGORIES === 'undefined' ? null : CATEGORIES })",
    ctx
  );
  return { words: got.words, categories: got.categories, files };
}
module.exports = { loadWordData };
