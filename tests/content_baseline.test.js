'use strict';
// 出荷済み教材の保護(回帰テスト)。教材を「追加」しても失敗せず、既存教材の「削除・ID変更・並び替え
// ・意味の改変」だけを検出する。
//   - 件数の上限はない(下限=出荷済みの件数だけを見る)
//   - 追加分は、IDの連番・重複なし以外をここでは見ない(内容の検証は validate と他のテストが行う)
// - 基準データ: tests/fixtures/baseline_content.json(初版)+ baseline_content_r2.json(第2弾)…。
// 教材を追加するときは編集しない(出荷のたびに新しいファイルを追加する)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWordData } = require('../scripts/load_words.js');
const { loadPhraseData } = require('../scripts/load_phrases.js');
// 出荷済みの全リリース(初版+第2弾…)を合わせた件数
const {
  BASE,
  RELEASES,
  ALL_WORD_COUNT: WORD_COUNT,
  ALL_PHRASE_COUNT: PHRASE_COUNT
} = require('./baseline.js');

// vm 別コンテキストのオブジェクトを通常のオブジェクトにして比較する
const plain = x => JSON.parse(JSON.stringify(x));
const WORDS = plain(loadWordData().words),
  CATS = plain(loadWordData().categories);
const { phrases: PHRASES, scenes: SCENES } = plain(loadPhraseData());
const HINT =
  '(学習記録がIDで紐づいています。IDの変更・削除・並び替え・別の語/構文への流用はしないでください。新しい教材は末尾に新しいIDで追加します)';

/* ---- 単語 ---- */
test('基準: 出荷済みの単語は、IDと並び順がそのまま先頭に残っている(削除・並び替え・挿入がない)', () => {
  assert.ok(
    WORDS.length >= WORD_COUNT,
    '単語が減っています: ' + WORDS.length + ' < ' + WORD_COUNT + HINT
  );
  assert.deepEqual(
    WORDS.slice(0, WORD_COUNT).map(w => w.id),
    BASE.words.map(w => w.id),
    '出荷済みの単語のIDまたは並び順が変わっています' + HINT
  );
});
test('基準: 出荷済みの単語の重要な内容(フランス語・日本語訳・冠詞・性)が変わっていない', () => {
  BASE.words.forEach((b, i) => {
    const w = WORDS[i],
      got = { id: w.id, fr: w.fr, ja: w.ja, art: w.art || '', g: w.g || '' };
    assert.deepEqual(
      got,
      b,
      b.id + ' の内容が変わっています。別の単語は新しいIDで追加してください' + HINT
    );
  });
});
test('基準: 追加した単語のIDは、出荷済みの最後の次から欠番なしの連番で、重複しない', () => {
  const added = WORDS.slice(WORD_COUNT).map(w => w.id);
  assert.deepEqual(
    added,
    added.map((_, i) => 'w' + (WORD_COUNT + 1 + i)),
    '追加分のIDは w' + (WORD_COUNT + 1) + ' から順に、ゼロ埋めなしの連番にしてください'
  );
  assert.equal(new Set(WORDS.map(w => w.id)).size, WORDS.length, 'IDの重複');
});
test('基準: 出荷済みの単語カテゴリは、すべて残っている(新カテゴリの追加は自由)', () => {
  BASE.categories.forEach(c =>
    assert.ok(CATS.includes(c), 'カテゴリ「' + c + '」が CATEGORIES から消えています')
  );
  assert.equal(new Set(CATS).size, CATS.length, 'カテゴリの重複');
});

/* ---- 構文 ---- */
test('基準: 出荷済みの構文は、IDと並び順がそのまま先頭に残っている(削除・並び替え・挿入がない)', () => {
  assert.ok(
    PHRASES.length >= PHRASE_COUNT,
    '構文が減っています: ' + PHRASES.length + ' < ' + PHRASE_COUNT + HINT
  );
  assert.deepEqual(
    PHRASES.slice(0, PHRASE_COUNT).map(p => p.id),
    BASE.phrases.map(p => p.id),
    '出荷済みの構文のIDまたは並び順が変わっています' + HINT
  );
});
test('基準: 出荷済みの構文の重要な内容(完成文・日本語訳・場面・レベル)が変わっていない', () => {
  BASE.phrases.forEach((b, i) => {
    const p = PHRASES[i],
      got = { id: p.id, fr: p.fr, ja: p.ja, scene: p.scene, level: p.level };
    assert.deepEqual(
      got,
      b,
      b.id + ' の内容が変わっています。別の構文は新しいIDで追加してください' + HINT
    );
  });
});
test('基準: 追加した構文のIDは、出荷済みの最後の次から欠番なしの連番(2桁ゼロ埋め、100以降はそのまま)で、重複しない', () => {
  const added = PHRASES.slice(PHRASE_COUNT).map(p => p.id);
  assert.deepEqual(
    added,
    added.map((_, i) => 'p' + String(PHRASE_COUNT + 1 + i).padStart(2, '0')),
    '追加分のIDは p' + (PHRASE_COUNT + 1) + ' から順に、連番にしてください'
  );
  assert.equal(new Set(PHRASES.map(p => p.id)).size, PHRASES.length, 'IDの重複');
});
test('基準: 出荷済みの場面は、キーと表示名がそのまま残っている(新しい場面の追加は自由)', () => {
  Object.keys(BASE.scenes).forEach(k =>
    assert.equal(SCENES[k], BASE.scenes[k], '場面 ' + k + ' の表示名が変わった、または消えています')
  );
  PHRASES.forEach(p =>
    assert.ok(
      Object.prototype.hasOwnProperty.call(SCENES, p.scene),
      p.id + ' の場面 ' + p.scene + ' が PHRASE_SCENES にありません'
    )
  );
});
test('基準: 追加した構文が参照する単語IDはすべて実在する(出荷済みの語も、追加した語も)', () => {
  const ids = new Set(WORDS.map(w => w.id));
  PHRASES.forEach(p =>
    (p.wordIds || [])
      .concat(
        (p.slots || []).reduce((a, s) => a.concat(s.options.map(o => o.wordId).filter(Boolean)), [])
      )
      .forEach(id => assert.ok(ids.has(id), p.id + ' が存在しない単語 ' + id + ' を参照'))
  );
});
