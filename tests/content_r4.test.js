'use strict';
// 教材拡充(第4弾: 単語 w638〜w737 の100語)のテスト。
// 範囲・並び  : 追加分が連番で末尾にあり、それまでの単語(w01〜w637)は ID・内容・並び順とも変わっていない
// 正確さ      : 名詞の冠詞と性・動詞の活用・形容詞の性数を、データとは独立した正解表で確認する
// 検証・出題  : 既存の検証ルール(重複・絵文字・訳)に違反せず、4択問題が両方向で成立する
// 「人の確認(フランス語の自然さ)」の代わりにはならない。ここは機械的に確認できる範囲。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadWordData } = require('../scripts/load_words.js');
const WordLib = require('../src/lib/wordlib.js');

const deq = assert.deepEqual;
// vm で読み込んだデータは別の実行環境の配列・オブジェクトなので、厳密比較のために素のデータに直す
const plain = x => JSON.parse(JSON.stringify(x));
const WD = plain(loadWordData()),
  WORDS = WD.words;
const FIRST = 638,
  LAST = 737;
const num = w => Number(w.id.slice(1));
const NEW = WORDS.filter(w => num(w) >= FIRST && num(w) <= LAST);
const byFr = fr => NEW.find(w => w.fr === fr);
const posOf = w => w.pos || (w.art || w.g ? 'noun' : '');

test('範囲: 単語100語(w638〜w737)が連番で、データの末尾にそのまま並んでいる', () => {
  assert.equal(NEW.length, 100);
  assert.equal(WORDS.length >= LAST, true);
  deq(
    WORDS.slice(FIRST - 1, LAST).map(w => w.id),
    Array.from({ length: LAST - FIRST + 1 }, (_, i) => 'w' + (FIRST + i)),
    '連番・欠番なし・並び順どおり'
  );
  deq(
    WORDS.map(w => w.id).slice(0, FIRST - 1),
    Array.from({ length: FIRST - 1 }, (_, i) => 'w' + (i < 9 ? '0' : '') + (i + 1)),
    '既存の ID は w01〜w637 のまま(w01〜w09 は2桁)'
  );
  assert.equal(new Set(WORDS.map(w => w.id)).size, WORDS.length, 'ID の重複なし');
});

test('不変: 追加前の637語は、ID・カテゴリ・冠詞・性・フランス語・日本語訳・品詞・レベル・並び順とも変わっていない', () => {
  const snap = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'words_before_r4.json'), 'utf8')
  ).words;
  assert.equal(snap.length, 637);
  const now = WORDS.slice(0, 637).map(w => ({
    id: w.id,
    cat: w.cat,
    art: w.art || '',
    g: w.g || '',
    fr: w.fr,
    ja: w.ja,
    pos: w.pos || 'noun',
    level: w.level || ''
  }));
  deq(now, snap);
});

test('形式: フランス語・日本語訳・カテゴリ・例文・例文訳が空でなく、カテゴリは登録済み、レベルは A1 / A2', () => {
  NEW.forEach(w => {
    ['fr', 'ja', 'cat', 'ex', 'exJa'].forEach(f =>
      assert.ok(typeof w[f] === 'string' && w[f].trim(), w.id + ' ' + f)
    );
    assert.ok(WD.categories.includes(w.cat), w.id + ' のカテゴリ ' + w.cat);
    assert.ok(['A1', 'A2'].includes(w.level), w.id + ' のレベル ' + w.level);
    assert.ok(w.pos || (w.art && w.g), w.id + ' は品詞(名詞は冠詞と性)がある');
    if (w.kana) assert.match(w.kana, /^[\u30A0-\u30FF\s]+$/, w.id + ' の発音はカタカナ');
  });
});

test('構成: 100語は複数の分野に渡り、少なかった分野(動物・身の回りの物・自然・体・服・趣味)を補強している。A1とA2の両方を含む', () => {
  const cats = {},
    lv = {};
  NEW.forEach(w => {
    cats[w.cat] = (cats[w.cat] || 0) + 1;
    lv[w.level] = (lv[w.level] || 0) + 1;
  });
  assert.ok(Object.keys(cats).length >= 12, 'カテゴリ数 ' + Object.keys(cats).length);
  ['動物', '身の回りの物', '自然', '体・健康', '服・色', '趣味・スポーツ'].forEach(c =>
    assert.ok(cats[c] >= 5, c + ' ' + cats[c])
  );
  assert.ok(lv.A1 >= 20 && lv.A2 >= 20, JSON.stringify(lv));
  assert.equal(WD.categories.length, 19, '新しいカテゴリは作っていない(19のまま)');
});

