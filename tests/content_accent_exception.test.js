'use strict';
// mais(w134・接続詞「しかし」)と maïs(w255・名詞 le maïs「とうもろこし」)は、
// アクセント記号だけが違う、意味の異なる正当な単語。CONTENT_GUIDE §3 の「アクセントだけが違う語は同時に登録しない」
// の例外として、この2語だけを認める。ここは、その例外が「この2語だけ」であること、
// 2語が検索・出題・学習記録で区別できて壊れないことを確認する回帰テスト。
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWordData } = require('../scripts/load_words.js');
const WordLib = require('../src/lib/wordlib.js');
const { bootP } = require('./phrase_boot.js');

const deq = assert.deepEqual;
const plain = x => JSON.parse(JSON.stringify(x));
const WD = plain(loadWordData()),
  WORDS = WD.words;
const KEY = 'kotoba-monster-v1';
const byId = id => WORDS.find(w => w.id === id);
const MAIS = byId('w134'),
  MAIS_MAIS = byId('w255');
// 再現できる乱数(mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('例外は2語だけ: アクセントを無視すると同じ綴りになる語の組は、mais(w134)と maïs(w255)の1組のみ', () => {
  const groups = {};
  WORDS.forEach(
    w => (groups[WordLib.fold(w.fr)] = (groups[WordLib.fold(w.fr)] || []).concat(w.id))
  );
  const dup = Object.values(groups).filter(ids => ids.length > 1);
  deq(
    dup,
    [['w134', 'w255']],
    'アクセントだけが違う語を足すときは、この例外の扱いを docs/CONTENT_GUIDE.md で決めてから'
  );
});

test('2語は削除・変更されていない: ID・位置・綴り・意味・品詞・冠詞・性・絵文字', () => {
  assert.equal(
    WORDS.findIndex(w => w.id === 'w134'),
    133,
    'w134 の位置(並び順)'
  );
  assert.equal(
    WORDS.findIndex(w => w.id === 'w255'),
    254,
    'w255 の位置(並び順)'
  );
  deq(
    [MAIS.fr, MAIS.ja, MAIS.pos, MAIS.art || '', MAIS.g || '', MAIS.cat, MAIS.level],
    ['mais', 'しかし', 'conjunction', '', '', '疑問詞・前置詞・接続詞', 'A1']
  );
  deq(
    [
      MAIS_MAIS.fr,
      MAIS_MAIS.ja,
      MAIS_MAIS.pos || 'noun',
      MAIS_MAIS.art,
      MAIS_MAIS.g,
      MAIS_MAIS.emoji
    ],
    ['maïs', 'とうもろこし', 'noun', 'le', 'm', '🌽']
  );
});

test('検索のアクセント無視は維持: fold は mais と maïs を同じにし、どちらで検索しても2語とも見つかる', () => {
  assert.equal(WordLib.fold('maïs'), WordLib.fold('mais'));
  assert.equal(WordLib.fold('MAÏS'), 'mais');
  ['mais', 'maïs', 'MAIS'].forEach(q => {
    const ids = WordLib.search(WORDS.map(WordLib.normalize), q).map(w => w.id);
    assert.ok(ids.includes('w134') && ids.includes('w255'), q + ' で2語とも見つかる');
  });
  // 日本語訳での検索では、それぞれの語だけが見つかる(区別できる)
  const ja = q =>
    WordLib.search(WORDS.map(WordLib.normalize), q)
      .map(w => w.id)
      .filter(id => id === 'w134' || id === 'w255');
  deq(ja('しかし'), ['w134']);
  deq(ja('とうもろこし'), ['w255']);
});

test('検証: 既存の検証ルールで、この2語に起因するエラー・警告は出ない(表示形は mais と le maïs で別)', () => {
  const rep = WordLib.validate(WORDS, { categories: WD.categories });
  deq(rep.errors.concat(rep.warnings).map(WordLib.formatIssue), []);
  const n = WordLib.normalize;
  assert.notEqual(WordLib.display(n(MAIS)), WordLib.display(n(MAIS_MAIS)));
  assert.equal(WordLib.display(n(MAIS)), 'mais');
  assert.equal(WordLib.display(n(MAIS_MAIS)), 'le maïs');
});

