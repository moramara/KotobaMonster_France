'use strict';
// 構文のロジック(問題生成・採点・語順カード・学習記録・復習・報酬)の単体テスト。画面(DOM)
// には依存しない
const test = require('node:test');
const assert = require('node:assert/strict');
const { PhraseLib: L, prepared, rng, plain } = require('./phrase_boot.js');
const { onlyBaseline } = require('./baseline.js');

const PH = prepared(),
  by = id => PH.find(p => p.id === id);
const T0 = 1700000000000,
  MIN = 60000,
  DAY = 86400000;
const C = (t, ja, after) => ({ t, ja, after: after || '', sp: true });
const synth = (id, chunks) => {
  const p = {
    id,
    level: 'A1',
    scene: 'daily',
    ja: 'テスト',
    pattern: 'p',
    grammarNote: 'n',
    chunks,
    cloze: null,
    slots: [],
    wordIds: [],
    equiv: [],
    formats: ['choice', 'ordering']
  };
  p.fr = L.render(p);
  return p;
};

/* ---- 完成文の選択問題 ---- */
test('選択: すべての構文・多数の乱数で、正解がちょうど1つ・正解が選択肢に存在・4択・文の重複なし', () => {
  PH.forEach(p => {
    for (let s = 1; s <= 60; s++) {
      const q = L.makeChoice(p, PH, { rng: rng(s * 7919 + p.id.charCodeAt(2)) });
      assert.equal(q.opts.length, 4);
      assert.equal(q.opts.filter(o => o.ok).length, 1, p.id);
      assert.equal(q.opts.find(o => o.ok).t, p.fr);
      assert.equal(new Set(q.opts.map(o => o.t)).size, 4, p.id + ' 重複');
      assert.equal(q.prompt, p.ja);
      assert.equal(q.skill, 'meaning');
      q.opts.forEach((o, i) => assert.equal(L.checkChoice(q, i), o.t === p.fr));
    }
  });
});
test("選択: 誤答に、同じ訳・言い換え(equiv)の構文を使わない(C'est combien ? と Ça coûte combien ? は互いに出ない)", () => {
  for (let s = 1; s <= 200; s++) {
    assert.ok(
      !L.makeChoice(by('p11'), PH, { rng: rng(s) }).opts.some(o => o.id === 'p12'),
      'p11 の誤答に p12'
    );
    assert.ok(
      !L.makeChoice(by('p12'), PH, { rng: rng(s) }).opts.some(o => o.id === 'p11'),
      'p12 の誤答に p11'
    );
  }
  // 同じ訳の別構文
  const twin = PH.map(p => (p.id === 'p13' ? Object.assign({}, p, { ja: by('p10').ja }) : p));
  for (let s = 1; s <= 100; s++)
    assert.ok(!L.makeChoice(by('p10'), twin, { rng: rng(s) }).opts.some(o => o.id === 'p13'));
});
test('選択: 誤答は同じ場面の構文を優先する(同じ場面が3つ以上あれば、誤答はすべて同じ場面)', () => {
  for (let s = 1; s <= 50; s++) {
    const q = L.makeChoice(by('p10'), PH, { rng: rng(s) });
    q.opts.filter(o => !o.ok).forEach(o => assert.equal(PH.find(p => p.id === o.id).scene, 'shop'));
  }
  assert.ok(PH.filter(p => p.scene === 'shop').length >= 4);
});
test('選択: 構文が少ないときは選択肢を減らし、誤答がなければ作らない(null)。同じ文が複数あっても重複させない', () => {
  assert.equal(L.makeChoice(by('p01'), PH.slice(0, 3), { rng: rng(1) }).opts.length, 3);
  assert.equal(L.makeChoice(by('p01'), [by('p01')], { rng: rng(1) }), null);
  const dup = PH.slice(0, 6).concat([Object.assign({}, by('p07'), { id: 'dup1' })]); // 同じ文の別ID
  for (let s = 1; s <= 50; s++) {
    const q = L.makeChoice(by('p01'), dup, { rng: rng(s) });
    assert.equal(new Set(q.opts.map(o => o.t)).size, q.opts.length);
  }
});
test('選択: 並び順は乱数で変わる(正解が常に同じ位置にならない)', () => {
  const pos = new Set();
  for (let s = 1; s <= 60; s++)
    pos.add(L.makeChoice(by('p10'), PH, { rng: rng(s) }).opts.findIndex(o => o.ok));
  assert.ok(pos.size >= 3);
});

