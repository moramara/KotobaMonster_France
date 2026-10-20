'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, idStatus, makeId, format } = require('../scripts/content_status.js');
const { loadWordData } = require('../scripts/load_words.js');
const { loadPhraseData } = require('../scripts/load_phrases.js');

test('教材の状況: ID の作り方は README の規則どおり(9以下は2桁、10以降はそのまま)', () => {
  assert.equal(makeId('w', 9), 'w09');
  assert.equal(makeId('w', 10), 'w10');
  assert.equal(makeId('w', 100), 'w100');
  assert.equal(makeId('p', 85), 'p85');
  assert.equal(makeId('p', 100), 'p100');
});
test('教材の状況: 最大番号・次のID・欠番・連番でないID・重複IDを検出する', () => {
  const s = idStatus(
    [{ id: 'w01' }, { id: 'w02' }, { id: 'w04' }, { id: 'x1' }, { id: 'w02' }],
    'w'
  );
  assert.equal(s.max, 4);
  assert.equal(s.next, 'w05');
  assert.deepEqual(s.gaps, ['w03']);
  assert.deepEqual(s.odd, ['x1']);
  assert.deepEqual(s.dups, ['w02']);
  assert.equal(idStatus([], 'p').next, 'p01');
});
test('教材の状況: 本番の教材は、欠番・連番でないID・重複IDがなく、次のIDが「最大+1」になっている', () => {
  const words = loadWordData().words,
    phrases = loadPhraseData().phrases,
    sum = summarize(words, phrases);
  ['words', 'phrases'].forEach(k => {
    const s = sum[k];
    assert.deepEqual(s.gaps, [], k + ' の欠番');
    assert.deepEqual(s.odd, [], k + ' の連番でないID');
    assert.deepEqual(s.dups, [], k + ' の重複ID');
    assert.equal(s.count, s.max, k + ': 件数 = 最大番号(欠番なしの連番)');
  });
  assert.equal(sum.words.next, makeId('w', words.length + 1));
  assert.equal(sum.phrases.next, makeId('p', phrases.length + 1));
  const text = format(sum);
  assert.ok(
    text.includes('次のID ' + sum.words.next) && text.includes('次のID ' + sum.phrases.next)
  );
});

/* ================= ID 形式の検証(数値を取り出せることと、ID 全体が正しい形式であることは別) ================= */
const { idFormatProblem } = require('../scripts/content_status.js');
const ids = (prefix, from, to) => {
  const a = [];
  for (let i = from; i <= to; i++) a.push({ id: makeId(prefix, i) });
  return a;
};

