'use strict';
// 教材拡充(単語+構文)の品質・連携・復習件数の一致・README と実装の整合のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WordLib = require('../src/lib/wordlib.js');
const {
  bootP,
  KEY,
  wordCount,
  plain,
  answerQ,
  playAll,
  prepared,
  rng,
  PhraseLib: L
} = require('./phrase_boot.js');
const { loadWordData } = require('../scripts/load_words.js');
const { fixtureWords } = require('./harness.js');
const { WORD_COUNT, onlyBaseline } = require('./baseline.js');

const WD = loadWordData(),
  WORDS = plain(WD.words),
  NEW = WORDS.slice(30),
  byId = new Map(WORDS.map(w => [w.id, w]));
const PH = prepared(),
  by = id => PH.find(p => p.id === id);
const T = new Date(2026, 5, 15, 10, 0, 0).getTime(),
  DAY = 86400000;
const jp = x => JSON.parse(JSON.stringify(x)),
  deq = (a, b, m) => assert.deepEqual(jp(a), jp(b), m);
const proceed = g => {
  if (g.k.view().mode === 'pwords') g.click('pgo');
};
const SEEN = {
  intro: 1,
  d: {
    p: { lv: 1, n: 1, ok: 1, ng: 0, st: 1, last: 1, due: T + 9e9 },
    r: { lv: 1, n: 1, ok: 1, ng: 0, st: 1, last: 1, due: T + 9e9 }
  },
  t: {}
};
const MASTERED = {
  intro: 1,
  d: {
    p: { lv: 3, n: 5, ok: 5, ng: 0, st: 5, last: 1, due: Date.now() + 9e9 },
    r: { lv: 3, n: 5, ok: 5, ng: 0, st: 5, last: 1, due: Date.now() + 9e9 }
  },
  t: {}
};