/* ---- 空欄補充 ---- */
test('空欄補充: 空欄文は ___ を1か所だけ含み、教材データの位置が空欄になる(単純な文字列置換ではない)', () => {
  const p = by('p10'),
    q = L.makeCloze(p, { rng: rng(3) });
  assert.equal(q.sentence, "Je voudrais ___ café, s'il vous plaît.");
  assert.equal(q.skill, 'cloze');
  PH.filter(x => x.cloze).forEach(x => {
    const s = L.makeCloze(x).sentence;
    assert.equal(s.split('___').length, 2, x.id);
    assert.equal(s.replace('___', x.cloze.answer), x.fr, x.id);
  });
  assert.equal(L.makeCloze(by('p09')), null, 'cloze データがない構文では作らない');
});
test('空欄補充: 正解の候補だけが正答になる(un → 正解 / une, des, la → 不正解)', () => {
  const q = L.makeCloze(by('p10'), { rng: rng(5) });
  assert.deepEqual(q.opts.map(o => o.t).sort(), ['des', 'la', 'un', 'une']);
  q.opts.forEach((o, i) => assert.equal(L.checkCloze(q, i), o.t === 'un'));
  assert.equal(q.opts.filter(o => o.ok).length, 1);
  assert.equal(L.clozeFilled(by('p10'), 'un'), by('p10').fr);
  assert.notEqual(L.clozeFilled(by('p10'), 'une'), by('p10').fr);
});
test('空欄補充: 全構文で、正解は1つだけ・完成文は教材の文と一致・誤答は一致しない', () => {
  PH.filter(p => p.cloze).forEach(p => {
    for (let s = 1; s <= 20; s++) {
      const q = L.makeCloze(p, { rng: rng(s) });
      assert.equal(q.opts.length, 4);
      assert.equal(q.opts.filter((o, i) => L.checkCloze(q, i)).length, 1, p.id);
      assert.equal(L.clozeFilled(p, q.opts.find(o => o.ok).t), p.fr);
    }
  });
});
test('空欄補充: 前後に文字が付く空欄(pre / post)も判定できる(Pouvez-vous / très bien / ne sais pas)', () => {
  const a = L.makeCloze(by('p17'), { rng: rng(1) });
  assert.equal(a.sentence, "___-vous répéter, s'il vous plaît ?");
  const b = L.makeCloze(by('p05'), { rng: rng(1) });
  assert.equal(b.sentence, 'Ça va très ___, merci.');
  const c = L.makeCloze(by('p19'), { rng: rng(1) });
  assert.equal(c.sentence, 'Je ne ___ pas.');
  assert.equal(c.opts.find(o => o.ok).t, 'sais');
});
test('空欄補充: 採点は問題データの ok に頼らない(ok を書き換えても、正解の語だけが正答)', () => {
  const q = L.makeCloze(by('p10'), { rng: rng(2) });
  q.opts.forEach(o => {
    o.ok = true;
  });
  assert.equal(q.opts.filter((o, i) => L.checkCloze(q, i)).length, 1);
  const r = L.makeChoice(by('p10'), PH, { rng: rng(2) });
  r.opts.forEach(o => {
    o.ok = true;
  });
  assert.equal(r.opts.filter((o, i) => L.checkChoice(r, i)).length, 1);
});