test('出題: 2語は、日→仏・仏→日のどちらでも区別でき、同じ問題に並んでも正解は1つだけ', () => {
  const pool = WORDS.map(WordLib.normalize);
  const [m1, m2] = [MAIS, MAIS_MAIS].map(WordLib.normalize);
  const expect = {
    w134: { toFr: 'mais', toJa: 'しかし' },
    w255: { toFr: 'le maïs', toJa: 'とうもろこし' }
  };
  for (let seed = 1; seed <= 200; seed++) {
    [m1, m2].forEach(w =>
      ['toFr', 'toJa'].forEach(mode => {
        const q = WordLib.makeQuestion(w, mode, pool, { rng: rng(seed) });
        deq(WordLib.checkQuestion(q), [], w.id + ' ' + mode + ' seed' + seed);
        const ok = q.opts.filter(o => o.ok);
        assert.equal(ok.length, 1);
        assert.equal(ok[0].t, expect[w.id][mode]);
        assert.equal(ok[0].id, w.id);
      })
    );
  }
  // 2語が同じ問題に並ぶ場合(選択肢の候補を、この2語と別の2語だけにして強制する)
  const others = ['donc', 'car'].map(fr => pool.find(w => w.fr === fr));
  const small = [m1, m2].concat(others);
  [m1, m2].forEach(w => {
    ['toFr', 'toJa'].forEach(mode => {
      const q = WordLib.makeQuestion(w, mode, small, { rng: rng(7) });
      deq(WordLib.checkQuestion(q), []);
      const other = w.id === 'w134' ? 'w255' : 'w134';
      assert.ok(
        q.opts.some(o => o.id === other && !o.ok),
        '相手の語が、誤答の選択肢として並ぶ'
      );
      assert.equal(new Set(q.opts.map(o => o.t)).size, 4, '選択肢の表示が重複しない');
      assert.equal(q.opts.filter(o => o.ok).length, 1);
    });
  });
});

test('互換: 2語の学習記録が、教材を読み込んでも消えず・変わらず、習熟度も保たれる(保存形式・キーは変わらない)', () => {
  const DAY = 86400000,
    now = Date.now();
  const M = () => ({ lv: 2, n: 2, ok: 2, ng: 0, st: 2, last: 1, due: now + 30 * DAY });
  const T = () => ({ n: 0, ok: 0, ng: 0, last: null });
  const tt = () => ({ ja2fr: T(), img2fr: T(), fr2ja: T(), aud2ja: T() });
  const rec = () => ({ intro: 1, d: { p: M(), r: M() }, t: tt() });
  const raw = JSON.stringify({
    v: 4,
    xp: 40,
    best: 2,
    w: { w134: rec(), w255: rec() },
    ph: {},
    pbest: 0,
    pd: { d: '', xp: 0 }
  });
  const g = bootP({ storage: { [KEY]: raw } });
  const st = g.k.state();
  deq(
    Object.keys(st.w).sort(),
    ['w134', 'w255'],
    '2語の記録が残る(教材にあるIDなので捨てられない)'
  );
  deq(plain(st.w), JSON.parse(raw).w, '記録の内容が変わっていない');
  assert.equal(st.best, 2);
  assert.equal(st.xp, 40);
  const status = id => g.k.status(g.k.vocab.find(w => w.id === id));
  assert.equal(status('w134'), 'mastered');
  assert.equal(status('w255'), 'mastered');
  assert.equal(g.store[KEY], raw, '起動しただけでは保存データを書き換えない');
  assert.ok(!Object.keys(g.store).some(k => k.startsWith(KEY + '-')), '退避キーも作られない');
});