/* ================= 単語教材 ================= */
test('単語: 新規80語以上(w31〜の連番。件数の上限なし)・既存30語はそのまま先頭に・検証でエラー/警告0件', () => {
  assert.ok(NEW.length >= 80, '新規 ' + NEW.length + '語(出荷時より減っています)');
  assert.deepEqual(
    NEW.map(w => w.id),
    NEW.map((_, i) => 'w' + (31 + i))
  );
  assert.equal(new Set(WORDS.map(w => w.id)).size, WORDS.length, 'ID 重複なし');
  deq(
    WORDS.slice(0, 30),
    plain(fixtureWords().words)
      .map(f => WORDS.find(w => w.id === f.id))
      .map((w, i) => w),
    '既存30語の順序'
  );
  const rep = WordLib.validate(WD.words, { categories: WD.categories });
  deq(rep.errors.concat(rep.warnings).map(WordLib.formatIssue), []);
});
test('単語: 既存教材と重複しない(表記・日本語訳・冠詞つきの表示のいずれも)', () => {
  const fr = WORDS.map(w => w.fr.toLowerCase()),
    ja = WORDS.map(w => w.ja),
    disp = WORDS.map(w => WordLib.display(w).toLowerCase());
  assert.equal(new Set(fr).size, fr.length);
  assert.equal(new Set(ja).size, ja.length);
  assert.equal(new Set(disp).size, disp.length);
});
test('単語: 分野(日常生活・食事買い物・移動旅行・人間関係・学校仕事生活環境・文法関連)を網羅し、出荷時の新カテゴリはどれも6語以上(カテゴリの追加は自由)', () => {
  const cats = {};
  NEW.forEach(w => {
    cats[w.cat] = (cats[w.cat] || 0) + 1;
  });
  [
    '日常生活',
    '飲食店・買い物',
    '移動・旅行',
    '人・家族',
    '家・学校・仕事',
    '時間・天気',
    '基本の動詞',
    '形容詞・副詞',
    '疑問詞・前置詞・接続詞'
  ].forEach(c => assert.ok(cats[c] >= 6, c + ' ' + cats[c]));
  assert.ok(cats['食べ物'] >= 1, '食べ物');
  assert.ok(WD.categories.length >= 14);
  Object.keys(cats).forEach(c =>
    assert.ok(
      WD.categories.includes(c),
      '追加した語のカテゴリ「' + c + '」が CATEGORIES にありません'
    )
  );
  const fr = new Set(WORDS.map(w => w.fr));
  [
    'se lever',
    'se coucher',
    'dormir',
    'riz',
    'addition',
    'gare',
    'train',
    'billet',
    'famille',
    'travail',
    'chambre',
    "aujourd'hui",
    'demain',
    'pluie',
    'être',
    'avoir',
    'aller',
    'où',
    'combien',
    'avec',
    'très',
    'à droite',
    'tout droit'
  ].forEach(f => assert.ok(fr.has(f), f + ' がありません'));
});
test('単語: 品詞・性・冠詞・レベルのメタデータが正しい(名詞は冠詞つき・性あり、非名詞は冠詞なし)', () => {
  // 初回の教材(w31〜WORD_COUNT)の品詞はこの9種のまま(従来の検査を維持)
  const POS_R1 = [
    'noun',
    'verb',
    'adjective',
    'adverb',
    'pronoun',
    'preposition',
    'conjunction',
    'interjection',
    'expression'
  ];
  // 追加した教材は、アプリ本体(wordlib.js)が正式に許可している品詞(数詞・冠詞も含む)
  const POS_ALL = Object.keys(WordLib.POS);
  NEW.forEach(w => {
    const pos = w.pos || 'noun';
    assert.ok(
      (Number(w.id.slice(1)) <= WORD_COUNT ? POS_R1 : POS_ALL).includes(pos),
      w.id + ' pos ' + pos
    );
    assert.ok(
      (Number(w.id.slice(1)) <= WORD_COUNT
        ? ['A1', 'A2']
        : ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
      ).includes(w.level),
      w.id + ' level'
    );
    if (pos === 'noun') {
      assert.ok(['le', 'la', "l'"].includes(w.art) && ['m', 'f'].includes(w.g), w.id);
      assert.equal(WordLib.checkArticle(w.art, w.fr).level, 'ok', w.id + ' ' + w.art + ' ' + w.fr);
      if (w.art === 'le') assert.equal(w.g, 'm');
      if (w.art === 'la') assert.equal(w.g, 'f');
    } else assert.ok(!w.art && !w.g, w.id + ' 非名詞に冠詞/性');
    assert.ok(w.kana && /^[\u30A0-\u30FF\s・\-ー']+$/.test(w.kana), w.id + ' kana');
    assert.ok(w.ex && w.exJa, w.id + ' 例文');
  });
  assert.equal(WordLib.display(NEW.find(w => w.fr === 'gare')), 'la gare');
  assert.equal(WordLib.display(NEW.find(w => w.fr === 'hôtel')), "l'hôtel");
  assert.equal(WordLib.display(NEW.find(w => w.fr === 'riz')), 'le riz');
  assert.ok(NEW.filter(w => w.level === 'A2').length >= 3, 'A2 の語(出荷時より減っています)');
});
test("単語: h で始まる名詞の冠詞が辞書どおり(l'hôtel / l'heure / l'hiver は無音のh)", () => {
  ['hôtel', 'heure', 'hiver', 'homme'].forEach(f => {
    const w = WORDS.find(x => x.fr === f);
    assert.equal(w.art, "l'", f);
    assert.equal(WordLib.checkArticle(w.art, w.fr).level, 'ok');
  });
  assert.equal(WORDS.find(w => w.fr === 'œuf').art, "l'");
  deq(WORDS.find(w => w.fr === 'œuf').forms, { plural: 'œufs' });
});
test('単語: 動詞は不定詞で登録され、6人称の現在形(je/tu/il/nous/vous/ils)が正しい形式で入っている', () => {
  const V = NEW.filter(w => w.pos === 'verb');
  assert.ok(V.length >= 20, '動詞 ' + V.length);
  const known = {
    être: 'je suis, tu es, il est, nous sommes, vous êtes, ils sont',
    avoir: "j'ai, tu as, il a, nous avons, vous avez, ils ont",
    aller: 'je vais, tu vas, il va, nous allons, vous allez, ils vont',
    faire: 'je fais, tu fais, il fait, nous faisons, vous faites, ils font',
    pouvoir: 'je peux, tu peux, il peut, nous pouvons, vous pouvez, ils peuvent',
    vouloir: 'je veux, tu veux, il veut, nous voulons, vous voulez, ils veulent',
    devoir: 'je dois, tu dois, il doit, nous devons, vous devez, ils doivent',
    prendre: 'je prends, tu prends, il prend, nous prenons, vous prenez, ils prennent',
    boire: 'je bois, tu bois, il boit, nous buvons, vous buvez, ils boivent',
    venir: 'je viens, tu viens, il vient, nous venons, vous venez, ils viennent',
    savoir: 'je sais, tu sais, il sait, nous savons, vous savez, ils savent',
    comprendre:
      'je comprends, tu comprends, il comprend, nous comprenons, vous comprenez, ils comprennent'
  };
  V.forEach(w => {
    assert.match(w.fr, /(er|ir|re|oir)$/, w.fr);
    const f = w.forms.present.split(', ');
    assert.equal(f.length, 6, w.fr);
    const pron = w.fr.startsWith('se ')
      ? [/^je me /, /^tu te /, /^il se /, /^nous nous /, /^vous vous /, /^ils se /]
      : [/^(je|j') ?/, /^tu /, /^il /, /^nous /, /^vous /, /^ils /];
    f.forEach((x, i) => assert.match(x, pron[i], w.fr + ': ' + x));
  });
  Object.keys(known).forEach(k => assert.equal(V.find(w => w.fr === k).forms.present, known[k], k));
});
test('単語: 形容詞は女性形(forms.fem)を持つ。出荷済みの7語は規則どおりの形(追加の形容詞は自由)', () => {
  const A = NEW.filter(w => w.pos === 'adjective');
  assert.ok(A.length >= 7);
  const fem = {
    grand: 'grande',
    petit: 'petite',
    bon: 'bonne',
    chaud: 'chaude',
    froid: 'froide',
    content: 'contente',
    fatigué: 'fatiguée'
  };
  Object.keys(fem).forEach(k =>
    assert.equal(
      (A.find(w => w.fr === k) || { forms: {} }).forms.fem,
      fem[k],
      k + '(出荷済みの形容詞)'
    )
  );
  A.filter(w => !(w.fr in fem)).forEach(w =>
    assert.ok(
      w.forms && typeof w.forms.fem === 'string' && w.forms.fem.length > 0,
      w.fr + '(追加した形容詞)に女性形(forms.fem)がありません'
    )
  );
});
test('単語: 絵文字つきの名詞は絵→仏の問題に使え、絵文字は他の語と重複せず、絵のない名詞は問題にならない', () => {
  const em = WORDS.filter(w => w.emoji).map(w => w.emoji);
  assert.equal(new Set(em).size, em.length);
  NEW.filter(w => w.emoji && (w.pos || 'noun') === 'noun').forEach(w =>
    assert.equal(WordLib.canShowImage(WordLib.normalize(w)), true, w.fr)
  );
  NEW.filter(w => !w.emoji).forEach(w =>
    assert.equal(WordLib.canShowImage(WordLib.normalize(w)), false, w.fr)
  );
  assert.equal(WORDS.find(w => w.fr === 'chaise').emoji, '🪑');
  assert.equal(WORDS.find(w => w.fr === 'table').emoji, '');
});
test('単語: 追加した単語もゲームで正常に使える(起動・学習・バトル・図鑑の検索と絞り込み)', () => {
  const g = bootP();
  assert.equal(g.k.data.excluded, 0);
  assert.equal(g.k.vocab.length, wordCount());
  assert.equal(g.sb.__errors.length, 0);
  for (let n = 0; n < 14; n++) {
    g.click('home');
    g.click('learn');
    g.click('learnNext');
    g.click('learnNext');
    g.click('battle');
    let k = 0;
    while (g.k.view().mode === 'battle' && k++ < 40) {
      g.answer(n % 3 !== 0);
      g.next();
    }
  }
  assert.ok(Object.keys(g.k.state().w).length >= 40, '新しい単語まで学習が進む');
  assert.ok(Object.keys(g.k.state().w).some(id => Number(id.slice(1)) > 30));
  assert.equal(g.sb.__errors.length, 0);
  g.click('zukan');
  assert.equal(g.k.zukan().list.length, wordCount());
  g.type('zq', 'gare');
  assert.ok(g.k.zukan().list.some(w => w.fr === 'gare'));
  g.type('zq', 'お会計');
  assert.ok(
    g.k.zukan().list.some(w => w.fr === 'addition'),
    'addition が見つかる'
  );
  deq(
    onlyBaseline(g.k.zukan().list).map(w => w.fr),
    ['addition'],
    '出荷済みの語では addition だけ'
  );
  g.type('zq', '');
  g.select('cat', '移動・旅行');
  assert.ok(g.k.zukan().list.length >= 12 && g.k.zukan().list.every(w => w.cat === '移動・旅行'));
});

/* ================= 構文教材 ================= */
test('構文: 総数50以上・追加30以上(件数の上限なし)・ID重複なし・検証エラー0・警告0', () => {
  const ph = PH;
  assert.ok(ph.length >= 50, '' + ph.length);
  assert.ok(ph.length - 21 >= 30);
  assert.equal(new Set(ph.map(p => p.id)).size, ph.length);
  deq(
    ph.slice(0, 21).map(p => p.id),
    Array.from({ length: 21 }, (_, i) => 'p' + String(i + 1).padStart(2, '0')),
    '既存の構文IDは変わらない'
  );
  const rep = L.validate(
    JSON.parse(JSON.stringify(require('../scripts/load_phrases.js').loadPhraseData().phrases)),
    {
      wordIds: WORDS.map(w => w.id),
      scenes: plain(require('../scripts/load_phrases.js').loadPhraseData().scenes)
    }
  );
  deq(rep.errors.concat(rep.warnings).map(L.formatIssue), []);
});
test('構文: 日常の用途を網羅する(出荷時の場面8・各分野の代表表現。場面の追加は自由)', () => {
  const frs = PH.map(p => p.fr).join(' | ');
  [
    'Je viens du',
    "J'habite avec",
    'Je travaille',
    'Où habitez-vous',
    'Comment allez-vous',
    'Vous parlez anglais',
    'Pourquoi êtes-vous',
    'réserver une table',
    'Vous avez du pain',
    'un kilo de',
    "L'addition",
    "m'aider",
    'Je dois',
    'Il faut',
    "Je n'ai pas de",
    'Nous allons',
    'Je ne peux pas',
    'Pour aller à',
    'Allez tout droit',
    'Tournez à droite',
    'À quelle heure',
    'combien de temps',
    'un billet pour',
    'Je me lève',
    'tous les jours',
    'souvent',
    "Je suis d'accord",
    "Je ne suis pas d'accord",
    'Moi aussi',
    'plus lentement',
    'je comprends'
  ].forEach(s => assert.ok(frs.includes(s), s + ' がありません'));
  assert.ok(
    PH.filter(p => p.fr.startsWith('Je voudrais')).length >= 5,
    'Je voudrais + 名詞/不定詞/切符 など'
  );
  assert.ok(
    PH.filter(p => /^(Je|J'|Nous) /.test(p.fr) && / ne |n'/.test(p.fr)).length >= 5,
    '否定文'
  );
  const used = new Set(PH.map(p => p.scene));
  ['ask', 'daily', 'greeting', 'plan', 'routine', 'shop', 'talk', 'travel'].forEach(k =>
    assert.ok(used.has(k), '場面 ' + k + ' の構文がありません')
  );
});
test('構文: 難易度の整合 ─ A1 の構文は A2 の単語を参照せず、A2 の構文も用意されている', () => {
  PH.filter(p => p.level === 'A1').forEach(p =>
    L.wordsOf(p).forEach(id =>
      assert.equal(
        byId.get(id).level || 'A1',
        'A1',
        p.id + ' が A2 の単語 ' + byId.get(id).fr + ' を参照'
      )
    )
  );
  const a2 = PH.filter(p => p.level === 'A2');
  assert.ok(a2.length >= 8, 'A2 の構文');
  assert.ok(PH.filter(p => p.level === 'A1').length >= 35);
  [
    'Il faut',
    'Je dois',
    'À quelle heure',
    'combien de temps',
    "Je n'ai pas de",
    "d'accord"
  ].forEach(s =>
    assert.ok(
      a2.some(p => p.fr.includes(s)),
      s + ' は A2'
    )
  );
});
test('構文: 単語参照はすべて実在し、循環しない(単語→構文の参照は存在しない)。活用形の語句は辞書形の単語に結び付く', () => {
  PH.forEach(p => L.wordsOf(p).forEach(id => assert.ok(byId.has(id), p.id + ' ' + id)));
  assert.ok(WORDS.every(w => !('phraseIds' in w) && !('phrases' in w)));
  const ids = p => L.wordsOf(by(p)).map(i => byId.get(i).fr);
  ['vouloir'].forEach(v =>
    ['p10', 'p21', 'p31', 'p34', 'p50'].forEach(p =>
      assert.ok(ids(p).includes(v), p + ' voudrais ← vouloir')
    )
  );
  assert.ok(ids('p19').includes('savoir'));
  assert.ok(ids('p20').includes('aller') && ids('p20').includes('manger'));
  assert.ok(ids('p13').includes('prendre') && ids('p38').includes('prendre'));
  assert.ok(ids('p07').includes('gare') && ids('p07').includes('où'));
  assert.ok(ids('p25').includes('frère') && ids('p25').includes('sœur'));
});
test('構文: 出荷時に追加した単語(w31〜出荷済みの最後)の8割以上が、構文(wordIds または応用 slots)で使われる(その後に追加した語は構文で使わなくてよい)', () => {
  const used = new Set();
  PH.forEach(p => L.wordsOf(p).forEach(i => used.add(i)));
  const shipped = NEW.slice(0, WORD_COUNT - 30),
    n = shipped.filter(w => used.has(w.id)).length;
  assert.ok(n / shipped.length >= 0.8, n + '/' + shipped.length);
  assert.ok(
    PH.filter(p => L.wordsOf(p).some(i => Number(i.slice(1)) > 30)).length >= 40,
    '新しい単語を使う構文'
  );
});
test('構文: 一つの型で複数の自然な文を作れる(slots)。応用例は元の文と別・重複なし・同じ構造', () => {
  const withSlots = PH.filter(p => p.slots.length);
  assert.ok(withSlots.length >= 40, '応用つきの構文 ' + withSlots.length);
  withSlots.forEach(p => {
    const seen = new Set([p.fr]);
    p.slots.forEach(s =>
      s.options.forEach(o => {
        const v = L.variantOf(p, s, o);
        assert.ok(!seen.has(v), p.id + ' 応用例の重複: ' + v);
        seen.add(v);
        assert.match(v, /[.?]$/);
        assert.equal(v.split(/[.?]/).length - 1 <= 1, true);
      })
    );
  });
  const v10 = by('p10'),
    outs = v10.slots[0].options.map(o => L.variantOf(v10, v10.slots[0], o));
  assert.ok(outs.includes("Je voudrais de l'eau, s'il vous plaît."));
  assert.ok(
    L.variantOf(by('p31'), by('p31').slots[0], by('p31').slots[0].options[0]) ===
      'Je voudrais réserver une chambre.'
  );
});
test('構文: 空欄は一意 ─ 誤答を入れた文が、他の構文の正文・応用例のいずれにもならない', () => {
  const all = new Set();
  PH.forEach(p => {
    all.add(p.fr);
    p.slots.forEach(s => s.options.forEach(o => all.add(L.variantOf(p, s, o))));
  });
  PH.filter(p => p.cloze).forEach(p => {
    const z = p.cloze;
    assert.equal(z.options.length, 4, p.id);
    assert.equal(new Set(z.options).size, 4);
    z.options
      .filter(o => o !== z.answer)
      .forEach(o => {
        const f = L.renderWith(p, z.chunk, z.pre + o + z.post);
        assert.notEqual(f, p.fr);
        assert.ok(!all.has(f), p.id + ' の誤答「' + o + '」が正文になる: ' + f);
      });
  });
  assert.ok(PH.filter(p => p.cloze).length >= 45);
});
test('構文: 語順整序は一意 ─ chunks が4つ以下なら全順列を調べ、完成文になる並びが(同じ語句を除き)正解だけ', () => {
  const perms = a =>
    a.length <= 1
      ? [a]
      : a.flatMap((x, i) => perms(a.filter((_, j) => j !== i)).map(r => [x].concat(r)));
  PH.forEach(p => {
    const q = L.makeOrdering(p, { rng: rng(7) });
    assert.equal(q.cards.length, p.chunks.length);
    assert.equal(new Set(q.cards.map(c => c.cid)).size, q.cards.length);
    if (p.chunks.length <= 4) {
      const ok = perms(p.chunks.map((_, i) => 'c' + i)).filter(s => L.orderingCheck(q, s));
      assert.equal(ok.length, 1, p.id + ' 正解の並びが ' + ok.length + ' 通り');
      assert.equal(ok[0].join(), p.chunks.map((_, i) => 'c' + i).join());
    } else
      assert.equal(
        L.orderingCheck(
          q,
          p.chunks.map((_, i) => 'c' + i)
        ),
        true
      );
  });
  assert.ok(
    PH.every(p => p.chunks.length >= 2 && p.chunks.length <= 5),
    'カードは2〜5枚(スマホで操作しやすい)'
  );
});
test('構文: 選択問題は全構文・多数の乱数で、正解1つ・誤答は重複せず別の意味・言い換え(equiv)は出ない', () => {
  PH.forEach(p => {
    for (let s = 1; s <= 25; s++) {
      const q = L.makeChoice(p, PH, { rng: rng(s * 31 + 5) });
      assert.equal(q.opts.length, 4, p.id);
      assert.equal(q.opts.filter((o, i) => L.checkChoice(q, i)).length, 1);
      assert.equal(new Set(q.opts.map(o => o.t)).size, 4);
      q.opts
        .filter(o => !o.ok)
        .forEach(o => {
          const x = by(o.id);
          assert.notEqual(x.ja, p.ja);
          assert.ok(!p.equiv.includes(o.id));
        });
    }
  });
  for (let s = 1; s <= 50; s++)
    ['p11', 'p12'].forEach((a, i) =>
      assert.ok(
        !L.makeChoice(by(a), PH, { rng: rng(s) }).opts.some(o => o.id === ['p12', 'p11'][i])
      )
    );
});
test('構文: 教材の文法解説 ─ Ça coûte combien ? は ça の単数扱いと、品物を主語にした複数形を正確に説明する', () => {
  const p = by('p12'),
    n = p.grammarNote;
  assert.equal(p.fr, 'Ça coûte combien ?');
  assert.ok(n.length <= 140);
  assert.ok(n.includes('coûte') && n.includes('3人称単数'), 'ça は単数扱いで coûte');
  assert.ok(
    n.includes('coûtent') && n.includes('Les pommes coûtent combien ?'),
    '品物を主語にした複数形'
  );
  assert.ok(
    !/Ça は使わず/.test(n) && !n.includes('Ils coûtent'),
    '旧解説の誤り(複数なら Ça は使わない)が残っていない'
  );
  PH.forEach(q => {
    assert.ok(q.grammarNote.length <= 140, q.id);
    assert.match(q.grammarNote, /[\u3040-\u30ff\u4e00-\u9fff]/);
  });
});
test('構文: 全場面(出荷時の8場面+追加した場面)で学習セッションを最後まで進められ、新しい教材もエラーなく動く(新しい単語は先に確認できる)', () => {
  const g = bootP();
  g.k.setClock(() => T);
  Array.from(
    new Set(
      ['greeting', 'ask', 'shop', 'daily', 'plan', 'travel', 'routine', 'talk'].concat(
        Object.keys(require('../scripts/load_phrases.js').loadPhraseData().scenes)
      )
    )
  ).forEach(sc => {
    g.click('home');
    g.click('pmenu');
    g.click('pscene', { v: sc });
    g.click('plearn');
    proceed(g);
    assert.equal(g.k.view().mode, 'pquiz', sc);
    assert.ok(
      g.k.view().queue.every(it => g.k.phrases.find(p => p.id === it.pid).scene === sc),
      sc + ' の構文だけ'
    );
    playAll(g, sc === 'talk' ? false : true);
    assert.equal(g.k.view().mode, 'presult', sc);
  });
  assert.equal(g.sb.__errors.length, 0);
  assert.ok(Object.keys(g.k.state().ph).length >= 14);
});

/* ================= 単語と構文の連携 ================= */
test('連携: 新しい構文を始める前に、まだ習っていない単語を確認できる(単語の記録は変更しない)', () => {
  const g = bootP();
  g.k.setClock(() => T);
  g.click('pmenu');
  g.click('pscene', { v: 'shop' });
  const w0 = JSON.stringify(g.k.state().w);
  g.click('plearn');
  const v = g.k.view();
  assert.equal(v.mode, 'pwords');
  assert.ok(v.list.length >= 1 && v.list.length <= 8);
  assert.ok(v.list.every(id => byId.has(id)));
  const h = g.html();
  assert.match(h, /先に単語を確認しよう/);
  v.list.forEach(id => {
    assert.ok(h.includes(g.k.esc(byId.get(id).ja)), id);
  });
  assert.ok(h.includes('café'));
  assert.match(h, /data-act="pgo"/);
  g.click('pgo');
  assert.equal(g.k.view().mode, 'pquiz');
  assert.equal(JSON.stringify(g.k.state().w), w0, '単語の記録は変わらない');
  g.click('pgo');
  assert.equal(g.k.view().mode, 'pquiz', '二重に開始しない');
  g.click('pmenu');
  g.click('plearn');
  g.click('pmenu');
  assert.equal(g.k.view().mode, 'pmenu', '確認画面からメニューにもどれる');
});
test('連携: 必要な単語をすべて学習済みなら、確認画面を挟まずに始まる。一部だけ未学習なら、その単語だけが一覧に出る', () => {
  const stor = ids => ({
    [KEY]: JSON.stringify({
      v: 4,
      xp: 0,
      best: 0,
      w: Object.fromEntries(ids.map(id => [id, SEEN])),
      ph: {},
      pbest: 0,
      pd: { d: '', xp: 0 }
    })
  });
  // greeting の最初の2構文(p01, p02)が参照する単語(辞書形)をすべて学習済みにする →
  // そのまま構文が始まる
  const ids12 = Array.from(new Set(['p01', 'p02'].reduce((a, id) => a.concat(by(id).wordIds), [])));
  assert.ok(ids12.length >= 1);
  const g = bootP({ storage: stor(ids12) });
  g.click('pmenu');
  g.click('pscene', { v: 'greeting' });
  g.click('plearn');
  assert.equal(g.k.view().mode, 'pquiz');
  // 1語だけ未学習 → その語だけが確認画面に出る
  const part = bootP({ storage: stor(ids12.slice(1)) });
  part.click('pmenu');
  part.click('pscene', { v: 'greeting' });
  part.click('plearn');
  assert.equal(part.k.view().mode, 'pwords');
  deq(part.k.view().list, ids12.slice(0, 1));
  // shop の最初の構文の単語がすべて学習済み → 確認画面なし
  const shopIds = Array.from(
    new Set(
      PH.filter(p => p.scene === 'shop')
        .slice(0, 2)
        .reduce((a, p) => a.concat(p.wordIds), [])
    )
  );
  const h = bootP({ storage: stor(shopIds) });
  h.click('pmenu');
  h.click('pscene', { v: 'shop' });
  h.click('plearn');
  assert.equal(h.k.view().mode, 'pquiz');
});
test('連携: 習得済みの単語を含む構文を優先して出題する(同じレベルの中で)。単語履歴がなければデータの並び順', () => {
  const none = L.buildQueue(PH, {}, { kind: 'learn', scene: 'all', now: T, priority: () => 1 });
  assert.deepEqual(
    none.slice(0, 2).map(x => x.pid),
    ['p01', 'p02']
  );
  const mastered = id => id === 'w21';
  const pri = p => (L.wordsOf(p).some(mastered) ? 0 : 1);
  const q = L.buildQueue(PH, {}, { kind: 'learn', scene: 'all', now: T, priority: pri });
  const first = Array.from(new Set(q.map(x => x.pid)));
  assert.deepEqual(first, ['p04', 'p10'], 'café(w21)を習得済みなら、café を含む構文が先');
  assert.ok(first.every(id => by(id).level === 'A1'));
  const lvl = L.buildQueue(
    PH.filter(p => p.id === 'p30' || p.id === 'p27'),
    {},
    { kind: 'learn', now: T, priority: () => 0 }
  );
  assert.equal(lvl[0].pid, 'p27', 'A1 の構文を A2 より先に');
  const g = bootP({
    storage: {
      [KEY]: JSON.stringify({
        v: 4,
        xp: 0,
        best: 0,
        w: { w21: MASTERED },
        ph: {},
        pbest: 0,
        pd: { d: '', xp: 0 }
      })
    }
  });
  g.click('pmenu');
  g.click('plearn');
  proceed(g);
  deq(
    Array.from(new Set(g.k.view().queue.map(x => x.pid))),
    ['p04', 'p10'],
    'アプリでも習得済みの単語を含む構文が先'
  );
  assert.equal(g.k.state().w.w21.d.p.lv, 3, '単語の記録は読むだけ');
});
test('連携: 単語図鑑の詳細に「この単語を使う構文」が出る(使われていない単語には出ない)。HTMLは安全', () => {
  const g = bootP();
  g.click('zukan');
  g.click('pick', { id: 'w21' });
  const h = g.html();
  assert.match(h, /この単語を使う構文/);
  assert.ok(h.includes('Je voudrais un café, s&#39;il vous plaît.'));
  assert.ok(h.includes('コーヒーを1杯お願いします。'));
  const unused = WORDS.find(w => w.fr === 'quand');
  g.click('zback');
  g.click('pick', { id: unused.id });
  assert.doesNotMatch(g.html(), /この単語を使う構文/);
  const p = bootP({ extraCode: '' });
  const w = p.k.vocab.find(x => x.id === 'w21');
  p.k.phrases.find(x => x.id === 'p10').fr = '"><img src=x onerror=alert(1)>';
  p.click('zukan');
  p.click('pick', { id: w.id });
  assert.ok(!/<img/.test(p.html()));
  assert.ok(p.html().includes('&lt;img src=x'));
});

/* ================= 復習件数と出題範囲の一致 ================= */
const due2 = (g, scene) => {
  g.k.setClock(() => T);
  g.click('pmenu');
  g.click('pscene', { v: 'greeting' });
  g.click('plearn');
  proceed(g);
  playAll(g, true);
  g.k.setClock(() => T + 2 * DAY);
  g.click('pmenu');
  g.click('pscene', { v: scene });
};
test('復習: 選んでいる場面が違っても、表示される復習待ちの件数と復習の出題対象が一致する(全場面が対象)', () => {
  const g = bootP();
  due2(g, 'shop');
  const n = g.k.pdue().length;
  assert.equal(n, 2);
  assert.match(g.html(), /復習する\(復習待ち 2\)/);
  assert.match(g.html(), /復習は全場面の復習待ちが対象です/);
  g.click('previewS');
  const v = g.k.view();
  assert.equal(v.mode, 'pquiz');
  assert.equal(v.kind, 'review');
  assert.equal(v.queue.length, n, '件数と出題数が一致');
  deq(
    v.queue.map(x => x.pid).sort(),
    g.k
      .pdue()
      .map(p => p.id)
      .sort()
  );
  assert.ok(
    v.queue.every(it => g.k.phrases.find(p => p.id === it.pid).scene === 'greeting'),
    '選択中の shop ではなく、復習待ちの greeting から出題'
  );
});
test('復習: 復習待ちが多いときは1回に6つまで。件数表示はその旨を示し、残りは次の復習で出る', () => {
  const ph = {},
    mk = () => {
      const r = L.newRec();
      L.recordAnswer(r, 'meaning', true, T - 5 * DAY);
      return r;
    };
  g0();
  function g0() {
    PH.slice(0, 9).forEach(p => {
      ph[p.id] = mk();
    });
  }
  const g = bootP({
    storage: {
      [KEY]: JSON.stringify({ v: 4, xp: 0, best: 0, w: {}, ph, pbest: 0, pd: { d: '', xp: 0 } })
    }
  });
  g.k.setClock(() => T);
  g.click('home');
  assert.match(g.html(), /構文トレーニング\(復習待ち 9\)/);
  g.click('pmenu');
  g.click('pscene', { v: 'ask' });
  assert.match(g.html(), /復習する\(復習待ち 9\)/);
  assert.match(g.html(), /1回に最大6つ/);
  g.click('previewS');
  assert.equal(g.k.view().queue.length, 6);
  playAll(g, true);
  assert.equal(g.k.pdue().length, 3, '残りは次の復習で');
  g.click('pmenu');
  assert.match(g.html(), /復習する\(復習待ち 3\)/);
  assert.doesNotMatch(g.html(), /1回に最大6つ/);
  g.click('previewS');
  assert.equal(g.k.view().queue.length, 3);
});
test('復習: 復習待ちがないときは、全場面でないことが分かるメッセージを表示し、開始しない(他の場面にあるという矛盾がない)', () => {
  const g = bootP();
  g.k.setClock(() => T);
  g.click('pmenu');
  g.click('pscene', { v: 'travel' });
  assert.equal(g.k.pdue().length, 0);
  assert.match(g.html(), /全場面で復習待ちの構文はありません/);
  assert.doesNotMatch(g.html(), /復習待ち \d/);
  g.click('previewS');
  assert.equal(g.k.view().mode, 'pmenu');
  due2(g, 'travel');
  assert.equal(g.k.pdue().length, 2);
  assert.doesNotMatch(
    g.html(),
    /全場面で復習待ちの構文はありません/,
    '他の場面に復習待ちがあるときは出さない'
  );
});
test('復習: 技能別の学習履歴が維持され、復習セッションの結果が復習待ちの件数に反映される', () => {
  const g = bootP();
  due2(g, 'greeting');
  const before = jp(g.k.state().ph.p01);
  g.click('previewS');
  playAll(g, true);
  const after = g.k.state().ph.p01;
  assert.ok(after.n > before.n);
  L.SKILLS.forEach(k =>
    assert.ok(after.sk[k].n >= before.sk[k].n && after.sk[k].ok >= before.sk[k].ok)
  );
  assert.ok(
    L.SKILLS.some(k => after.sk[k].lv > before.sk[k].lv),
    '期限の来た技能は段階が上がる'
  );
  assert.ok(after.sk.meaning.n >= 1 && after.sk.cloze.n >= 1 && after.sk.ordering.n >= 1);
});

/* ================= 図鑑のスケール・README と実装の整合 ================= */
test('図鑑: 構文が何件に増えても、ページ送り(30件ずつ)・検索・場面/レベル/状態の絞り込みが使える', () => {
  const g = bootP();
  g.click('pzukan');
  const N = g.k.phrases.length,
    PAGES = Math.ceil(N / 30),
    cards = () => (g.k.pzukan().html.match(/class=\"pc\"/g) || []).length;
  assert.ok(N > 30, '2ページ以上になる件数');
  assert.ok(g.k.pzukan().html.includes('1 / ' + PAGES));
  assert.equal(cards(), 30);
  for (let i = 1; i < PAGES; i++) g.click('pzpage', { v: '1' });
  assert.ok(g.k.pzukan().html.includes(PAGES + ' / ' + PAGES));
  assert.equal(cards(), N - 30 * (PAGES - 1), '最後のページの件数');
  for (let i = 1; i < PAGES; i++) g.click('pzpage', { v: '-1' });
  assert.ok(g.k.pzukan().html.includes('1 / ' + PAGES));
  g.select('plv', 'A2');
  const A2 = g.k.phrases.filter(p => p.level === 'A2').length;
  assert.ok(g.html().includes('<option value=\"A2\" selected>'));
  assert.equal(g.k.pzukan().list.length, A2);
  assert.equal(g.k.pzukan().html.includes('pzpage'), A2 > 30, 'ページ送りは30件を超えるときだけ');
  g.select('plv', 'all');
  g.select('psc', 'talk');
  assert.equal(g.k.pzukan().list.length, g.k.phrases.filter(p => p.scene === 'talk').length);
  g.type('pzq', 'accord');
  const ids = () => g.k.pzukan().list.map(p => p.id);
  assert.ok(['p58', 'p59'].every(id => ids().includes(id)));
  deq(onlyBaseline(ids()), ['p58', 'p59'], '出荷済みの構文では p58・p59');
  g.type('pzq', '');
  g.select('psc', 'all');
  g.type('pzq', 'gare');
  assert.ok(['p07', 'p45'].every(id => ids().includes(id)));
  deq(onlyBaseline(ids()), ['p07', 'p45'], '出荷済みの構文では p07・p45');
});
test('ドキュメント: 保存形式・退避キー・移行・書き出しの説明が、実装(app.js)と一致している(v3 を現行形式と書いていない)', () => {
  // 詳細は README.md から docs/ に移したので、README.md と docs/*.md をあわせて確認する
  const root = path.join(__dirname, '..'),
    docDir = path.join(root, 'docs'),
    md = ['README.md']
      .concat(
        fs
          .readdirSync(docDir)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join('docs', f))
      )
      .map(f => fs.readFileSync(path.join(root, f), 'utf8'))
      .join('\n'),
    app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  assert.ok(/const fresh = \(\) => \(\{ v: 4,/.test(app));
  assert.ok(app.includes('format: 4'));
  assert.ok(app.includes('num(d.v, 1) < 4'));
  assert.ok(
    !/形式 v3\)|形式 v3 /.test(md) && !/\(形式 v3\)/.test(md),
    '現行形式を v3 と書いた記述が残っていない'
  );
  assert.ok(/形式 v4/.test(md));
  ['-backup-v', '-corrupt', '-before-import', '-before-reset'].forEach(k => {
    assert.ok(app.includes(k), 'app.js に ' + k);
    assert.ok(md.includes('…' + k) || md.includes(k), 'ドキュメントに ' + k);
  });
  assert.ok(/`format: 4`/.test(md));
  assert.ok(/v1〜v3/.test(md));
  assert.ok(/npm run validate/.test(md) && /npm test/.test(md), '検証とテストの実行方法');
  const reviewNote = /全場面の復習待ちが対象/.test(md);
  assert.ok(reviewNote, '復習の対象範囲');
  assert.ok(/state\.ph|`ph`/.test(md) && /pbest/.test(md) && /pd:/.test(md));
});
test('保存: 新しい教材の学習記録も、書き出し・読み込み・再保存で失われない(単語w31〜と構文p22〜)', () => {
  const g = bootP();
  g.k.setClock(() => T);
  g.k.state().w.w40 = jp(SEEN);
  g.click('pmenu');
  g.click('pscene', { v: 'travel' });
  g.click('plearn');
  proceed(g);
  playAll(g, true);
  g.click('home');
  g.click('export');
  const file = g.sb.__blobs[g.sb.__blobs.length - 1],
    out = JSON.parse(file);
  assert.ok(out.data.w.w40);
  assert.ok(
    Object.keys(out.data.ph).some(id => Number(id.slice(1)) > 21),
    '追加した構文の記録'
  );
  const h = bootP();
  assert.equal(h.k.importText(file), null);
  deq(h.k.state().ph, out.data.ph);
  assert.ok(h.k.state().w.w40);
  const again = h.store[KEY];
  const i = bootP({ storage: { [KEY]: again } });
  assert.equal(JSON.stringify(jp(i.k.state())), JSON.stringify(JSON.parse(again)));
});
