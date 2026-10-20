'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WordLib = require('../src/lib/wordlib.js');
const { loadWordData } = require('../scripts/load_words.js');
const { ROOT, fixtureWords } = require('./harness.js');

const ok = over =>
  Object.assign(
    {
      id: 'x01',
      cat: '動物',
      art: 'le',
      g: 'm',
      fr: 'chat',
      ja: '猫',
      emoji: '🐱',
      kana: 'シャ',
      ex: 'Le chat dort.',
      exJa: '猫が寝ている。',
      level: 'A1'
    },
    over || {}
  );
const base = () => [
  ok({ id: 'a1' }),
  ok({ id: 'a2', fr: 'chien', ja: '犬', ex: 'Le chien joue.' }),
  ok({ id: 'a3', art: 'la', g: 'f', fr: 'vache', ja: '牛', ex: 'La vache mange.' }),
  ok({ id: 'a4', fr: 'cheval', ja: '馬', ex: 'Le cheval court.' }),
  ok({ id: 'a5', fr: 'poisson', ja: '魚', ex: 'Le poisson nage.' })
];
const errs = (list, opts) => WordLib.validate(list, opts).errors;
const has = (list, id, field, opts) =>
  errs(list, opts).some(e => e.id === id && e.field.indexOf(field) === 0);

test('構文: すべての .js が構文エラーなく読める', () => {
  const files = [
    'src/app.js',
    'data/words.js',
    'src/lib/wordlib.js',
    'scripts/validate_words.js',
    'scripts/load_words.js',
    'tests/harness.js'
  ];
  files.forEach(f =>
    assert.doesNotThrow(
      () => new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }),
      f
    )
  );
});

test('本番の words.js: 検証でエラーなし(単語を追加してもこのテストで確認される)', () => {
  const d = loadWordData();
  const r = WordLib.validate(d.words, { categories: d.categories });
  assert.deepEqual(r.errors.map(WordLib.formatIssue), []);
  console.log('    words.js: ' + d.words.length + '語 / 警告 ' + r.warnings.length + '件');
});
test('本番の words.js: 出荷時の30語のID・フランス語・冠詞・性が変わっていない(学習記録との対応を保護)', () => {
  const real = new Map(loadWordData().words.map(w => [w.id, w]));
  fixtureWords().words.forEach(f => {
    const w = real.get(f.id);
    assert.ok(w, f.id + ' が words.js から消えています(IDは変更・削除しないでください)');
    assert.deepEqual(
      [w.fr, w.art, w.g],
      [f.fr, f.art, f.g],
      f.id + ' の内容が変わっています。別の単語は新しいIDで追加してください'
    );
  });
});
test('固定フィクスチャ(既存30語)は検証でエラー・警告なし', () => {
  const d = fixtureWords(),
    r = WordLib.validate(d.words, { categories: d.categories });
  assert.equal(d.words.length, 30);
  assert.deepEqual(r.errors.map(WordLib.formatIssue), []);
  assert.deepEqual(r.warnings.map(WordLib.formatIssue), []);
});

test('正常データは検証を通る', () => assert.deepEqual(errs(base()), []));