/* ---- 語順整序 ---- */
const ordQ = (id, seed) => L.makeOrdering(by(id), { rng: rng(seed || 1) });
test('語順整序: カードは chunks の数だけ・ユニークなID・最初から正解の並びではない', () => {
  PH.filter(p => p.chunks.length >= 2).forEach(p => {
    for (let s = 1; s <= 30; s++) {
      const q = L.makeOrdering(p, { rng: rng(s) });
      assert.equal(q.cards.length, p.chunks.length);
      assert.equal(new Set(q.cards.map(c => c.cid)).size, q.cards.length);
      assert.equal(q.skill, 'ordering');
      assert.notDeepEqual(
        q.cards.map(c => c.t),
        p.chunks.map(c => c.t),
        p.id + ' が最初から正解順'
      );
    }
  });
  assert.equal(L.makeOrdering(synth('s', [C('Merci', 'a', '.')])), null, '語句が1つでは作らない');
});
test('語順整序: 語句を選んで追加・取り消し・全部もどすができ、元の配列は変更されない', () => {
  const q = ordQ('p10');
  let sel = L.orderingReset();
  assert.deepEqual(sel, []);
  const s1 = L.orderingAdd(q, sel, 'c1');
  assert.deepEqual(s1, ['c1']);
  assert.deepEqual(sel, [], '元の配列は不変');
  const s2 = L.orderingAdd(q, s1, 'c0');
  assert.deepEqual(s2, ['c1', 'c0']);
  assert.deepEqual(L.orderingAdd(q, s2, 'c1'), ['c1', 'c0'], '同じカードは2回追加できない');
  assert.deepEqual(L.orderingAdd(q, s2, 'zzz'), ['c1', 'c0'], '存在しないカードは無視');
  assert.deepEqual(L.orderingRemove(q, s2, 'c1'), ['c0']);
  assert.deepEqual(L.orderingRemove(q, s2, 'nothing'), ['c1', 'c0']);
  assert.deepEqual(s2, ['c1', 'c0']);
  assert.deepEqual(L.orderingReset(), []);
});
test('語順整序: 正しい順番だけが正解(句読点つきの文が教材データと一致)。不足・順序違いは不正解', () => {
  const p = by('p10'),
    q = ordQ('p10');
  assert.equal(L.orderingText(q, ['c0', 'c1', 'c2']), "Je voudrais un café, s'il vous plaît.");
  assert.equal(L.orderingCheck(q, ['c0', 'c1', 'c2']), true);
  [
    ['c2', 'c1', 'c0'],
    ['c1', 'c0', 'c2'],
    ['c0', 'c2', 'c1'],
    ['c0', 'c1'],
    [],
    ['c0', 'c1', 'c2', 'c2'],
    ['c0', 'c0', 'c1']
  ].forEach(s => assert.equal(L.orderingCheck(q, s), false, s.join()));
  assert.equal(
    L.orderingText(q, ['c2', 'c1', 'c0']),
    "s'il vous plaît. un café, Je voudrais",
    '誤答時の自分の答えを表示できる'
  );
  PH.filter(x => x.chunks.length >= 2).forEach(x => {
    const qq = L.makeOrdering(x, { rng: rng(4) });
    assert.equal(
      L.orderingCheck(
        qq,
        x.chunks.map((_, i) => 'c' + i)
      ),
      true,
      x.id
    );
    assert.equal(L.orderingCheck(qq, x.chunks.map((_, i) => 'c' + i).reverse()), false, x.id);
  });
});
test('語順整序: 順番は教材の chunks 順で決まる(カードの並びや表示文字列からは推測しない)', () => {
  for (let s = 1; s <= 20; s++) {
    const q = ordQ('p17', s);
    const bySortedCards = q.cards
      .slice()
      .sort((a, b) => a.t.localeCompare(b.t))
      .map(c => c.cid);
    assert.equal(L.orderingCheck(q, ['c0', 'c1', 'c2']), true);
    assert.equal(L.orderingCheck(q, bySortedCards), bySortedCards.join() === 'c0,c1,c2');
  }
});
test('語順整序: 同じ語句が複数回出る文でも、カードを別々に扱い、同じ見た目のカードどうしの入れ替えは正解になる', () => {
  const p = synth('dup', [
    C('non', 'いいえ', ','),
    C('non', 'いいえ', ','),
    C('non', 'いいえ', '.')
  ]);
  assert.equal(p.fr, 'non, non, non.');
  const q = L.makeOrdering(p, { rng: rng(3) });
  assert.equal(new Set(q.cards.map(c => c.cid)).size, 3, 'IDは別々');
  let sel = [];
  ['c1', 'c0'].forEach(c => {
    sel = L.orderingAdd(q, sel, c);
  });
  assert.deepEqual(sel, ['c1', 'c0']);
  assert.equal(
    L.orderingCheck(q, ['c1', 'c0', 'c2']),
    true,
    'non, と non, は同じカードなので入れ替えても正解'
  );
  assert.equal(
    L.orderingCheck(q, ['c2', 'c0', 'c1']),
    false,
    '最後の non. を先頭に置くと不正解(句読点が違う)'
  );
  assert.equal(L.orderingCheck(q, ['c0', 'c1', 'c2']), true);
  const same = synth('dup2', [C('oui', 'はい'), C('oui', 'はい'), C('merci', 'どうも', '.')]);
  const q2 = L.makeOrdering(same, { rng: rng(9) });
  assert.equal(L.orderingCheck(q2, ['c1', 'c0', 'c2']), true, '完全に同じ2枚の入れ替えは正解');
  assert.equal(L.orderingCheck(q2, ['c0', 'c1', 'c2']), true);
  assert.equal(L.orderingCheck(q2, ['c0', 'c2', 'c1']), false);
  assert.equal(L.orderingCheck(q2, ['c0', 'c0', 'c2']), false, '同じカードを2回使えない');
});
test('語順整序: sp:false の語句は後ろに空白を入れない(アポストロフィで分けたい教材にも対応)', () => {
  const p = synth('apo', [{ t: "l'", ja: 'その', after: '', sp: false }, C('eau', '水', '.')]);
  assert.equal(p.fr, "l'eau.");
  assert.equal(L.orderingCheck(L.makeOrdering(p, { rng: rng(1) }), ['c0', 'c1']), true);
});
test('makeQuestion: 形式ごとに正しい問題を作り、不明な形式は null', () => {
  assert.equal(L.makeQuestion(by('p10'), 'choice', PH).kind, 'choice');
  assert.equal(L.makeQuestion(by('p10'), 'cloze', PH).kind, 'cloze');
  assert.equal(L.makeQuestion(by('p10'), 'ordering', PH).kind, 'ordering');
  assert.equal(L.makeQuestion(by('p10'), 'x', PH), null);
  assert.deepEqual(L.SKILLS, ['meaning', 'cloze', 'ordering']);
  L.SKILLS.forEach(k => assert.equal(L.SKILL_OF[L.FORMAT_OF[k]], k));
});