/* ================= 正確さ(独立した正解表) ================= */
test("正確さ: 名詞の冠詞と性(母音・無音のhで始まる語の l'、性を取り違えやすい語を含む)", () => {
  const T = {
    singe: ['le', 'm'],
    éléphant: ["l'", 'm'],
    lion: ['le', 'm'],
    ours: ["l'", 'm'],
    loup: ['le', 'm'],
    renard: ['le', 'm'],
    souris: ['la', 'f'],
    serpent: ['le', 'm'],
    grenouille: ['la', 'f'],
    papillon: ['le', 'm'],
    abeille: ["l'", 'f'],
    tortue: ['la', 'f'],
    dauphin: ['le', 'm'],
    baleine: ['la', 'f'],
    parapluie: ['le', 'm'],
    boîte: ['la', 'f'],
    savon: ['le', 'm'],
    portefeuille: ['le', 'm'],
    réveil: ['le', 'm'],
    écran: ["l'", 'm'],
    couverture: ['la', 'f'],
    oreiller: ["l'", 'm'],
    poubelle: ['la', 'f'],
    chose: ['la', 'f'],
    pierre: ['la', 'f'],
    fleuve: ['le', 'm'],
    colline: ['la', 'f'],
    vague: ['la', 'f'],
    volcan: ['le', 'm'],
    feuille: ['la', 'f'],
    lumière: ['la', 'f'],
    cravate: ['la', 'f'],
    costume: ['le', 'm'],
    pyjama: ['le', 'm'],
    écharpe: ["l'", 'f'],
    'maillot de bain': ['le', 'm'],
    randonnée: ['la', 'f'],
    dessin: ['le', 'm'],
    roman: ['le', 'm'],
    'bande dessinée': ['la', 'f'],
    équipe: ["l'", 'f'],
    promenade: ['la', 'f'],
    faim: ['la', 'f'],
    soif: ['la', 'f'],
    cheveu: ['le', 'm'],
    doigt: ['le', 'm'],
    genou: ['le', 'm'],
    épaule: ["l'", 'f'],
    toux: ['la', 'f'],
    cuisinier: ['le', 'm'],
    touriste: ['le', 'm'],
    neveu: ['le', 'm'],
    nièce: ['la', 'f'],
    infirmière: ["l'", 'f'],
    ascenseur: ["l'", 'm'],
    couloir: ['le', 'm'],
    bâtiment: ['le', 'm'],
    adresse: ["l'", 'f'],
    numéro: ['le', 'm'],
    'e-mail': ["l'", 'm'],
    salle: ['la', 'f'],
    bagage: ['le', 'm'],
    retard: ['le', 'm'],
    horaire: ["l'", 'm'],
    départ: ['le', 'm'],
    arrivée: ["l'", 'f'],
    réservation: ['la', 'f'],
    direction: ['la', 'f'],
    chaleur: ['la', 'f'],
    température: ['la', 'f']
  };
  const nouns = NEW.filter(w => posOf(w) === 'noun');
  deq(nouns.map(w => w.fr).sort(), Object.keys(T).sort(), '名詞の一覧が正解表と一致');
  Object.keys(T).forEach(fr => deq([byFr(fr).art, byFr(fr).g], T[fr], fr + ' の冠詞・性'));
  // 複数形が不規則・特別な語
  deq(byFr('cheveu').forms, { plural: 'cheveux' });
  deq(byFr('genou').forms, { plural: 'genoux' });
  deq(byFr('neveu').forms, { plural: 'neveux' });
  deq(byFr('maillot de bain').forms, { plural: 'maillots de bain' });
});

test('正確さ: 動詞は不定詞で登録し、現在形6人称の活用が正しい(綴りの変化・不規則活用・代名動詞を含む)', () => {
  const T = {
    rire: 'je ris, tu ris, il rit, nous rions, vous riez, ils rient',
    nettoyer: 'je nettoie, tu nettoies, il nettoie, nous nettoyons, vous nettoyez, ils nettoient',
    ranger: 'je range, tu ranges, il range, nous rangeons, vous rangez, ils rangent',
    emprunter:
      "j'emprunte, tu empruntes, il emprunte, nous empruntons, vous empruntez, ils empruntent",
    'se sentir':
      'je me sens, tu te sens, il se sent, nous nous sentons, vous vous sentez, ils se sentent',
    décider: 'je décide, tu décides, il décide, nous décidons, vous décidez, ils décident',
    continuer:
      'je continue, tu continues, il continue, nous continuons, vous continuez, ils continuent',
    arrêter: "j'arrête, tu arrêtes, il arrête, nous arrêtons, vous arrêtez, ils arrêtent",
    réussir:
      'je réussis, tu réussis, il réussit, nous réussissons, vous réussissez, ils réussissent',
    expliquer:
      "j'explique, tu expliques, il explique, nous expliquons, vous expliquez, ils expliquent"
  };
  const verbs = NEW.filter(w => w.pos === 'verb');
  deq(verbs.map(w => w.fr).sort(), Object.keys(T).sort(), '動詞の一覧が正解表と一致');
  Object.keys(T).forEach(fr => {
    const w = byFr(fr);
    assert.ok(/(er|ir|re|oir)$/.test(w.fr), fr + ' は不定詞');
    assert.equal(w.art || '', '', fr + ' は冠詞なし');
    assert.equal(w.forms.present, T[fr], fr + ' の現在形');
    assert.equal(w.forms.present.split(', ').length, 6);
  });
});

