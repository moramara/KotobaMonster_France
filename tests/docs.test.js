'use strict';
// ドキュメントのリンク切れ・存在しないコマンドの記載を検出する。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = ['README.md'].concat(
  fs
    .readdirSync(path.join(root, 'docs'))
    .filter(f => f.endsWith('.md'))
    .map(f => 'docs/' + f)
);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('ドキュメント: README と docs/*.md の相対リンク先が、すべて実在する', () => {
  const bad = [];
  files.forEach(f => {
    const re = /\]\(([^)#\s]+)(#[^)]*)?\)/g;
    let m;
    while ((m = re.exec(read(f)))) {
      if (/^[a-z]+:/i.test(m[1])) continue;
      const target = path.join(root, path.dirname(f), m[1]);
      if (!fs.existsSync(target)) bad.push(f + ' → ' + m[1]);
    }
  });
  assert.deepEqual(bad, []);
});
test('ドキュメント: 記載した npm run のコマンドは、すべて package.json に存在する', () => {
  const scripts = Object.keys(JSON.parse(read('package.json')).scripts);
  const bad = [];
  files.forEach(f => {
    const re = /npm run ([a-z:]+)/g;
    let m;
    while ((m = re.exec(read(f)))) if (!scripts.includes(m[1])) bad.push(f + ': npm run ' + m[1]);
  });
  assert.deepEqual(bad, []);
});
test('ドキュメント: 記載したファイルパス(scripts/・src/・tests/ など)が実在する', () => {
  const bad = [];
  files.forEach(f => {
    const re = /`((?:scripts|src|tests|data|css|docs)\/[A-Za-z0-9_./-]+\.[a-z]+)`/g;
    let m;
    while ((m = re.exec(read(f))))
      if (!fs.existsSync(path.join(root, m[1]))) bad.push(f + ': ' + m[1]);
  });
  assert.deepEqual(bad, []);
});
test('ドキュメント: README は簡潔(詳細は docs/ へ)で、3つの詳細ドキュメントへリンクしている', () => {
  const md = read('README.md');
  assert.ok(md.split('\n').length <= 100, 'README の行数');
  ['docs/CONTENT_GUIDE.md', 'docs/DEVELOPMENT.md', 'docs/SPECS.md'].forEach(d =>
    assert.ok(md.includes(d), 'README から ' + d)
  );
  assert.ok(
    /既存のID/.test(md) && /npm run validate/.test(md),
    '教材追加の要点が README に残っている'
  );
});