/* ---- 学習記録 ---- */
test('記録: 技能ごと(意味・空欄・語順)に出題数・正答数・連続正解・復習時刻が独立して保存される', () => {
  const r = L.newRec();
  L.recordAnswer(r, 'meaning', true, T0);
  L.recordAnswer(r, 'meaning', false, T0 + 1);
  L.recordAnswer(r, 'cloze', true, T0 + 2);
  assert.deepEqual(
    [r.sk.meaning.n, r.sk.meaning.ok, r.sk.meaning.ng, r.sk.meaning.st],
    [2, 1, 1, 0]
  );
  assert.deepEqual([r.sk.cloze.n, r.sk.cloze.ok, r.sk.cloze.st], [1, 1, 1]);
  assert.deepEqual(
    [r.sk.ordering.n, r.sk.ordering.ok, r.sk.ordering.lv],
    [0, 0, 0],
    '他の技能は変わらない'
  );
  assert.deepEqual([r.intro, r.n, r.ok, r.ng, r.st, r.last, r.at], [1, 3, 2, 1, 1, 1, T0 + 2]);
  assert.equal(r.sk.cloze.last, 1);
  assert.equal(r.sk.meaning.last, 0);
  assert.equal(r.sk.cloze.due, T0 + 2 + 5 * MIN);
});
test('記録: 連続正解数・正答率・段階・復習時刻の更新(時期前の正解では段階が上がらない)', () => {
  const r = L.newRec(),
    d = r.sk.meaning;
  L.recordAnswer(r, 'meaning', true, T0);
  assert.deepEqual([d.lv, d.due], [1, T0 + 5 * MIN]);
  L.recordAnswer(r, 'meaning', true, T0 + MIN);
  assert.deepEqual(
    [d.lv, d.st, d.ok, d.n],
    [1, 2, 2, 2],
    '時期前の正解は段階そのまま・連続正解は増える'
  );
  L.recordAnswer(r, 'meaning', true, T0 + 6 * MIN);
  assert.deepEqual([d.lv, d.due], [2, T0 + 6 * MIN + DAY]);
  L.recordAnswer(r, 'meaning', true, T0 + 6 * MIN + DAY);
  L.recordAnswer(r, 'meaning', true, T0 + 7 * DAY);
  L.recordAnswer(r, 'meaning', true, T0 + 20 * DAY);
  assert.equal(d.lv, 4, '段階の上限は4');
  L.recordAnswer(r, 'meaning', false, T0 + 21 * DAY);
  assert.deepEqual(
    [d.lv, d.st, d.last, d.due],
    [0, 0, 0, T0 + 21 * DAY],
    '誤答は段階0・すぐ復習対象'
  );
  assert.equal(r.due, T0 + 21 * DAY);
  assert.equal(d.ok / d.n, 6 / 7);
});
test('記録: 構文全体の次回復習時刻は、回答済みの技能のうち最も早いもの(単位は単語と同じミリ秒)', () => {
  const r = L.newRec();
  L.recordAnswer(r, 'meaning', true, T0);
  L.recordAnswer(r, 'ordering', true, T0 + DAY);
  assert.equal(r.due, T0 + 5 * MIN);
  assert.deepEqual(L.INT, [0, 5 * MIN, DAY, 3 * DAY, 7 * DAY]);
  assert.equal(L.newRec().due, 0);
});
test('記録の整形: 不正な値(負数・文字列・範囲外・矛盾)を安全な初期値にし、回答数と矛盾する値を直す', () => {
  const r = L.cleanRec({
    intro: 'x',
    n: 99,
    sk: {
      meaning: { lv: 99, n: 'a', ok: -3, last: 7, due: 'x' },
      cloze: { lv: 2, n: 3, ok: 9, ng: 9, st: 9, last: 1, due: 5 },
      ordering: null,
      bogus: { n: 5 }
    }
  });
  assert.deepEqual(r.sk.meaning, L.newSkill());
  assert.deepEqual(
    [r.sk.cloze.n, r.sk.cloze.ok, r.sk.cloze.ng, r.sk.cloze.st, r.sk.cloze.lv],
    [3, 3, 0, 3, 2]
  );
  assert.deepEqual(r.sk.ordering, L.newSkill());
  assert.equal(r.sk.bogus, undefined);
  assert.deepEqual([r.n, r.ok, r.intro], [3, 3, 1], '合計は技能の合計から求める');
  assert.deepEqual(L.cleanRec(null), L.newRec());
  assert.deepEqual(L.cleanRec([]), L.newRec());
  const o = L.cleanRec({ intro: 1 });
  assert.deepEqual([o.intro, o.n, o.due], [1, 0, 0], '回答のない既習は intro だけ');
});
test('記録の整形(一覧): 教材にないIDの記録も残し、不正なID・__proto__・配列は捨てる。何度整形しても結果が変わらない', () => {
  const src = JSON.parse(
    '{"p01":{"intro":1,"sk":{"meaning":{"lv":2,"n":3,"ok":3,"st":3,"last":1,"due":123}}},"gone_phrase":{"intro":1},"BAD ID":{"intro":1},"__proto__":{"intro":1},"p02":5}'
  );
  const a = L.cleanState(src);
  assert.ok(a.p01 && a.gone_phrase && a.p02);
  assert.equal(a['BAD ID'], undefined);
  assert.equal(Object.getPrototypeOf(a), Object.prototype);
  assert.equal(a.p01.sk.meaning.lv, 2);
  assert.deepEqual(L.cleanState(a), a);
  assert.deepEqual(L.cleanState(L.cleanState(a)), a);
  assert.deepEqual(L.cleanState(null), {});
  assert.deepEqual(L.cleanState([1]), {});
  assert.deepEqual(L.cleanState('x'), {});
  assert.deepEqual(L.cleanDaily({ d: '20260101', xp: 50 }), { d: '20260101', xp: 50 });
  assert.deepEqual(L.cleanDaily({ d: 'x', xp: 5 }), { d: '', xp: 0 });
  assert.equal(L.cleanDaily({ d: '20260101', xp: 99999 }).xp, L.REWARD.dailyCap);
});
test('記録: JSONに保存して読み直しても、同じ状態に戻る(再保存で情報が失われない)', () => {
  const recs = {};
  ['p01', 'p10', 'p17'].forEach((id, i) => {
    recs[id] = L.newRec();
    L.recordAnswer(recs[id], 'meaning', true, T0 + i);
    L.recordAnswer(recs[id], 'ordering', false, T0 + i + 1);
  });
  const once = L.cleanState(JSON.parse(JSON.stringify(recs)));
  assert.deepEqual(once, recs);
  assert.deepEqual(L.cleanState(JSON.parse(JSON.stringify(once))), recs);
});

