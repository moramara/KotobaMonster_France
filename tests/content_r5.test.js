'use strict';
// 教材拡充(第5弾: 単語 w738〜w837 の100語)のテスト。content_r4.test.js と同じ方針。
// 範囲・不変 : 追加分が連番で末尾にあり、それまでの737語は ID・内容・並び順とも変わっていない
// 正確さ     : 名詞の冠詞と性・動詞の活用・数詞・形容詞の性数・複数形を、データとは独立した正解表で確認する
// 検証・出題 : 既存の検証ルールに違反せず、4択問題が両方向で成立する。語数の増加で進化・称号の目標が現れる
// フランス語の自然さの人による確認の代わりにはならない。機械的に確認できる範囲を扱う。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadWordData } = require('../scripts/load_words.js');
const WordLib = require('../src/lib/wordlib.js');
const Growth = require('../src/lib/growth.js');

const deq = assert.deepEqual;
// vm で読み込んだデータは別の実行環境のものなので、厳密比較のために素のデータに直す
const plain = x => JSON.parse(JSON.stringify(x));
const WD = plain(loadWordData()),
  WORDS = WD.words;
const FIRST = 738,
  LAST = 837;
const num = w => Number(w.id.slice(1));
const NEW = WORDS.filter(w => num(w) >= FIRST && num(w) <= LAST);
const byFr = fr => NEW.find(w => w.fr === fr);
const posOf = w => w.pos || (w.art || w.g ? 'noun' : '');

test('範囲: 単語100語(w738〜w837)が連番で、第4弾の直後の末尾に並んでいる', () => {
  assert.equal(NEW.length, 100);
  deq(
    WORDS.slice(FIRST - 1, LAST).map(w => w.id),
    Array.from({ length: LAST - FIRST + 1 }, (_, i) => 'w' + (FIRST + i))
  );
  assert.equal(new Set(WORDS.map(w => w.id)).size, WORDS.length, 'ID の重複なし');
});

test('不変: 追加前の737語は、ID・カテゴリ・冠詞・性・フランス語・日本語訳・品詞・レベル・並び順とも変わっていない', () => {
  const snap = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'words_before_r5.json'), 'utf8')
  ).words;
  assert.equal(snap.length, 737);
  deq(
    WORDS.slice(0, 737).map(w => ({
      id: w.id,
      cat: w.cat,
      art: w.art || '',
      g: w.g || '',
      fr: w.fr,
      ja: w.ja,
      pos: w.pos || 'noun',
      level: w.level || ''
    })),
    snap
  );
});

test('形式: 必須項目が空でなく、カテゴリは登録済み、レベルは A1 / A2。新しいカテゴリは作っていない', () => {
  NEW.forEach(w => {
    ['fr', 'ja', 'cat', 'ex', 'exJa'].forEach(f =>
      assert.ok(typeof w[f] === 'string' && w[f].trim(), w.id + ' ' + f)
    );
    assert.ok(WD.categories.includes(w.cat), w.id + ' のカテゴリ ' + w.cat);
    assert.ok(['A1', 'A2'].includes(w.level), w.id + ' のレベル');
    assert.ok(w.pos || (w.art && w.g), w.id + ' は品詞(名詞は冠詞と性)がある');
    if (w.kana) assert.match(w.kana, /^[\u30A0-\u30FF\s]+$/, w.id + ' の発音はカタカナ');
  });
  assert.equal(WD.categories.length, 19);
  const lv = {};
  NEW.forEach(w => (lv[w.level] = (lv[w.level] || 0) + 1));
  assert.ok(lv.A1 >= 20 && lv.A2 >= 20, JSON.stringify(lv));
});