test('エラー検出: 重複ID', () => {
  const l = base();
  l[1].id = 'a1';
  assert.ok(has(l, 'a1', 'id'));
});
test('エラー検出: IDなし/型不正/予約語/形式不正', () => {
  const l = base();
  delete l[0].id;
  assert.ok(errs(l).some(e => e.id === '#1番目' && e.field === 'id'));
  assert.ok(has([ok({ id: 5 })].concat(base().slice(1)), '#1番目', 'id'));
  assert.ok(has([ok({ id: 'constructor' })].concat(base().slice(1)), 'constructor', 'id'));
  assert.ok(has([ok({ id: '1abc' })].concat(base().slice(1)), '1abc', 'id'));
});
test('エラー検出: 必須項目(fr/ja/cat)の欠落・空', () => {
  ['fr', 'ja', 'cat'].forEach(f => {
    const l = base();
    delete l[0][f];
    assert.ok(has(l, 'a1', f), f + ' 欠落');
    const m = base();
    m[0][f] = '';
    assert.ok(has(m, 'a1', f), f + ' 空');
  });
});
test('エラー検出: 型不正', () => {
  const l = base();
  l[0].fr = 123;
  assert.ok(has(l, 'a1', 'fr'));
  const m = base();
  m[0].alt = 'ネコ';
  assert.ok(has(m, 'a1', 'alt'));
  const n = base();
  n[0].forms = [];
  assert.ok(has(n, 'a1', 'forms'));
  assert.ok(errs('x').length && errs(null).length);
  assert.ok(errs([null, 5]).filter(e => e.field === '(レコード)').length === 2);
});
test('エラー検出: カテゴリ・品詞・レベルの不正値', () => {
  const cats = ['動物', '食べ物'];
  assert.ok(
    has([ok({ id: 'a1', cat: '動物 ' })].concat(base().slice(1)), 'a1', 'cat', { categories: cats })
  );
  assert.ok(
    has([ok({ id: 'a1', cat: 'どうぶつ' })].concat(base().slice(1)), 'a1', 'cat', {
      categories: cats
    })
  );
  assert.ok(has([ok({ id: 'a1', pos: 'nouns' })].concat(base().slice(1)), 'a1', 'pos'));
  assert.ok(has([ok({ id: 'a1', level: 'A3' })].concat(base().slice(1)), 'a1', 'level'));
});
test('エラー検出: 例文と訳の片方だけ', () => {
  const l = base();
  delete l[0].exJa;
  assert.ok(has(l, 'a1', 'exJa'));
  const m = base();
  delete m[0].ex;
  assert.ok(has(m, 'a1', 'ex'));
});
test('エラー検出: 名詞の冠詞・性の不整合', () => {
  const t = (over, field) =>
    assert.ok(
      has([ok(Object.assign({ id: 'a1' }, over))].concat(base().slice(1)), 'a1', field),
      JSON.stringify(over)
    );
  t({ art: 'le', g: 'f' }, 'g');
  t({ art: 'la', g: 'm' }, 'g');
  t({ art: 'une', g: 'm' }, 'g');
  t({ art: '', g: 'm' }, 'art');
  t({ art: 'le', g: '' }, 'g');
  t({ art: 'lo', g: 'm' }, 'art');
  t({ art: "l'", g: 'm', fr: 'chat' }, 'art');
  const w = WordLib.validate(
    [ok({ id: 'a1', art: 'le', g: 'm', fr: 'oiseau' })].concat(base().slice(1))
  );
  assert.ok(
    w.warnings.some(x => x.id === 'a1' && x.field === 'art'),
    '母音+le は警告'
  );
  assert.deepEqual(
    errs(
      [ok({ id: 'a1', art: "l'", g: 'f', fr: 'eau', ex: "Je bois de l'eau." })].concat(
        base().slice(1)
      )
    ),
    []
  );
  assert.ok(
    has(
      [ok({ id: 'a1', pos: 'adjective', art: 'le', g: 'm' })].concat(base().slice(1)),
      'a1',
      'art'
    ),
    '名詞以外に冠詞'
  );
});
test('エラー検出: fr/ja の取り違え・HTML文字・前後空白', () => {
  assert.ok(has([ok({ id: 'a1', fr: '猫', ja: 'chat' })].concat(base().slice(1)), 'a1', 'fr'));
  assert.ok(has([ok({ id: 'a1', fr: 'ch<at' })].concat(base().slice(1)), 'a1', 'fr'));
  assert.ok(has([ok({ id: 'a1', ja: ' 猫' })].concat(base().slice(1)), 'a1', 'ja'));
});
test('エラー検出: 4語未満では出題できない / 出題が成立しない(同じ訳の語ばかり)', () => {
  assert.ok(errs(base().slice(0, 3)).some(e => e.field === 'WORDS'));
  // 全語が同じ日本語訳 → 仏→日の誤答を作れない
  const same = base().map((w, i) => Object.assign(w, { ja: '猫', alt: [] }));
  assert.ok(errs(same).some(e => e.field.indexOf('quiz') === 0));
});
test('エラーには単語ID・フィールド名・原因が含まれる', () => {
  const l = base();
  l[2].g = 'm';
  const e = errs(l)[0];
  assert.equal(e.id, 'a3');
  assert.equal(e.field, 'g');
  assert.match(WordLib.formatIssue(e), /^\[a3\] g: .+/);
});
test('警告: 未知フィールド・pos/level未指定・日本語訳の重複', () => {
  const l = base();
  l[0].exJA = 'x';
  l[1].ja = '猫';
  delete l[2].level;
  const w = WordLib.validate(l).warnings;
  assert.ok(w.some(x => x.id === 'a1' && x.field === 'exJA'));
  assert.ok(w.some(x => x.id === 'a2' && x.field === 'ja'));
  assert.ok(w.some(x => x.id === 'a3' && x.field === 'level'));
});
test('拡張フィールド(alt/syn/forms/note/ipa/pos/level)は許容され、名詞以外は冠詞なしで通る', () => {
  const l = base().concat([
    {
      id: 'v1',
      cat: '動物',
      fr: 'manger',
      ja: '食べる',
      pos: 'verb',
      level: 'A1',
      forms: { present: { je: 'mange', tu: 'manges' } },
      note: '-er動詞',
      ex: 'Je mange.',
      exJa: '私は食べる。'
    },
    {
      id: 'j1',
      cat: '動物',
      fr: 'petit',
      ja: '小さい',
      pos: 'adjective',
      level: 'A1',
      forms: { fem: 'petite', plural: ['petits'] },
      alt: ['ちいさい'],
      syn: ['minuscule'],
      ipa: '/pəti/'
    }
  ]);
  assert.deepEqual(errs(l), []);
  l[6].forms.fem = 3;
  assert.ok(has(l, 'j1', 'forms.fem'));
});

