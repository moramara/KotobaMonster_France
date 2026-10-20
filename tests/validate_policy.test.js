'use strict';
// scripts/validate_policy.js(教材の編集ルール)のテスト。壊したデータを検出できること、
// 本番の教材がルールを満たしていることを確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkPolicy, formatIssue } = require('../scripts/validate_policy.js');
const { loadWordData } = require('../scripts/load_words.js');
const { loadPhraseData } = require('../scripts/load_phrases.js');

const clone = o => JSON.parse(JSON.stringify(o));
const real = () => ({ w: clone(loadWordData().words), p: clone(loadPhraseData().phrases) });
const run = mut => {
  const d = real();
  mut(d.w, d.p);
  return checkPolicy(d.w, d.p);
};
const has = (r, id, field) => r.errors.some(e => e.id === id && e.field.indexOf(field) === 0);

test('編集ルール: 本番の教材はエラー0・警告0(教材を足した後もこのテストで確認される)', () => {
  const d = real(),
    r = checkPolicy(d.w, d.p);
  assert.deepEqual(r.errors.map(formatIssue), []);
  assert.deepEqual(r.warnings.map(formatIssue), []);
});
test('編集ルール: 動詞は forms.present に6人称が je, tu, il, nous, vous, ils の順で必要', () => {
  const vid = real().w.find(w => w.pos === 'verb' && !/^se /.test(w.fr)).id;
  const at = (w, f) => (w.find(x => x.id === vid).forms = f);
  assert.ok(
    has(
      run(w => at(w, {})),
      vid,
      'forms.present'
    ),
    'present なし'
  );
  assert.ok(
    has(
      run(w => at(w, { present: 'je a, tu b' })),
      vid,
      'forms.present'
    ),
    '2人称だけ'
  );
  assert.ok(
    has(
      run(w => at(w, { present: 'tu a, je b, il c, nous d, vous e, ils f' })),
      vid,
      'forms.present'
    ),
    '順序の誤り'
  );
  assert.equal(
    run(w =>
      at(w, { present: 'je fais, tu fais, il fait, nous faisons, vous faites, ils font' })
    ).errors.filter(e => e.id === vid).length,
    0
  );
});
test("編集ルール: 代名動詞は je me / tu te / il se … の形、母音の前は j' を許す", () => {
  const d = real(),
    se = d.w.find(w => /^se /.test(w.fr));
  if (se) {
    assert.equal(checkPolicy(d.w, d.p).errors.length, 0, '既存の代名動詞は合格');
    se.forms.present = 'je lève, tu lèves, il lève, nous levons, vous levez, ils lèvent';
    assert.ok(has(checkPolicy(d.w, d.p), se.id, 'forms.present'), 'me/te/se がない');
  }
  const r = run(w => {
    const v = w.find(x => x.pos === 'verb' && !/^se /.test(x.fr));
    v.forms.present = "j'aime, tu aimes, il aime, nous aimons, vous aimez, ils aiment";
  });
  assert.equal(r.errors.length, 0, "j' で始まる1人称は可");
});
test('編集ルール: 形容詞は女性形 forms.fem が必須', () => {
  const aid = real().w.find(w => w.pos === 'adjective').id;
  assert.ok(
    has(
      run(w => delete w.find(x => x.id === aid).forms.fem),
      aid,
      'forms.fem'
    )
  );
  assert.ok(
    has(
      run(w => (w.find(x => x.id === aid).forms.fem = '')),
      aid,
      'forms.fem'
    )
  );
});
test('編集ルール: 絵文字が他の語と重複するとエラー(絵→仏の問題が曖昧になる)', () => {
  const r = run(w => {
    const a = w.find(x => x.emoji);
    w[w.length - 1].emoji = a.emoji;
  });
  assert.ok(has(r, real().w[real().w.length - 1].id, 'emoji'));
});
test('編集ルール: ID は欠番のない連番。欠番・重複・形式違いはエラー', () => {
  const n = real().w.length;
  // 最後の語を w(n+1) にすると、w(n) が欠番になる
  const gap = run(w => (w[w.length - 1].id = 'w' + (n + 1)));
  assert.ok(
    gap.errors.some(e => e.id === 'w' + n && /欠番/.test(e.message)),
    '欠番'
  );
  assert.ok(
    run((w, p) => (p[5].id = p[4].id)).errors.some(
      e => e.kind === 'phrase' && /重複/.test(e.message)
    ),
    '重複'
  );
  assert.ok(
    run(w => (w[0].id = 'x01')).errors.some(e => e.id === 'x01' && /連番/.test(e.message)),
    '形式'
  );
});
test('編集ルール: A1 の構文が A1 以外の単語を参照するとエラー(wordIds と slots の wordId の両方)', () => {
  const d = real(),
    a2 = d.w.find(w => w.level === 'A2').id,
    a1 = d.p.find(p => p.level === 'A1');
  const viaIds = run((w, p) => p.find(x => x.id === a1.id).wordIds.push(a2));
  assert.ok(has(viaIds, a1.id, 'wordIds'));
  const withSlot = d.p.find(p => p.level === 'A1' && p.slots && p.slots.length);
  const viaSlot = run((w, p) => {
    const x = p.find(q => q.id === withSlot.id);
    x.slots[0].options[0].wordId = a2;
  });
  assert.ok(has(viaSlot, withSlot.id, 'wordIds'));
  const a2phrase = d.p.find(p => p.level === 'A2');
  const ok = run((w, p) => p.find(x => x.id === a2phrase.id).wordIds.push(a2));
  assert.ok(!has(ok, a2phrase.id, 'wordIds'), 'A2 の構文が A2 の単語を参照するのは可');
});