test('ID形式: 正常な単語ID(w01 w09 w10 w99 w100 w183)は形式の検証に合格する', () => {
  ['w01', 'w09', 'w10', 'w99', 'w100', 'w183'].forEach(id => {
    const s = idStatus([{ id }], 'w');
    assert.deepEqual(s.malformed, [], id + ' は正常');
    assert.deepEqual(s.odd, [], id + ' は連番の形');
    assert.equal(idFormatProblem(id, 'w', Number(id.slice(1))), null, id);
  });
});
test('ID形式: 正常な構文ID(p01 p09 p10 p99 p100)は形式の検証に合格する', () => {
  ['p01', 'p09', 'p10', 'p99', 'p100'].forEach(id => {
    const s = idStatus([{ id }], 'p');
    assert.deepEqual(s.malformed, [], id + ' は正常');
    assert.deepEqual(s.odd, [], id + ' は連番の形');
  });
});
test('ID形式: 不正な単語ID(w1 w001 w0183)は、どのIDがなぜ不正かを含めて検出される', () => {
  const want = {
    w1: { expected: 'w01', reason: '1〜9は2桁で書きます' },
    w001: { expected: 'w01', reason: '不要なゼロ埋めがあります' },
    w0183: { expected: 'w183', reason: '不要なゼロ埋めがあります' }
  };
  Object.keys(want).forEach(id => {
    const s = idStatus([{ id }], 'w');
    assert.deepEqual(s.malformed, [Object.assign({ id }, want[id])], id);
    assert.deepEqual(
      s.odd,
      [],
      id + ' は「数字を取り出せるID」なので odd ではなく malformed で報告する'
    );
  });
});
test('ID形式: 不正な構文ID(p1 p001)は、どのIDがなぜ不正かを含めて検出される', () => {
  assert.deepEqual(idStatus([{ id: 'p1' }], 'p').malformed, [
    { id: 'p1', expected: 'p01', reason: '1〜9は2桁で書きます' }
  ]);
  assert.deepEqual(idStatus([{ id: 'p001' }], 'p').malformed, [
    { id: 'p001', expected: 'p01', reason: '不要なゼロ埋めがあります' }
  ]);
});
test('ID形式: 番号0・接頭辞違い・巨大な数は、安全に報告される(集計が止まったり壊れたりしない)', () => {
  const s = idStatus(
    [{ id: 'w00' }, { id: 'p01' }, { id: 'w' + '9'.repeat(30) }, ...ids('w', 1, 3)],
    'w'
  );
  assert.deepEqual(s.malformed, [{ id: 'w00', expected: null, reason: '番号は1以上です' }]);
  assert.deepEqual(s.odd, ['p01', 'w' + '9'.repeat(30)], '接頭辞違いと巨大な数は連番の形ではない');
  assert.equal(s.max, 3);
  assert.equal(s.next, 'w04');
});
test('ID形式: 不正形式のIDがあっても、数値部分は最大番号・次のIDに反映される(既存のIDとぶつからない)', () => {
  // w01〜w182 に、不正形式の w0183 が加わった状態
  const s = idStatus([...ids('w', 1, 182), { id: 'w0183' }], 'w');
  assert.equal(s.max, 183, 'w0183 の 183 を最大番号に含める');
  assert.equal(s.next, 'w184', '次のIDが w0183(=w183)と衝突しない');
  assert.deepEqual(s.gaps, [], 'w183 を欠番扱いにしない');
  assert.deepEqual(s.malformed, [
    { id: 'w0183', expected: 'w183', reason: '不要なゼロ埋めがあります' }
  ]);
  assert.deepEqual(s.dups, []);
});
test('ID形式: 不正形式のIDを正しい形に直すと、重複や集計の異常は起きず、最大番号・次のIDも変わらない', () => {
  const bad = idStatus([...ids('w', 1, 182), { id: 'w0183' }], 'w'),
    fixed = idStatus([...ids('w', 1, 182), { id: 'w183' }], 'w');
  assert.deepEqual(fixed.malformed, []);
  assert.deepEqual(fixed.dups, []);
  assert.deepEqual(fixed.gaps, []);
  assert.deepEqual(fixed.odd, []);
  assert.equal(fixed.max, bad.max);
  assert.equal(fixed.next, bad.next);
  assert.equal(fixed.count, 183);
});
test('ID形式: w183 と w0183 のように、直すと同じIDになるものは重複として、正しい形で報告される', () => {
  const s = idStatus([...ids('w', 1, 183), { id: 'w0183' }], 'w');
  assert.deepEqual(s.dups, ['w183']);
  assert.deepEqual(s.malformed, [
    { id: 'w0183', expected: 'w183', reason: '不要なゼロ埋めがあります' }
  ]);
  assert.equal(s.max, 183);
  assert.equal(s.next, 'w184');
});
test('ID形式: 本番の教材は形式が不正なIDがなく、出荷時の最大番号・次のIDは変わらない', () => {
  const words = loadWordData().words,
    phrases = loadPhraseData().phrases,
    sum = summarize(words, phrases);
  assert.deepEqual(sum.words.malformed, []);
  assert.deepEqual(sum.phrases.malformed, []);
  assert.ok(!format(sum).includes('形式が不正'), '正常なデータの表示に不正の表示が出ない');
  // 出荷済み(単語182語・構文84件)の範囲で、最大番号と次のIDを固定して確認する
  const w = idStatus(words.slice(0, 182), 'w'),
    p = idStatus(phrases.slice(0, 84), 'p');
  assert.equal(w.max, 182);
  assert.equal(w.next, 'w183');
  assert.equal(p.max, 84);
  assert.equal(p.next, 'p85');
});