/* ---- 出題生成 ---- */
test('出題: 本番の全単語・全方向で 4択・重複なし・正解1つ(学習状況が違っても成立)', () => {
  const words = Array.from(loadWordData().words, WordLib.normalize);
  for (const learned of [() => true, () => false, w => w.id < 'w10', w => w.cat === '動物']) {
    for (const w of words)
      for (const mode of ['toFr', 'toJa']) {
        for (let r = 0; r < 5; r++)
          assert.deepEqual(
            WordLib.checkQuestion(WordLib.makeQuestion(w, mode, words, { isLearned: learned })),
            [],
            w.id + mode
          );
      }
  }
});
test('出題: 学習済み・同カテゴリの語を優先し、足りなければ未学習語で補う', () => {
  const words = Array.from(fixtureWords().words, WordLib.normalize);
  const learnedIds = new Set(['w08', 'w09', 'w10', 'w11', 'w14']); // 動物4 + 食べ物1
  const cat = w => w.cat,
    target = words.find(w => w.id === 'w08');
  for (let r = 0; r < 50; r++) {
    const q = WordLib.makeQuestion(target, 'toJa', words, { isLearned: w => learnedIds.has(w.id) });
    const ids = q.opts.filter(o => !o.ok).map(o => o.id);
    assert.deepEqual(
      ids.slice().sort(),
      ['w09', 'w10', 'w11'].sort(),
      '学習済み同カテゴリが先に選ばれる'
    );
  }
  // 学習済みが自分だけ → 未学習語で補って4択を作る
  const q = WordLib.makeQuestion(target, 'toFr', words, { isLearned: w => w.id === 'w08' });
  assert.deepEqual(WordLib.checkQuestion(q), []);
  // 学習済みが2語 (自分+1): 学習済みの1語は必ず含まれる
  for (let r = 0; r < 30; r++)
    assert.ok(
      WordLib.makeQuestion(target, 'toJa', words, {
        isLearned: w => w.id === 'w08' || w.id === 'w14'
      }).opts.some(o => o.id === 'w14')
    );
});
test('出題: 同じ訳(別訳含む)の語は誤答に並ばない / 候補が少なくても重複しない', () => {
  const ws = [
    ok({ id: 'p1', fr: 'chat', ja: '猫', alt: ['ネコ'] }),
    ok({ id: 'p2', fr: 'matou', ja: 'ネコ' }),
    ok({ id: 'p3', fr: 'chien', ja: '犬' }),
    ok({ id: 'p4', fr: 'cheval', ja: '馬' }),
    ok({ id: 'p5', fr: 'vache', ja: '牛' }),
    ok({ id: 'p6', fr: 'chat', ja: '猫', id2: 1 })
  ].map(WordLib.normalize);
  for (let r = 0; r < 100; r++)
    for (const mode of ['toFr', 'toJa']) {
      const q = WordLib.makeQuestion(ws[0], mode, ws);
      assert.deepEqual(WordLib.checkQuestion(q), []);
      assert.ok(
        !q.opts.some(o => o.id === 'p2' || o.id === 'p6'),
        '同訳語(p2)・同表記(p6)は誤答にならない'
      );
    }
  const small = ws.slice(2, 4); // 候補1つだけ → 2択になる(重複・欠落なし)
  const q = WordLib.makeQuestion(small[0], 'toJa', small);
  assert.equal(q.opts.length, 2);
  assert.equal(q.opts.filter(o => o.ok).length, 1);
  assert.equal(WordLib.makeQuestion(small[0], 'toJa', [small[0]]), null);
});

