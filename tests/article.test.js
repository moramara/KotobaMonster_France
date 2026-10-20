'use strict';
// 冠詞の省略(le/la → l')判定のテスト: 正常系・例外系・「判定しない」系
const test = require('node:test');
const assert = require('node:assert/strict');
const WordLib = require('../src/lib/wordlib.js');
const { loadWordData } = require('../scripts/load_words.js');

const lv = (art, fr) => WordLib.checkArticle(art, fr).level;
const rec = over =>
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
const others = () => [
  rec({ id: 'a2', fr: 'chien', ja: '犬', ex: 'Le chien joue.' }),
  rec({ id: 'a3', fr: 'cheval', ja: '馬', ex: 'Le cheval court.' }),
  rec({ id: 'a4', fr: 'poisson', ja: '魚', ex: 'Le poisson nage.' }),
  rec({ id: 'a5', art: 'la', g: 'f', fr: 'vache', ja: '牛', ex: 'La vache mange.' })
];
const artIssues = r => {
  const rep = WordLib.validate([r].concat(others()));
  return {
    errors: rep.errors.filter(e => e.id === r.id && e.field === 'art'),
    warnings: rep.warnings.filter(w => w.id === r.id && w.field === 'art')
  };
};

/* ---- 正常系 ---- */
test("冠詞: 子音の語は le/la、母音の語は l' が正しい", () => {
  ['chat', 'table', 'pomme', 'livre', 'clé'].forEach(f => {
    assert.equal(lv('le', f), 'ok', f);
    assert.equal(lv('la', f), 'ok', f);
  });
  ['oiseau', 'eau', 'école', 'âne', 'œuf', 'île', 'été', 'ours'].forEach(f =>
    assert.equal(lv("l'", f), 'ok', f)
  );
});
test("冠詞: 無音のh は l'、有音のh は le/la が正しい(辞書にある語)", () => {
  [
    'homme',
    'heure',
    'hôtel',
    'hôpital',
    'histoire',
    'herbe',
    'hiver',
    'huile',
    'hélicoptère'
  ].forEach(f => {
    assert.equal(lv("l'", f), 'ok', f);
    assert.equal(lv('le', f), 'warn', 'le ' + f);
    assert.equal(lv('la', f), 'warn', 'la ' + f);
  });
  ['haricot', 'héros', 'hibou', 'homard', 'honte', 'hache', 'hasard', 'hamster', 'huit'].forEach(
    f => {
      assert.equal(lv('le', f), 'ok', f);
      assert.equal(lv('la', f), 'ok', f);
      assert.equal(lv("l'", f), 'warn', "l' " + f);
    }
  );
});
test('冠詞: un/une/les/des は省略しないので、母音・h・y のどの語でも誤警告を出さない', () => {
  ['ami', 'oiseau', 'homme', 'haricot', 'yaourt', 'ytterbium', 'hippocampe'].forEach(f =>
    ['un', 'une', 'les', 'des'].forEach(a => assert.equal(lv(a, f), 'ok', a + ' ' + f))
  );
  assert.deepEqual(
    artIssues(rec({ id: 'u1', art: 'un', g: 'm', fr: 'ami', ja: '友だち', ex: 'Un ami arrive.' })),
    { errors: [], warnings: [] },
    'un ami は正しい'
  );
  assert.deepEqual(
    artIssues(
      rec({ id: 'u2', art: 'une', g: 'f', fr: 'amie', ja: '女友だち', ex: 'Une amie arrive.' })
    ),
    { errors: [], warnings: [] }
  );
});
test('冠詞: 大文字・アクセントの分解形・前後の空白・複合語でも同じ結果', () => {
  assert.equal(lv("l'", 'Hôtel'), 'ok');
  assert.equal(lv("l'", 'Ho\u0302tel'), 'ok', '分解形');
  assert.equal(lv('le', 'HÉROS'), 'ok');
  assert.equal(lv("l'", 'Oiseau'), 'ok');
  assert.equal(lv('le', ' chat '), 'ok');
  assert.equal(lv('le', 'Hôtel de ville'), 'warn', '複合語は先頭の語で判定');
  assert.equal(lv('le', 'hot-dog'), 'ok');
  assert.equal(lv("l'", 'hot-dog'), 'warn');
});

/* ---- 例外系 ---- */
test("例外: yaourt は le yaourt も l'yaourt も誤警告にしない(y は母音扱いしない)", () => {
  assert.equal(lv('le', 'yaourt'), 'ok');
  assert.equal(lv("l'", 'yaourt'), 'ok');
  assert.deepEqual(
    artIssues(rec({ id: 'y1', fr: 'yaourt', ja: 'ヨーグルト', ex: 'Le yaourt est frais.' })),
    { errors: [], warnings: [] }
  );
  assert.deepEqual(
    artIssues(
      rec({ id: 'y2', art: "l'", fr: 'yaourt', ja: 'ヨーグルト', ex: "L'yaourt est frais." })
    ),
    { errors: [], warnings: [] }
  );
});
test('例外: 母音字・y で始まるのに省略しない語(onze, oui, yacht, yoga ...)で le/la を誤警告にしない', () => {
  ['onze', 'oui', 'yacht', 'yoga', 'yen', 'yoyo', 'yourte'].forEach(f => {
    assert.equal(lv('le', f), 'ok', 'le ' + f);
    assert.equal(lv("l'", f), 'warn', "l' " + f);
  });
  assert.equal(lv('la', 'une'), 'ok');
  assert.equal(lv('la', 'ouate'), 'ok');
  assert.equal(lv("l'", 'ouate'), 'ok', '両方の形が通用する語は判定しない');
});