test('正確さ: 形容詞は 女性形・男性複数形・女性複数形 が正しい(-eux→-euse、-et→-ète、-oux→-ouce など)', () => {
  const T = {
    violet: ['violette', 'violets', 'violettes'],
    drôle: ['drôle', 'drôles', 'drôles'],
    intéressant: ['intéressante', 'intéressants', 'intéressantes'],
    ennuyeux: ['ennuyeuse', 'ennuyeux', 'ennuyeuses'],
    inquiet: ['inquiète', 'inquiets', 'inquiètes'],
    surpris: ['surprise', 'surpris', 'surprises'],
    calme: ['calme', 'calmes', 'calmes'],
    cassé: ['cassée', 'cassés', 'cassées'],
    lourd: ['lourde', 'lourds', 'lourdes'],
    doux: ['douce', 'doux', 'douces']
  };
  const adjs = NEW.filter(w => w.pos === 'adjective');
  deq(adjs.map(w => w.fr).sort(), Object.keys(T).sort(), '形容詞の一覧が正解表と一致');
  Object.keys(T).forEach(fr => {
    const w = byFr(fr);
    deq([w.forms.fem, w.forms.mp, w.forms.fp], T[fr], fr + ' の変化形');
    assert.equal(w.art || '', '', fr + ' は冠詞なし');
  });
});

test('正確さ: 表現・限定詞・代名詞は、冠詞・性をもたず、品詞が適切', () => {
  const T = {
    'tous les jours': 'expression',
    'ce soir': 'expression',
    'il y a': 'expression',
    'il faut': 'expression',
    ce: 'article',
    cette: 'article',
    mes: 'article',
    tes: 'article',
    ses: 'article',
    'quelque chose': 'pronoun'
  };
  Object.keys(T).forEach(fr => {
    const w = byFr(fr);
    assert.ok(w, fr + ' がある');
    assert.equal(w.pos, T[fr], fr + ' の品詞');
    assert.equal(w.art || '', '');
    assert.equal(w.g || '', '');
    assert.equal(w.forms, undefined, fr + ' に活用・変化形は不要');
  });
  // 100語の内訳が漏れなく数えられている(名詞70・動詞10・形容詞10・その他10)
  assert.equal(NEW.filter(w => posOf(w) === 'noun').length, 70);
  assert.equal(NEW.filter(w => w.pos === 'verb').length, 10);
  assert.equal(NEW.filter(w => w.pos === 'adjective').length, 10);
  assert.equal(Object.keys(T).length, 10);
});

/* ================= 検証・出題 ================= */
test('検証: 教材全体(既存+追加)が、フランス語・日本語訳・絵文字の重複を含む既存の検証ルールでエラー0・警告0', () => {
  const rep = WordLib.validate(WORDS, { categories: WD.categories });
  deq(rep.errors.concat(rep.warnings).map(WordLib.formatIssue), []);
  const emojis = WORDS.map(w => w.emoji).filter(Boolean);
  assert.equal(new Set(emojis).size, emojis.length, '絵文字の重複なし');
  const jas = [];
  WORDS.forEach(w => jas.push(w.ja, ...(w.alt || [])));
  assert.equal(new Set(jas.map(WordLib.fold)).size, jas.length, '日本語訳・別訳の重複なし');
  // アクセント記号だけが違う語は同時に登録しない(CONTENT_GUIDE §3)。追加した語は、ほかのどの語とも衝突しない
  const cnt = {};
  WORDS.forEach(w => (cnt[WordLib.fold(w.fr)] = (cnt[WordLib.fold(w.fr)] || 0) + 1));
  deq(
    NEW.filter(w => cnt[WordLib.fold(w.fr)] > 1).map(w => w.id + ' ' + w.fr),
    [],
    '追加した語のフランス語表記は、アクセントを無視しても既存の語と重複しない'
  );
});

test('出題: 追加した100語のすべてで、日→仏・仏→日の4択が成立する(選択肢4つ・正解がちょうど1つ・誤答が同じ訳でない)', () => {
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