/* ---- 検索・絞り込み・ページ ---- */
test('検索: 大文字小文字・アクセント・全角半角・カナ種を区別しない。複数語はAND', () => {
  const words = Array.from(fixtureWords().words, WordLib.normalize),
    ids = q => Array.from(WordLib.search(words, q), w => w.id);
  assert.deepEqual(ids('CAFÉ'), ['w05', 'w21'], '単語と例文(w05)の両方');
  assert.deepEqual(ids('cafe'), ['w05', 'w21']);
  assert.ok(ids('gateau').includes('w19'));
  assert.ok(ids('GÂTEAU').includes('w19'));
  assert.ok(ids('猫').includes('w08'));
  assert.ok(ids('ありがと').includes('w02'));
  assert.ok(ids('こんにちは').includes('w01'));
  assert.ok(ids('こーひー').includes('w21'), 'ひらがな↔カタカナ');
  assert.ok(ids('ｺｰﾋｰ').includes('w21'), '半角カナ');
  assert.ok(ids('s’il').includes('w05'), '曲線アポストロフィ');
  assert.ok(ids('le chat').includes('w08'));
  assert.ok(ids('jardin').includes('w09'), '例文');
  assert.ok(ids('庭で').includes('w09'), '例文訳');
  assert.deepEqual(ids('chat 猫'), ['w08']);
  assert.equal(ids('').length, 30);
  assert.equal(ids('zzzz').length, 0);
});
test('ページ分割: 範囲外の指定は丸める', () => {
  const a = Array.from({ length: 95 }, (_, i) => i);
  assert.deepEqual(
    [
      WordLib.paginate(a, 0, 30).items.length,
      WordLib.paginate(a, 3, 30).items.length,
      WordLib.paginate(a, 4, 30).page,
      WordLib.paginate(a, -2, 30).page,
      WordLib.paginate([], 5, 30).pages
    ],
    [30, 5, 3, 0, 1]
  );
});
test('大量データ(3000語)の検証・出題が現実的な時間で終わる', () => {
  const { synthWords } = require('./harness.js');
  const ctx = vm.createContext({});
  vm.runInContext(synthWords(3000), ctx);
  const words = vm.runInContext('WORDS', ctx),
    cats = vm.runInContext('CATEGORIES', ctx);
  const t0 = Date.now(),
    r = WordLib.validate(words, { categories: cats }),
    ms = Date.now() - t0;
  assert.deepEqual(r.errors.map(WordLib.formatIssue).slice(0, 3), []);
  console.log('    3000語の全検証(出題テスト含む): ' + ms + 'ms');
  assert.ok(ms < 8000);
  const t1 = Date.now(),
    p = WordLib.prepare(words, { categories: cats });
  console.log('    3000語の起動時prepare: ' + (Date.now() - t1) + 'ms');
  assert.equal(p.words.length, 3000);
});