test("正確さ: 名詞の冠詞と性(l'+母音・無音のh、有音のh の le haricot、性を取り違えやすい語を含む)", () => {
  const T = {
    fois: ['la', 'f'],
    animal: ["l'", 'm'],
    tigre: ['le', 'm'],
    girafe: ['la', 'f'],
    panda: ['le', 'm'],
    pingouin: ['le', 'm'],
    fourmi: ['la', 'f'],
    araignée: ["l'", 'f'],
    escargot: ["l'", 'm'],
    requin: ['le', 'm'],
    chèvre: ['la', 'f'],
    fruit: ['le', 'm'],
    boisson: ['la', 'f'],
    nourriture: ['la', 'f'],
    bonbon: ['le', 'm'],
    ananas: ["l'", 'm'],
    noix: ['la', 'f'],
    haricot: ['le', 'm'],
    chou: ['le', 'm'],
    saumon: ['le', 'm'],
    sauce: ['la', 'f'],
    goût: ['le', 'm'],
    recette: ['la', 'f'],
    gorge: ['la', 'f'],
    cou: ['le', 'm'],
    peau: ['la', 'f'],
    sang: ['le', 'm'],
    lèvre: ['la', 'f'],
    dentiste: ['le', 'm'],
    accident: ["l'", 'm'],
    blessure: ['la', 'f'],
    grippe: ['la', 'f'],
    sommeil: ['le', 'm'],
    allergie: ["l'", 'f'],
    rêve: ['le', 'm'],
    frigo: ['le', 'm'],
    four: ['le', 'm'],
    'machine à laver': ['la', 'f'],
    rideau: ['le', 'm'],
    serviette: ['la', 'f'],
    'brosse à dents': ['la', 'f'],
    dentifrice: ['le', 'm'],
    casserole: ['la', 'f'],
    tiroir: ['le', 'm'],
    tableau: ['le', 'm'],
    élève: ["l'", 'm'],
    exercice: ["l'", 'm'],
    texte: ['le', 'm'],
    histoire: ["l'", 'f'],
    science: ['la', 'f'],
    bibliothèque: ['la', 'f'],
    patron: ['le', 'm'],
    salaire: ['le', 'm'],
    emploi: ["l'", 'm'],
    ingénieur: ["l'", 'm'],
    chef: ['le', 'm'],
    'carte postale': ['la', 'f'],
    autoroute: ["l'", 'f'],
    trottoir: ['le', 'm'],
    circulation: ['la', 'f'],
    village: ['le', 'm'],
    capitale: ['la', 'f'],
    frontière: ['la', 'f'],
    visite: ['la', 'f'],
    tour: ['la', 'f'],
    tente: ['la', 'f'],
    quai: ['le', 'm'],
    vêtement: ['le', 'm'],
    'sac à dos': ['le', 'm'],
    gant: ['le', 'm'],
    ceinture: ['la', 'f'],
    chaussette: ['la', 'f'],
    poche: ['la', 'f'],
    bouton: ['le', 'm'],
    bague: ['la', 'f'],
    sandale: ['la', 'f']
  };
  deq(
    NEW.filter(w => posOf(w) === 'noun')
      .map(w => w.fr)
      .sort(),
    Object.keys(T).sort()
  );
  Object.keys(T).forEach(fr => deq([byFr(fr).art, byFr(fr).g], T[fr], fr + ' の冠詞・性'));
});

test('正確さ: 複数形が不規則・特別な語(animal→animaux、peau→peaux、chou→choux、複合語の複数形)', () => {
  const P = {
    animal: 'animaux',
    fruit: 'fruits',
    bonbon: 'bonbons',
    haricot: 'haricots',
    chou: 'choux',
    peau: 'peaux',
    lèvre: 'lèvres',
    rêve: 'rêves',
    'machine à laver': 'machines à laver',
    rideau: 'rideaux',
    'brosse à dents': 'brosses à dents',
    tableau: 'tableaux',
    'carte postale': 'cartes postales',
    vêtement: 'vêtements',
    'sac à dos': 'sacs à dos',
    gant: 'gants',
    chaussette: 'chaussettes',
    sandale: 'sandales'
  };
  Object.keys(P).forEach(fr => deq(byFr(fr).forms, { plural: P[fr] }, fr + ' の複数形'));
});