/* ================= ID 形式の不正をエラーにする(数値を取り出せるだけでは合格にしない) ================= */
const idErrors = r => r.errors.filter(e => e.field === 'id');
// 末尾の語・構文以外に影響しないよう、ID だけを書き換えた(または末尾に足した)データで検証する
const renameFirst = (kind, id) =>
  run((w, p) => {
    (kind === 'word' ? w : p)[0].id = id;
  });

test('ID形式: 不正な単語ID(w1 w001)は、IDと理由つきのエラーになる', () => {
  const r1 = renameFirst('word', 'w1'),
    r2 = renameFirst('word', 'w001');
  const e1 = r1.errors.filter(e => e.id === 'w1'),
    e2 = r2.errors.filter(e => e.id === 'w001');
  assert.equal(e1.length, 1);
  assert.equal(e1[0].kind, 'word');
  assert.equal(e1[0].field, 'id');
  assert.match(e1[0].message, /形式が不正です/);
  assert.match(e1[0].message, /1〜9は2桁で書きます/);
  assert.match(e1[0].message, /正しくは w01/);
  assert.equal(e2.length, 1);
  assert.match(e2[0].message, /不要なゼロ埋めがあります/);
  assert.match(e2[0].message, /正しくは w01/);
});
test('ID形式: 不正な単語ID(w0183)は、末尾に足すとIDと理由つきのエラーになり、欠番や重複にはならない', () => {
  const n = real().w.length; // 出荷時は 182。w0183 は 183 番の不正表記
  const r = run((w, p) => {
    const x = clone(w[w.length - 1]);
    x.id = 'w0' + (n + 1);
    x.emoji = ''; // 複製元の絵文字が重複エラーになり、ID形式の検証に混ざるのを防ぐ
    w.push(x);
  });
  const bad = r.errors.filter(e => e.id === 'w0' + (n + 1));
  assert.equal(bad.length, 1);
  assert.match(bad[0].message, /不要なゼロ埋めがあります/);
  assert.match(bad[0].message, new RegExp('正しくは w' + (n + 1)));
  assert.ok(!r.errors.some(e => /欠番|重複/.test(e.message)), '欠番・重複は報告されない');
});
test('ID形式: 不正な構文ID(p1 p001)は、IDと理由つきのエラーになる', () => {
  const e1 = renameFirst('phrase', 'p1').errors.filter(e => e.id === 'p1'),
    e2 = renameFirst('phrase', 'p001').errors.filter(e => e.id === 'p001');
  assert.equal(e1.length, 1);
  assert.equal(e1[0].kind, 'phrase');
  assert.match(e1[0].message, /1〜9は2桁で書きます/);
  assert.match(e1[0].message, /正しくは p01/);
  assert.equal(e2.length, 1);
  assert.match(e2[0].message, /不要なゼロ埋めがあります/);
  assert.match(e2[0].message, /正しくは p01/);
});
test('ID形式: 番号0(w00)はエラーになる。直し先がないので「正しくは」は付かない', () => {
  const e = renameFirst('word', 'w00').errors.filter(
    x => x.id === 'w00' && /形式が不正/.test(x.message)
  );
  assert.equal(e.length, 1);
  assert.match(e[0].message, /番号は1以上です/);
  assert.ok(!/正しくは/.test(e[0].message));
});
test('ID形式: 正常なID(w01 w09 w10 w99 w100 w183 / p01 p09 p10 p99 p100)には形式のエラーが出ない', () => {
  const d = real();
  assert.deepEqual(idErrors(checkPolicy(d.w, d.p)), [], '本番の教材(w01〜 / p01〜)');
  const mk = (prefix, list) => list.map(n => ({ id: prefix + n }));
  const r = checkPolicy(
    mk('w', ['01', '09', '10', '99', '100', '183']).concat([]),
    mk('p', ['01', '09', '10', '99', '100'])
  );
  assert.ok(!r.errors.some(e => /形式が不正/.test(e.message)), '形式のエラーなし');
});
test('ID形式: 不正なIDを直すと、形式・重複・欠番のエラーはなくなり、正常データのエラーは0のまま', () => {
  const d = real();
  d.w[0].id = 'w001';
  d.p[0].id = 'p1';
  assert.equal(idErrors(checkPolicy(d.w, d.p)).length, 2, '直す前は2件');
  d.w[0].id = 'w01';
  d.p[0].id = 'p01';
  const r = checkPolicy(d.w, d.p);
  assert.deepEqual(idErrors(r), []);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});
test('ID形式: w183 と w0183 のように直すと同じIDになる組は、形式の不正と重複の両方がエラーになる', () => {
  const n = real().w.length;
  const r = run((w, p) => {
    const x = clone(w[w.length - 1]);
    x.id = 'w0' + n;
    w.push(x);
  });
  assert.ok(r.errors.some(e => e.id === 'w0' + n && /形式が不正/.test(e.message)));
  assert.ok(r.errors.some(e => e.id === 'w' + n && /重複/.test(e.message)));
});