/* ---- 状態・習得・復習 ---- */
test('状態: 未学習 → 学習中 → 復習待ち → 習得済み。習得にはその構文で出題される全技能の2連続正解が必要', () => {
  const p = by('p10'),
    r = L.newRec(),
    st = t => L.status(r, p, t);
  assert.equal(L.status(undefined, p, T0), 'new');
  assert.equal(L.status(L.newRec(), p, T0), 'new');
  ['meaning', 'cloze', 'ordering'].forEach(k => L.recordAnswer(r, k, true, T0));
  assert.equal(st(T0 + MIN), 'learning', 'lv1 では習得ではない');
  assert.equal(st(T0 + 6 * MIN), 'review', '5分後に復習時期');
  ['meaning', 'cloze', 'ordering'].forEach(k => L.recordAnswer(r, k, true, T0 + 6 * MIN));
  assert.equal(st(T0 + 7 * MIN), 'mastered');
  assert.equal(st(T0 + 6 * MIN + DAY + 1), 'review', '時期が来たら復習待ち');
  const r2 = L.newRec();
  ['meaning', 'cloze'].forEach(k => {
    L.recordAnswer(r2, k, true, T0);
    L.recordAnswer(r2, k, true, T0 + 6 * MIN);
  });
  assert.equal(
    L.status(r2, p, T0 + 7 * MIN),
    'learning',
    '語順をまだ答えていない構文は習得済みではない(意味・空欄だけでは他の技能を習得とみなさない)'
  );
});
test('状態: cloze データがない構文は、意味・語順だけで習得できる。誤答直後は復習待ち', () => {
  const p = by('p09');
  assert.deepEqual(L.skillsOf(p), ['meaning', 'ordering']);
  const r = L.newRec();
  ['meaning', 'ordering'].forEach(k => {
    L.recordAnswer(r, k, true, T0);
    L.recordAnswer(r, k, true, T0 + 6 * MIN);
  });
  assert.equal(L.status(r, p, T0 + 7 * MIN), 'mastered');
  L.recordAnswer(r, 'ordering', false, T0 + 8 * MIN);
  assert.equal(L.status(r, p, T0 + 8 * MIN), 'review');
  assert.equal(L.masteredCount(PH, { p09: r }, T0 + 7 * MIN), 0);
  const ok = { p09: L.newRec() };
  ['meaning', 'ordering'].forEach(k => {
    L.recordAnswer(ok.p09, k, true, T0);
    L.recordAnswer(ok.p09, k, true, T0 + 6 * MIN);
  });
  assert.equal(L.masteredCount(PH, ok, T0 + 7 * MIN), 1);
});
test('技能の選び方: 復習は期限が来た技能のうち正答率の低いもの。学習は未回答の技能を 意味→空欄→語順 の順に', () => {
  const p = by('p10'),
    r = L.newRec();
  assert.equal(L.pickSkill(r, p, T0, false), 'meaning');
  L.recordAnswer(r, 'meaning', true, T0);
  assert.equal(L.pickSkill(r, p, T0 + 1, false), 'cloze');
  L.recordAnswer(r, 'cloze', true, T0);
  assert.equal(L.pickSkill(r, p, T0 + 1, false), 'ordering');
  L.recordAnswer(r, 'ordering', false, T0);
  L.recordAnswer(r, 'meaning', true, T0 + 1);
  assert.equal(
    L.pickSkill(r, p, T0 + 6 * MIN, true),
    'ordering',
    '誤答のあった(正答率0)語順を優先'
  );
  const r2 = L.newRec();
  L.recordAnswer(r2, 'meaning', true, T0);
  L.recordAnswer(r2, 'cloze', true, T0 + DAY * 5);
  assert.equal(L.pickSkill(r2, p, T0 + DAY, true), 'meaning', '期限が来ている技能だけが対象');
});
test('復習リスト: 復習待ちだけが対象。優先順は 誤答あり → 段階が低い → 期限が古い', () => {
  const recs = {},
    mk = (id, f) => {
      recs[id] = L.newRec();
      f(recs[id]);
    };
  // lv2 期限 T0+6分+1日
  mk('p01', r => {
    L.recordAnswer(r, 'meaning', true, T0);
    L.recordAnswer(r, 'meaning', true, T0 + 6 * MIN);
  });
  // lv1 期限 T0+5分
  mk('p02', r => L.recordAnswer(r, 'meaning', true, T0));
  // 誤答あり
  mk('p03', r => {
    L.recordAnswer(r, 'meaning', true, T0 + 10 * DAY);
    L.recordAnswer(r, 'cloze', false, T0 + 10 * DAY + 5);
  });
  // まだ期限前
  mk('p04', r => L.recordAnswer(r, 'meaning', true, T0 + 20 * DAY));
  const now = T0 + 10 * DAY + 10;
  assert.deepEqual(
    L.reviewList(PH, recs, now).map(p => p.id),
    ['p03', 'p02', 'p01']
  );
  assert.ok(!L.reviewList(PH, recs, now).some(p => p.id === 'p04'));
  assert.deepEqual(
    L.nextDueList(PH, recs, 2).map(x => x.p.id),
    ['p02', 'p01']
  );
});
test('出題リスト(学習): 場面内の新しい構文を最大2つ、各構文の全技能を「意味→空欄→語順」の順に構文を交互に出す', () => {
  const q = L.buildQueue(PH, {}, { kind: 'learn', scene: 'all', now: T0 });
  assert.deepEqual(
    q.map(x => x.pid + ':' + x.skill),
    ['p01:meaning', 'p02:meaning', 'p01:cloze', 'p02:cloze', 'p01:ordering', 'p02:ordering']
  );
  const s = L.buildQueue(PH, {}, { kind: 'learn', scene: 'shop', now: T0 });
  assert.ok(s.every(x => by(x.pid).scene === 'shop'));
  assert.equal(s[0].pid, 'p10');
  const p9 = L.buildQueue(PH, {}, { kind: 'learn', scene: 'ask', now: T0 }).filter(
    x => x.pid === 'p09'
  );
  assert.ok(
    p9.every(x => x.skill !== 'cloze'),
    'cloze のない構文に空欄は出さない'
  );
  assert.deepEqual(L.buildQueue(PH, {}, { kind: 'learn', scene: 'none', now: T0 }), []);
});
test('出題リスト(学習): 新しい構文がない場面では、復習待ち・学習中・習得済みの順で最大4つを各1問', () => {
  const recs = {};
  PH.filter(p => p.scene === 'ask').forEach(p => {
    recs[p.id] = L.newRec();
    L.recordAnswer(recs[p.id], 'meaning', true, T0);
  });
  const q = L.buildQueue(PH, recs, { kind: 'learn', scene: 'ask', now: T0 + MIN });
  assert.equal(q.length, 4);
  assert.equal(new Set(q.map(x => x.pid)).size, 4);
  const q2 = L.buildQueue(PH, recs, { kind: 'learn', scene: 'ask', now: T0 + 6 * MIN });
  assert.equal(q2.length, 4);
});
test('出題リスト(復習): 復習待ちだけを最大6つ。ないときは空。選ばれる技能は期限が来たもの', () => {
  assert.deepEqual(L.buildQueue(PH, {}, { kind: 'review', now: T0 }), []);
  const recs = {};
  PH.slice(0, 8).forEach(p => {
    recs[p.id] = L.newRec();
    L.recordAnswer(recs[p.id], 'meaning', true, T0);
    L.recordAnswer(recs[p.id], 'ordering', true, T0 + 3 * DAY);
  });
  const q = L.buildQueue(PH, recs, { kind: 'review', scene: 'all', now: T0 + DAY });
  assert.equal(q.length, 6);
  assert.ok(
    q.every(x => x.skill === 'meaning'),
    '期限が来ているのは意味だけ'
  );
  assert.deepEqual(
    L.buildQueue(PH, recs, { kind: 'review', scene: 'ask', now: T0 + DAY }).map(x => x.pid),
    ['p06', 'p07', 'p08'],
    '場面で絞り込める'
  );
  assert.deepEqual(
    L.buildQueue(PH, recs, { kind: 'review', scene: 'shop', now: T0 + DAY }),
    [],
    '該当なしは空'
  );
});