test('正確さ: 動詞は不定詞で登録し、現在形6人称の活用が正しい(é→è の変化・不規則活用を含む)', () => {
  const T = {
    répéter: 'je répète, tu répètes, il répète, nous répétons, vous répétez, ils répètent',
    compter: 'je compte, tu comptes, il compte, nous comptons, vous comptez, ils comptent',
    tenir: 'je tiens, tu tiens, il tient, nous tenons, vous tenez, ils tiennent',
    suivre: 'je suis, tu suis, il suit, nous suivons, vous suivez, ils suivent',
    réfléchir:
      'je réfléchis, tu réfléchis, il réfléchit, nous réfléchissons, vous réfléchissez, ils réfléchissent',
    espérer: "j'espère, tu espères, il espère, nous espérons, vous espérez, ils espèrent",
    dessiner: 'je dessine, tu dessines, il dessine, nous dessinons, vous dessinez, ils dessinent',
    rêver: 'je rêve, tu rêves, il rêve, nous rêvons, vous rêvez, ils rêvent',
    réparer: 'je répare, tu répares, il répare, nous réparons, vous réparez, ils réparent',
    casser: 'je casse, tu casses, il casse, nous cassons, vous cassez, ils cassent',
    allumer: "j'allume, tu allumes, il allume, nous allumons, vous allumez, ils allument",
    éteindre: "j'éteins, tu éteins, il éteint, nous éteignons, vous éteignez, ils éteignent",
    garder: 'je garde, tu gardes, il garde, nous gardons, vous gardez, ils gardent',
    rendre: 'je rends, tu rends, il rend, nous rendons, vous rendez, ils rendent'
  };
  deq(
    NEW.filter(w => w.pos === 'verb')
      .map(w => w.fr)
      .sort(),
    Object.keys(T).sort()
  );
  Object.keys(T).forEach(fr => {
    const w = byFr(fr);
    assert.ok(/(er|ir|re|oir)$/.test(w.fr), fr + ' は不定詞');
    assert.equal(w.art || '', '');
    assert.equal(w.forms.present, T[fr], fr + ' の現在形');
  });
});

test('正確さ: 数詞(13〜19・70・80・90)と形容詞 clair。冠詞・性をもたず、品詞・日本語訳が合っている', () => {
  const N = {
    treize: '13・十三',
    quatorze: '14・十四',
    seize: '16・十六',
    'dix-sept': '17・十七',
    'dix-huit': '18・十八',
    'dix-neuf': '19・十九',
    'soixante-dix': '70・七十',
    'quatre-vingts': '80・八十',
    'quatre-vingt-dix': '90・九十'
  };
  deq(
    NEW.filter(w => w.pos === 'numeral')
      .map(w => w.fr)
      .sort(),
    Object.keys(N).sort()
  );
  Object.keys(N).forEach(fr => {
    assert.equal(byFr(fr).ja, N[fr]);
    assert.equal(byFr(fr).art || '', '');
  });
  const c = byFr('clair');
  assert.equal(c.pos, 'adjective');
  deq([c.forms.fem, c.forms.mp, c.forms.fp], ['claire', 'clairs', 'claires']);
  // 100語の内訳: 名詞76・動詞14・数詞9・形容詞1
  assert.equal(NEW.filter(w => posOf(w) === 'noun').length, 76);
  assert.equal(NEW.length, 76 + 14 + 9 + 1);
});

test('検証: 教材全体が既存の検証ルール(重複・絵文字・訳)でエラー0・警告0。追加した語はアクセントを無視しても既存語と重複しない', () => {
  const rep = WordLib.validate(WORDS, { categories: WD.categories });
  deq(rep.errors.concat(rep.warnings).map(WordLib.formatIssue), []);
  const emojis = WORDS.map(w => w.emoji).filter(Boolean);
  assert.equal(new Set(emojis).size, emojis.length, '絵文字の重複なし');
  const cnt = {};
  WORDS.forEach(w => (cnt[WordLib.fold(w.fr)] = (cnt[WordLib.fold(w.fr)] || 0) + 1));
  deq(
    NEW.filter(w => cnt[WordLib.fold(w.fr)] > 1).map(w => w.id + ' ' + w.fr),
    []
  );
});

test('出題: 追加した100語のすべてで、日→仏・仏→日の4択が成立する', () => {
  const all = WORDS.map(WordLib.normalize);
  let made = 0;
  NEW.map(WordLib.normalize).forEach(w => {
    ['toFr', 'toJa'].forEach(mode => {
      deq(WordLib.checkQuestion(WordLib.makeQuestion(w, mode, all)), [], w.id + ' ' + mode);
      made++;
    });
  });
  assert.equal(made, 200);
});

test('育成: 登録語数が750語以上になったので、750語の進化目標と称号が現れる(以後の追加でも成り立つ)', () => {
  assert.ok(WORDS.length >= 750);
  assert.equal(Growth.nextStage(500, WORDS.length).n, 750);
  assert.ok(
    Growth.visibleTitles(0, WORDS.length).some(t => t.n === 750 && t.name === 'ことば探検家')
  );
  // 登録語数に届かない将来の段階・称号は、引き続き目標にならない
  assert.ok(Growth.visibleTitles(0, WORDS.length).every(t => t.n <= WORDS.length));
  const nx = Growth.nextStage(Growth.STAGES[Growth.STAGES.length - 1].n, WORDS.length);
  assert.equal(nx, undefined);
});
