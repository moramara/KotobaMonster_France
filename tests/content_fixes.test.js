'use strict';
// 既存教材の説明の修正(品質改善)のテスト。w67(enfant)の学習メモと、p84 の文法解説(女性形の補足)。
// 修正対象外の項目(ID・フランス語・日本語訳・冠詞・性・完成文・出題形式など)
// が変わっていないことも確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWordData } = require('../scripts/load_words.js');
const { loadPhraseData } = require('../scripts/load_phrases.js');
const plain = x => JSON.parse(JSON.stringify(x));
const WORDS = plain(loadWordData().words),
  PHRASES = plain(loadPhraseData().phrases);

test("w67(enfant): 学習メモは、男女どちらにも使える・l'enfant は性が分からない・un enfant / une enfant の違いを説明している", () => {
  const w = WORDS.find(x => x.id === 'w67');
  assert.ok(w);
  assert.equal(w.fr, 'enfant');
  assert.equal(w.ja, '子ども');
  assert.equal(w.art, "l'");
  assert.equal(w.g, 'm');
  assert.equal(w.level, 'A1');
  assert.equal(w.ex, "L'enfant joue.");
  assert.equal(w.exJa, '子どもが遊んでいます。');
  assert.equal(w.kana, 'ランファン');
  assert.equal(w.emoji, '👶');
  assert.ok(w.note.includes('男の子にも女の子にも'), '男女どちらにも使える');
  assert.ok(
    w.note.includes("l'enfant") && w.note.includes('母音'),
    "母音で始まるため男女とも l'enfant"
  );
  assert.ok(w.note.includes('un enfant') && w.note.includes('une enfant'), '不定冠詞の違い');
  assert.ok(!/le\/la/.test(w.note), '誤り(冠詞は le/la で性を示す)が残っていない');
  assert.ok(!/le enfant|la enfant/.test(w.note), '文法的に誤った形を含まない');
});
test('p84: 文法解説に、男性話者 fatigué・女性話者 fatiguée・形容詞の性数一致の説明がある。完成文・訳・出題形式は変わらない', () => {
  const p = PHRASES.find(x => x.id === 'p84');
  assert.ok(p);
  assert.equal(p.fr, 'Je dors parce que je suis fatigué.');
  assert.equal(p.ja, '私は疲れているので寝ます。');
  assert.equal(p.level, 'A2');
  assert.equal(p.scene, 'talk');
  assert.equal(p.pattern, '文 + parce que + 文');
  assert.deepEqual(p.cloze, {
    chunk: 1,
    pre: '',
    answer: 'parce que',
    post: '',
    options: ['parce que', 'pourquoi', 'qui', 'combien']
  });
  assert.deepEqual(p.wordIds, ['w93', 'w151', 'w121', 'w135']);
  assert.deepEqual(p.slots, []);
  assert.ok(/男性話者は fatigué/.test(p.grammarNote) && /女性話者は fatiguée/.test(p.grammarNote));
  assert.ok(p.grammarNote.includes('性数一致'));
  assert.ok(p.grammarNote.includes("parce qu'"), '従来の説明(母音の前)は残す');
  assert.ok(p.grammarNote.length <= 140, '140文字以内');
});
