'use strict';
// 教材データ(words.js)の見直し結果のテスト: chien / eau の発音補助、table の絵文字、既存30語の保護
const test = require('node:test');
const assert = require('node:assert/strict');
const WordLib = require('../src/lib/wordlib.js');
const { loadWordData } = require('../scripts/load_words.js');
const { fixtureWords } = require('./harness.js');

// vm 別コンテキストのオブジェクトを通常のオブジェクトにして比較する
const plain = x => JSON.parse(JSON.stringify(x));
const real = () => new Map(loadWordData().words.map(w => [w.id, plain(w)]));
const find = fr => loadWordData().words.find(w => w.fr === fr);

test('words.js: 既存30語のIDと並びは先頭にそのまま維持され、追加分は w31 からの連番(80語以上。件数の上限なし)', () => {
  const ids = plain(loadWordData().words.map(w => w.id)),
    fx = plain(fixtureWords().words.map(w => w.id));
  assert.deepEqual(ids.slice(0, 30), fx);
  const added = ids.slice(30);
  assert.ok(added.length >= 80, '追加 ' + added.length + '語(出荷時より減っています)');
  assert.deepEqual(
    added,
    added.map((_, i) => 'w' + (31 + i))
  );
  assert.equal(new Set(ids).size, ids.length);
});
test('chien: 発音の目安は「シアン」(/ʃjɛ̃/)。小書きでない「ヤ」を使った「シヤン」ではない', () => {
  const w = find('chien');
  assert.equal(w.id, 'w09');
  assert.equal(w.kana, 'シアン');
  assert.doesNotMatch(w.kana, /シヤン/);
  assert.deepEqual([w.art, w.g, w.ja], ['le', 'm', '犬']);
});
test("eau: 発音の目安「ロー」は l'eau(冠詞つき)の読み方であることが学習メモで分かる", () => {
  const w = find('eau');
  assert.equal(w.id, 'w17');
  assert.equal(w.kana, 'ロー');
  assert.deepEqual([w.art, w.g], ["l'", 'f']);
  assert.match(w.note, /l'eau/);
  assert.match(w.note, /オー/);
  assert.match(w.note, /ロー/);
  assert.equal(WordLib.display(w), "l'eau", '表示は冠詞つき');
});
test('table: 絵文字は椅子(🪑)ではない。誤った絵を出さないので「絵→仏」の問題にも使われない', () => {
  const w = find('table');
  assert.equal(w.id, 'w23');
  assert.notEqual(w.emoji, '🪑');
  assert.equal(w.emoji, '');
  assert.equal(WordLib.canShowImage(WordLib.normalize(w)), false);
  assert.deepEqual([w.art, w.g, w.ja, w.kana], ['la', 'f', 'テーブル', 'ターブル']);
});
test('words.js: 椅子の絵文字(🪑)は chaise だけ / 絵文字の重複で絵問題が曖昧にならない', () => {
  const words = loadWordData().words;
  assert.deepEqual(
    plain(words.filter(w => w.emoji === '🪑').map(w => w.fr)),
    ['chaise'],
    '🪑(椅子)を使うのは chaise だけ(table には使わない)'
  );
  const seen = new Map();
  words
    .filter(w => w.emoji)
    .forEach(w => {
      assert.ok(
        !seen.has(w.emoji),
        w.emoji + ' が ' + seen.get(w.emoji) + ' と ' + w.id + ' で重複'
      );
      seen.set(w.emoji, w.id);
    });
});
test('words.js: 絵→仏の問題が成立する語は、絵文字つきの名詞だけ', () => {
  loadWordData()
    .words.map(WordLib.normalize)
    .forEach(w => {
      if (WordLib.canShowImage(w)) {
        assert.ok(w.emoji);
        assert.equal(w.pos, 'noun', w.id);
      }
    });
});
test('words.js: 変更していない語(chien/eau/table 以外)は出荷時のデータと一致する', () => {
  const r = real(),
    changed = new Set(['w09', 'w17', 'w23']);
  fixtureWords()
    .words.filter(f => !changed.has(f.id))
    .forEach(f => assert.deepEqual(r.get(f.id), plain(f), f.id + ' が意図せず変わっています'));
  fixtureWords()
    .words.filter(f => changed.has(f.id))
    .forEach(f => {
      const w = r.get(f.id);
      ['id', 'cat', 'art', 'g', 'fr', 'ja', 'ex', 'exJa', 'level'].forEach(k =>
        assert.equal(w[k], f[k], f.id + '.' + k)
      );
    });
});
test('words.js: 発音の目安はすべてカタカナ等の許容文字で、検証の警告・エラーが0件(--strict 相当)', () => {
  const d = loadWordData(),
    rep = WordLib.validate(d.words, { categories: d.categories });
  assert.deepEqual(rep.errors.map(WordLib.formatIssue), []);
  assert.deepEqual(rep.warnings.map(WordLib.formatIssue), []);
  d.words.forEach(w =>
    assert.ok(w.kana && /^[\u30A0-\u30FF\u3000\s・\-ー']+$/.test(w.kana), w.id + ' の kana')
  );
});