/* ---- 誤り(確実なもの・辞書に基づくもの) ---- */
test("誤り: 子音で始まる語の l' はエラー(確実)。母音の語の le/la は警告", () => {
  assert.equal(lv("l'", 'chat'), 'error');
  assert.equal(lv("l'", 'table'), 'error');
  assert.equal(lv("l'", 'wagon'), 'error');
  assert.equal(lv('le', 'oiseau'), 'warn');
  assert.equal(lv('la', 'eau'), 'warn');
  assert.ok(
    artIssues(rec({ id: 'e1', art: "l'", fr: 'chat' })).errors.length === 1,
    'validate でもエラー'
  );
  assert.ok(
    artIssues(rec({ id: 'e2', art: 'le', fr: 'oiseau', ex: 'Le oiseau chante.' })).warnings
      .length === 1,
    'validate では警告'
  );
});
test("誤り: 辞書に基づく指摘(有音のhに l'、無音のhに le)は警告であってエラーではない(単語を除外しない)", () => {
  const a = artIssues(
    rec({ id: 'h1', art: "l'", fr: 'haricot', ja: '豆', ex: "L'haricot est vert." })
  );
  assert.equal(a.errors.length, 0);
  assert.equal(a.warnings.length, 1);
  const b = artIssues(
    rec({ id: 'h2', art: 'le', fr: 'homme', ja: '男の人', ex: 'Le homme est grand.' })
  );
  assert.equal(b.errors.length, 0);
  assert.equal(b.warnings.length, 1);
  assert.equal(
    WordLib.prepare([rec({ id: 'h1', art: "l'", fr: 'haricot' })].concat(others())).excluded,
    0,
    '警告だけの単語はゲームから除外されない'
  );
});
test("正しい h の語(l'homme / le haricot)は、以前は出ていた警告が出ない", () => {
  assert.deepEqual(
    artIssues(rec({ id: 'k1', art: "l'", fr: 'homme', ja: '男の人', ex: "L'homme est grand." })),
    { errors: [], warnings: [] }
  );
  assert.deepEqual(
    artIssues(rec({ id: 'k2', art: 'le', fr: 'haricot', ja: '豆', ex: 'Le haricot est vert.' })),
    { errors: [], warnings: [] }
  );
});

/* ---- 判定しない(情報不足) ---- */
test("判定不能: 辞書にない h / y 始まりの語は、le でも l' でも正誤を断定しない(エラーも警告も出さない)", () => {
  ['hippocampe', 'hérésie', 'ytterbium', 'yttrium', 'yeuse'].forEach(f =>
    ['le', 'la', "l'"].forEach(a => assert.equal(lv(a, f), 'unknown', a + ' ' + f))
  );
  ['le', "l'"].forEach(a =>
    assert.deepEqual(
      artIssues(
        rec({ id: 'q1', art: a, fr: 'hippocampe', ja: 'タツノオトシゴ', ex: 'Voici hippocampe.' })
      ),
      { errors: [], warnings: [] },
      a
    )
  );
  assert.equal(WordLib.checkArticle('le', 'ytterbium').level, 'unknown');
  assert.ok(WordLib.checkArticle('le', 'ytterbium').message.length > 0, '判定できない理由を返す');
});
test('判定不能: 語が空・非文字列のときも断定しない(例外を投げない)', () => {
  [undefined, null, '', '  ', 5, {}].forEach(f =>
    assert.doesNotThrow(() => assert.equal(lv('le', f), 'unknown'))
  );
  assert.equal(lv(undefined, 'chat'), 'unknown');
  assert.equal(lv('le', undefined), 'unknown');
});
test('elisionOf: 辞書・規則・判定不能の区別', () => {
  assert.deepEqual(WordLib.elisionOf('homme'), { allow: 'elide', basis: 'dict' });
  assert.deepEqual(WordLib.elisionOf('héros'), { allow: 'noelide', basis: 'dict' });
  assert.deepEqual(WordLib.elisionOf('yaourt'), { allow: 'both', basis: 'dict' });
  assert.deepEqual(WordLib.elisionOf('chat'), { allow: 'noelide', basis: 'rule' });
  assert.deepEqual(WordLib.elisionOf('arbre'), { allow: 'elide', basis: 'rule' });
  assert.equal(WordLib.elisionOf('hippocampe').allow, 'unknown');
});

/* ---- 既存データ・既存挙動 ---- */
test("本番の words.js: 冠詞の判定で警告もエラーも出ない(l'oiseau / l'eau を含む)", () => {
  const d = loadWordData(),
    rep = WordLib.validate(d.words, { categories: d.categories });
  assert.deepEqual(
    rep.errors
      .concat(rep.warnings)
      .filter(x => x.field === 'art')
      .map(WordLib.formatIssue),
    []
  );
  d.words.filter(w => w.art).forEach(w => assert.equal(lv(w.art, w.fr), 'ok', w.id));
});
test('既存の冠詞・性の矛盾検出は維持される(le+f / la+m / une+m / 不正な冠詞 / 非名詞の冠詞)', () => {
  const l = over =>
    WordLib.validate([rec(Object.assign({ id: 'a1' }, over))].concat(others()))
      .errors.filter(e => e.id === 'a1')
      .map(e => e.field);
  assert.ok(l({ art: 'le', g: 'f' }).includes('g'));
  assert.ok(l({ art: 'la', g: 'm' }).includes('g'));
  assert.ok(l({ art: 'une', g: 'm' }).includes('g'));
  assert.ok(l({ art: 'lo', g: 'm' }).includes('art'));
  assert.ok(l({ pos: 'adjective', art: 'le', g: 'm' }).includes('art'));
});