/* ---- 報酬 ---- */
test('報酬: 復習の時期が来た(または初めての)技能への正解だけ満額。時期前は0・誤答直後の正解は少なめ・誤答は1回だけ少し', () => {
  const R = L.REWARD,
    rec = L.newRec(),
    d = rec.sk.meaning;
  assert.equal(L.rewardFor(d, true, T0, false), R.correct, '初めての技能');
  L.recordAnswer(rec, 'meaning', true, T0); // 回答済みにする
  assert.equal(L.rewardFor(d, true, T0 + MIN, false), 0, '時期前の正解は0(練習し放題で稼げない)');
  assert.equal(L.rewardFor(d, true, T0 + 6 * MIN, false), R.correct, '時期が来た');
  assert.equal(L.rewardFor(d, false, T0 + MIN, true), R.miss);
  assert.equal(L.rewardFor(d, false, T0 + MIN, false), 0, '同じ技能の2回目以降の誤答は0');
  const m = L.newSkill();
  m.n = 1;
  m.last = 0;
  m.due = T0;
  assert.equal(L.rewardFor(m, true, T0 + 1, false), R.recover);
  assert.ok(R.recover < R.correct, 'わざと間違えて稼げない');
  assert.ok(R.miss + R.recover < R.correct);
});
test('報酬: わざと間違えて正解し直すループでも、正しく答え続けるより得にならない', () => {
  const R = L.REWARD,
    r = L.newRec();
  let honest = 0,
    loop = 0;
  honest += L.rewardFor(r.sk.meaning, true, T0, false);
  L.recordAnswer(r, 'meaning', true, T0);
  for (let i = 1; i <= 10; i++) {
    const t = T0 + i;
    loop += L.rewardFor(r.sk.meaning, false, t, i === 1);
    L.recordAnswer(r, 'meaning', false, t);
    loop += L.rewardFor(r.sk.meaning, true, t + 1, false);
    L.recordAnswer(r, 'meaning', true, t + 1);
  }
  assert.ok(loop <= R.miss + 10 * R.recover);
  assert.ok(honest === R.correct);
});
test('報酬: 1日の上限(dailyCap)。日付が変わると再び獲得できる', () => {
  const daily = { d: '', xp: 0 };
  let got = 0;
  for (let i = 0; i < 40; i++) got += L.capDaily(daily, 8, T0);
  assert.equal(got, L.REWARD.dailyCap);
  assert.equal(daily.xp, L.REWARD.dailyCap);
  assert.equal(L.capDaily(daily, 8, T0 + 1000), 0);
  assert.equal(L.capDaily(daily, 8, T0 + 2 * DAY), 8, '翌日はリセット');
  assert.equal(daily.d, L.dayKey(T0 + 2 * DAY));
  assert.equal(L.capDaily({ d: '', xp: 0 }, 0, T0), 0);
  assert.equal(L.capDaily({ d: L.dayKey(T0), xp: 119 }, 8, T0), 1);
});

