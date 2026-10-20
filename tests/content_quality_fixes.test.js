'use strict';
// 既存教材の品質修正(pingouin・manchot・quai・tenir・garder・peau)の回帰テスト。
// ID・綴り・冠詞・性・活用形・複数形は変えず、意味・例文・訳だけを直したことを確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWordData } = require('../scripts/load_words.js');
const WordLib = require('../src/lib/wordlib.js');

const deq = assert.deepEqual;
const plain = x => JSON.parse(JSON.stringify(x));
const WD = plain(loadWordData()),
  WORDS = WD.words;
const byId = id => WORDS.find(w => w.id === id);

test('pingouin(w766): 「北半球の海鳥(ウミスズメ科)」に直り、🐧 は外れ、manchot と別の鳥だと note にある。ID・綴り・冠詞・性は同じ', () => {
  const w = byId('w766');
  deq([w.id, w.fr, w.art, w.g, w.cat, w.level], ['w766', 'pingouin', 'le', 'm', '動物', 'A2']);
  assert.equal(w.ja, '北半球の海鳥(ウミスズメ科)');
  assert.equal(w.ex, 'Le pingouin vit dans les régions arctiques.');
  assert.equal(w.exJa, 'pingouin は北極圏に生息します。');
  assert.ok(!w.emoji, '🐧 は manchot へ移した');
  assert.match(w.note, /manchot/);
  assert.match(w.note, /別の鳥/);
});

test('manchot(w838): 動物・le・m・A2・🐧・「ペンギン」。「ペンギン」と 🐧 はこの語だけが持つ', () => {
  const w = byId('w838');
  deq(
    [w.fr, w.cat, w.art, w.g, w.level, w.emoji, w.ja],
    ['manchot', '動物', 'le', 'm', 'A2', '🐧', 'ペンギン']
  );
  assert.equal(w.ex, 'Le manchot nage très bien.');
  assert.equal(w.exJa, 'ペンギンは泳ぎがとても上手です。');
  assert.match(w.note, /pingouin/);
  assert.match(w.note, /別の鳥/);
  deq(
    WORDS.filter(x => x.emoji === '🐧').map(x => x.id),
    ['w838']
  );
  deq(
    WORDS.filter(x => [x.ja].concat(x.alt || []).some(j => /ペンギン/.test(j))).map(x => x.id),
    ['w838']
  );
});

test('ID: w01 から最後まで連番で欠番も重複もなく、manchot は既存 ID を再利用せず新しい連番を使っている', () => {
  WORDS.forEach((w, i) =>
    assert.equal(w.id, 'w' + String(i + 1).padStart(2, '0'), i + 1 + '番目の ID')
  );
  assert.ok(Number(byId('w838').id.slice(1)) === 838 && WORDS.length >= 838);
});

test('quai(w827)・garder(w760)・peau(w786): 例文と訳だけが直り、綴り・意味・冠詞・性・活用・複数形は同じ', () => {
  const q = byId('w827');
  deq([q.fr, q.ja, q.art, q.g], ['quai', 'ホーム・岸壁', 'le', 'm']);
  assert.equal(q.ex, 'Le train part du quai numéro trois.');
  assert.equal(q.exJa, '電車は3番ホームから出発します。');
  const g = byId('w760');
  deq([g.fr, g.ja, g.pos], ['garder', '預かる・取っておく', 'verb']);
  assert.equal(g.ex, 'Je garde le chat de mon amie pendant le week-end.');
  assert.equal(g.exJa, '私は週末の間、友人の猫を預かります。');
  assert.equal(
    g.forms.present,
    'je garde, tu gardes, il garde, nous gardons, vous gardez, ils gardent'
  );
  const p = byId('w786');
  deq([p.fr, p.ja, p.art, p.g], ['peau', '皮膚・肌', 'la', 'f']);
  assert.equal(p.ex, 'La peau protège le corps.');
  assert.equal(p.exJa, '皮膚は体を守ります。');
  deq(p.forms, { plural: 'peaux' });
});

test('tenir(w750): 訳だけ「持つ・つかむ・押さえる」に整理し、例文と活用形は据え置き', () => {
  const t = byId('w750');
  assert.equal(t.ja, '持つ・つかむ・押さえる');
  assert.equal(t.ex, 'Je tiens la porte.');
  assert.equal(t.exJa, '私はドアを押さえています。');
  assert.equal(
    t.forms.present,
    'je tiens, tu tiens, il tient, nous tenons, vous tenez, ils tiennent'
  );
});

test('出題: pingouin と manchot は4択が成立し、日本語訳が違うので、互いに誤答として並んでも正解は1つ', () => {
  const pool = WORDS.map(WordLib.normalize),
    [a, b] = ['w766', 'w838'].map(id => pool.find(w => w.id === id));
  [a, b].forEach(w =>
    ['toFr', 'toJa'].forEach(mode => {
      for (let i = 0; i < 50; i++)
        deq(WordLib.checkQuestion(WordLib.makeQuestion(w, mode, pool)), []);
    })
  );
  const rep = WordLib.validate(WORDS, { categories: WD.categories });
  deq(rep.errors.concat(rep.warnings).map(WordLib.formatIssue), []);
});