/* ---- 称号・検索 ---- */
test('称号: 習得した構文の最大数で決まる(単語の称号とは別)', () => {
  assert.equal(L.titleOf(0), null);
  assert.equal(L.titleOf(3).name, 'ぶんけい見習い');
  assert.equal(L.titleOf(9).name, 'ぶんけい使い');
  assert.equal(L.titleOf(15).name, 'ぶんけい名人');
  assert.ok(L.TITLES.every(t => /^ぶんけい/.test(t.name)));
});
test('検索: フランス語(アクセットなしでも)・日本語・型・場面名・語句の意味で見つかる。空欄は全件', () => {
  const sc = {
    greeting: 'あいさつ・自己紹介',
    ask: '質問・確認',
    shop: '買い物・注文',
    daily: '日常生活・依頼',
    plan: '否定・予定・希望'
  };
  assert.ok(L.search(PH, 'cafe', sc).some(p => p.id === 'p10'));
  assert.ok(L.search(PH, 'coûte', sc).some(p => p.id === 'p12'));
  assert.ok(L.search(PH, 'コーヒー', sc).some(p => p.id === 'p04'));
  assert.ok(L.search(PH, 'Je voudrais', sc).length >= 2);
  assert.ok(L.search(PH, '買い物', sc).length >= 4);
  assert.ok(L.search(PH, 'est-ce que', sc).some(p => p.id === 'p08'));
  assert.equal(L.search(PH, '   ', sc).length, PH.length);
  assert.equal(L.search(PH, 'zzzz', sc).length, 0);
  const and = L.search(PH, 'voudrais cafe', sc).map(p => p.id);
  assert.ok(and.includes('p10'));
  assert.deepEqual(
    onlyBaseline(and),
    ['p10'],
    '複数語はすべて含むものだけ(AND検索)。出荷済みの構文では p10 だけ'
  );
  L.search(PH, 'voudrais cafe', sc).forEach(p => {
    const hay = L.search([p], 'voudrais', sc).length && L.search([p], 'cafe', sc).length;
    assert.ok(hay, p.id + ' は両方の語を含む');
  });
});
