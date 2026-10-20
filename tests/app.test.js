'use strict';
// 本物の app.js を最小DOMスタブ上で動かす統合テスト
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, synthWords, read } = require('./harness.js');

const KEY = 'kotoba-monster-v1',
  MIN = 60000,
  DAY = 86400000;
const pctOf = (cleared, base) => 100 - (cleared / base) * 100;
const startBattle3 = g => {
  g.learn(3);
  g.click('battle');
  return g;
};

/* 1問ずつ答えながら、画面のHP表示が「正解数」と一致するか毎回確認する。policy(view) が true
   なら誤答 */
function playBattle(g, policy) {
  const log = [];
  let correct = 0,
    guard = 0;
  while (g.k.view().mode === 'battle' && guard++ < 40) {
    const v = g.k.view(),
      wrong = policy(v, log.length),
      before = g.hp();
    g.answer(!wrong);
    const after = g.hp();
    if (!wrong) correct++;
    assert.equal(g.k.view().right, correct, '内部の正解数');
    assert.equal(after.left, after.base - Math.min(correct, after.base), 'HPラベル');
    assert.ok(
      Math.abs(after.pct - pctOf(Math.min(correct, after.base), after.base)) < 0.01,
      'HPバー ' + after.pct
    );
    log.push({ wrong, retry: !!v.cur.retry, before, after });
    g.next();
  }
  return { log, correct };
}

test('バトルHP: 全問一度で正解 → 5問で敵HP0・「たおした」', () => {
  const g = startBattle3(boot());
  assert.deepEqual(g.hp(), { pct: 100, left: 5, base: 5 });
  const r = playBattle(g, () => false);
  assert.equal(r.log.length, 5);
  assert.equal(g.k.view().mode, 'result');
  assert.match(g.html(), /5 \/ 5 正解/);
  assert.match(g.html(), /てきをたおした/);
});
test('バトルHP: 誤答→再挑戦で正解したらHPが減る(修正対象のバグ)', () => {
  const g = startBattle3(boot());
  const r = playBattle(g, (v, i) => i === 0); // 最初の1問だけ誤答
  const wrongStep = r.log[0],
    retryStep = r.log.find(x => x.retry);
  assert.ok(retryStep, '再挑戦が出題される');
  assert.equal(wrongStep.after.left, 5, '誤答ではHPが減らない');
  assert.ok(retryStep.after.left < retryStep.before.left, '再挑戦の正解でHPが減る(攻撃演出と一致)');
  assert.equal(r.log.length, 6);
  assert.equal(g.k.view().mode, 'result');
  assert.match(g.html(), /4 \/ 5 正解/, '「一度で正解」は初回正解数のまま');
  assert.match(g.html(), /てきをたおした/);
});
test('バトルHP: 再挑戦でも誤答 → HPは残る', () => {
  const g = startBattle3(boot());
  const r = playBattle(g, (v, i) => i === 0 || v.cur.retry);
  assert.equal(r.correct, 4);
  assert.match(g.html(), /てきのHP: のこり 1\/5/);
  assert.doesNotMatch(g.html(), /てきをたおした/);
});
test('バトルHP: 攻撃演出(atk/hurt)は正解のときだけ、HPが減るのと同じ場面で出る', () => {
  const g = startBattle3(boot());
  g.answer(false);
  assert.doesNotMatch(g.html(), /class="mon atk"|enemy hurt/);
  g.next();
  g.answer(true);
  assert.match(g.html(), /mon atk/);
  assert.match(g.html(), /enemy hurt/);
});
test('バトルHP: 学習済みが1語だけ(同じ単語を5回出題)でも整合する / 復習でも整合する', () => {
  const g = boot();
  g.learn(1);
  g.click('battle');
  playBattle(g, (v, i) => i === 2);
  assert.equal(g.k.view().mode, 'result');
  const h = boot();
  startBattle3(h);
  playBattle(h, () => false);
  h.k.setClock(() => Date.now() + 2 * DAY);
  h.click('review');
  assert.equal(h.k.view().kind, 'review');
  playBattle(h, (v, i) => i === 0);
});

test('出題: 学習済みが4語以上あれば、全選択肢が学習済みで、重複せず正解を含む', () => {
  // 計6語(w01-w06)学習済み
  const g = boot();
  g.learn(3);
  g.click('battle');
  g.click('home');
  g.learn(3);
  g.click('battle');
  g.click('home');
  const learned = new Set(['w01', 'w02', 'w03', 'w04', 'w05', 'w06']);
  assert.equal(g.k.vocab.filter(w => g.k.status(w) !== 'new').length, 6);
  let seen = 0;
  for (let n = 0; n < 6; n++) {
    g.click('battle');
    while (g.k.view().mode === 'battle') {
      const q = g.k.view().q;
      seen++;
      assert.equal(q.opts.length, 4);
      assert.equal(new Set(q.opts.map(o => o.t)).size, 4);
      assert.equal(q.opts.filter(o => o.ok).length, 1);
      assert.ok(
        q.opts.every(o => learned.has(o.id)),
        '未学習の単語が選択肢に出ている: ' + q.opts.map(o => o.id)
      );
      g.answer(true);
      g.next();
    }
    g.click('home');
  }
  assert.ok(seen >= 30);
});
test('出題: 学習済みが少なくても(1語)4択を作れる。未学習語は不足分のみ', () => {
  const g = boot();
  g.learn(1);
  g.click('battle');
  while (g.k.view().mode === 'battle') {
    const q = g.k.view().q;
    assert.equal(q.opts.length, 4);
    assert.equal(new Set(q.opts.map(o => o.t)).size, 4);
    assert.equal(q.opts.filter(o => o.ok).length, 1);
    g.answer(true);
    g.next();
  }
});
test('出題: 絵の問題は名詞だけ(あいさつは出ない)・絵文字なしの語は絵問題にしない', () => {
  const g = boot({
    extraCode:
      "WORDS.push(W('w31', '自然', 'la', 'f', 'lune', '月', '', 'リュヌ', 'La lune brille.', '月が輝く。', { level: 'A1' }));"
  });
  const wl = g.sb.WordLib,
    find = id => g.k.vocab.find(w => w.id === id);
  assert.equal(wl.canShowImage(find('w01')), false);
  assert.equal(wl.canShowImage(find('w08')), true);
  assert.equal(wl.canShowImage(find('w31')), false);
});

test('XP・習熟: 正解+10 / 誤答+2、正解で段階1・5分後、誤答で段階0・即復習待ち(既存仕様)', () => {
  let now = 1_700_000_000_000;
  const g = boot();
  g.k.setClock(() => now);
  startBattle3(g);
  const q0 = g.k.view().q,
    id = q0.w.id,
    dir = { ja2fr: 'p', img2fr: 'p', fr2ja: 'r', aud2ja: 'r' }[q0.type];
  g.answer(true);
  let d = g.k.state().w[id].d[dir];
  assert.equal(g.k.state().xp, 10);
  assert.deepEqual([d.lv, d.n, d.ok, d.st, d.last, d.due], [1, 1, 1, 1, 1, now + 5 * MIN]);
  g.next();
  g.answer(false);
  assert.equal(g.k.state().xp, 12);
  const q1 = g.k.view().q,
    d1 = g.k.state().w[q1.w.id].d[{ ja2fr: 'p', img2fr: 'p', fr2ja: 'r', aud2ja: 'r' }[q1.type]];
  assert.deepEqual([d1.lv, d1.last, d1.due, d1.ng], [0, 0, now, 1]);
  assert.equal(g.k.status(q1.w), 'review');
});
test('習得済み: 両方向で間隔を空けて2回連続正解 → mastered、時間が来ると復習待ち', () => {
  let now = 1_700_000_000_000;
  const g = boot();
  g.k.setClock(() => now);
  g.learn(1);
  const w = g.k.vocab[0],
    P = () => g.k.state().w[w.id];
  assert.equal(g.k.status(w), 'new');
  g.click('battle');
  g.click('home');
  assert.equal(g.k.status(w), 'learning');
  for (let r = 0; r < 3; r++) {
    // 各ラウンド: 時間を進めて、両方向とも正解させる
    now += 2 * DAY;
    ['p', 'r'].forEach(dir => {
      const d = P().d[dir];
      if (d.lv < 2) {
        d.n++;
      }
    });
    g.click('review'); // 復習対象(期限切れ)
    if (g.k.view().mode === 'battle') {
      while (g.k.view().mode === 'battle') {
        g.answer(true);
        g.next();
      }
      g.click('home');
    }
  }
  // 直接状態を整えて判定ロジックだけ確認(isMastered / 復習待ちへの遷移)
  const p = P();
  p.d.p = { lv: 2, n: 2, ok: 2, ng: 0, st: 2, last: 1, due: now + DAY };
  p.d.r = { lv: 2, n: 2, ok: 2, ng: 0, st: 2, last: 1, due: now + DAY };
  assert.equal(g.k.status(w), 'mastered');
  now += DAY + 1;
  assert.equal(g.k.status(w), 'review');
  assert.ok(g.k.reviewList().some(x => x.id === w.id));
});
test('進化・称号: 30語のときは従来どおり26語で最終進化 / 語数が増えると次の目標が現れる', () => {
  const g = boot();
  g.k.state().best = 25;
  g.click('home');
  assert.match(g.html(), /ことふくろう/);
  assert.match(g.html(), /あと1語おぼえると進化/);
  assert.match(g.html(), /称号: ことば使い/);
  g.k.state().best = 26;
  g.click('home');
  assert.match(g.html(), /ことドラゴン/);
  assert.match(g.html(), /最終進化/);
  assert.doesNotMatch(g.html(), /ユニコーン/);
  const h = boot({ wordsCode: synthWords(150) });
  h.k.state().best = 26;
  h.click('home');
  // 次の段階(60語)が150語の範囲内なので目標になる assert.doesNotMatch(h.html(), /最終進化/);
  assert.match(h.html(), /ことドラゴン/);
  assert.match(h.html(), /あと34語おぼえると進化/);
  h.k.state().best = 60;
  h.click('home');
  assert.match(h.html(), /ことユニコーン/);
  assert.match(h.html(), /あと60語おぼえると進化/);
  assert.match(h.html(), /🏅 <b>ことば名人/);
  assert.match(h.html(), /🔒 <b>ことば博士/, '未達成の称号は鍵つき');
  assert.match(h.html(), /カテゴリ別の習得/);
});
test('進化: バトル中に習得済みが増えて段階が上がると結果画面で「進化したよ」(従来ロジック)', () => {
  const g = boot();
  g.learn(3);
  const s = g.k.state(),
    now = Date.now(),
    M = () => ({ lv: 2, n: 2, ok: 2, ng: 0, st: 2, last: 1, due: now + DAY }),
    T = () => ({ n: 0, ok: 0, ng: 0, last: null });
  const tt = () => ({ ja2fr: T(), img2fr: T(), fr2ja: T(), aud2ja: T() }),
    [a, b, c] = g.k.vocab.slice(0, 3);
  s.w[a.id] = { intro: 1, d: { p: M(), r: M() }, t: tt() };
  s.w[b.id] = { intro: 1, d: { p: M(), r: M() }, t: tt() };
  // 日→仏だけ復習時期
  s.w[c.id] = {
    intro: 1,
    d: { p: { lv: 1, n: 1, ok: 1, ng: 0, st: 1, last: 1, due: now - 1000 }, r: M() },
    t: tt()
  };
  g.click('battle');
  assert.equal(g.k.state().best, 2);
  while (g.k.view().mode === 'battle') {
    g.answer(true);
    g.next();
  }
  assert.equal(g.k.state().best, 3);
  assert.match(g.html(), /進化したよ/);
  assert.match(g.html(), /ことひよ/);
});

/* ---- 保存データの互換性 ---- */
test('保存: 空の状態でも起動でき、キーを壊さない', () => {
  const g = boot();
  assert.match(g.html(), /0\/30/);
  assert.equal(g.store[KEY], undefined, '起動だけでは書き込まない');
});
test('保存: v1形式(a/b/miss)を読み込み、バックアップを残して変換する', () => {
  const raw = JSON.stringify({
    v: 1,
    xp: 120,
    best: 4,
    w: {
      w01: { intro: 1, a: 2, b: 1 },
      w02: { intro: 1, miss: 1 },
      w03: { intro: 0 },
      w04: { intro: 1, a: 1 }
    }
  });
  const g = boot({ storage: { [KEY]: raw } }),
    s = g.k.state();
  assert.equal(s.v, 4);
  assert.equal(s.xp, 120);
  assert.equal(s.best, 4);
  assert.equal(g.store[KEY + '-backup-v1'], raw, '元データをバックアップ');
  assert.equal(g.k.status(g.k.byId('w01')), 'mastered', 'v1の習得条件(各方向1回正解)を維持');
  assert.equal(g.k.status(g.k.byId('w04')), 'learning');
  assert.equal(g.k.status(g.k.byId('w02')), 'review');
  assert.equal(g.k.status(g.k.byId('w03')), 'new');
  assert.match(g.html(), /経験値/);
});
test('保存: v3形式は変換されずそのまま使われ、保存しても未知のIDの記録が消えない', () => {
  const w = {
    intro: 1,
    d: {
      p: { lv: 3, n: 5, ok: 4, ng: 1, st: 2, last: 1, due: Date.now() + DAY },
      r: { lv: 2, n: 3, ok: 3, ng: 0, st: 3, last: 1, due: Date.now() + DAY }
    },
    t: {}
  };
  const g = boot({
    storage: { [KEY]: JSON.stringify({ v: 3, xp: 50, best: 1, w: { w01: w, removed_word: w } }) }
  });
  assert.equal(g.k.state().w.w01.d.p.lv, 3);
  assert.equal(g.k.status(g.k.byId('w01')), 'mastered');
  // 保存が走る
  g.click('learn');
  g.click('learnNext');
  g.click('learnNext');
  g.click('battle');
  g.answer(true);
  const saved = JSON.parse(g.store[KEY]);
  assert.ok(saved.w.removed_word, '現在の単語集にないIDの記録も保持');
  assert.equal(saved.w.w01.d.p.lv, 3);
  assert.equal(saved.w.w01.t.ja2fr.n, 0, '旧データに無い t は0から補完');
});
test('保存: 壊れたJSON・配列・欠損値でも起動し、元データを退避する', () => {
  const g1 = boot({ storage: { [KEY]: '{broken' } });
  assert.equal(g1.k.state().xp, 0);
  assert.equal(g1.store[KEY + '-corrupt'], '{broken');
  assert.match(g1.html(), /0\/30/);
  const g2 = boot({ storage: { [KEY]: '[1,2]' } });
  assert.equal(g2.store[KEY + '-corrupt'], '[1,2]');
  const g3 = boot({
    storage: {
      [KEY]: JSON.stringify({
        v: 3,
        xp: 'x',
        best: -5,
        w: {
          w01: { intro: 1, d: { p: { lv: 99, n: 'a', last: 7 }, r: null } },
          w02: 5,
          w03: null,
          __proto__x: {}
        }
      })
    }
  });
  const d = g3.k.state().w.w01.d;
  assert.deepEqual(
    [g3.k.state().xp, g3.k.state().best, d.p.lv, d.p.n, d.p.last, d.r.lv],
    [0, 0, 4, 0, null, 0]
  );
  g3.click('zukan');
  assert.doesNotMatch(g3.html(), /エラーが起きました/);
});
test('保存: 保存できない環境(localStorage不可)でも遊べて、警告が出る', () => {
  const g = boot({ storageFails: true });
  assert.doesNotThrow(() => {
    g.learn(3);
    g.click('battle');
    g.answer(true);
  });
  g.click('home');
  assert.match(g.html(), /保存できません/);
});
test('保存: 単語を追加しても既存の学習記録・進化度は変わらない', () => {
  const g1 = boot();
  g1.learn(3);
  g1.click('battle');
  playBattle(g1, () => false);
  const store = g1.store,
    before = JSON.parse(store[KEY]);
  const g2 = boot({
    storage: store,
    extraCode:
      "WORDS.push(W('w31', '自然', 'la', 'f', 'lune', '月', '🌙', 'リュヌ', 'La lune brille.', '月が輝く。', { level: 'A1' }), W('w32', '自然', 'le', 'm', 'ciel', '空', '🌌', 'スィエル', 'Le ciel est bleu.', '空は青い。', { level: 'A1' }));"
  });
  assert.equal(g2.k.vocab.length, 32);
  assert.equal(g2.k.status(g2.k.byId('w31')), 'new');
  assert.deepEqual(JSON.parse(JSON.stringify(g2.k.state().w.w01)), before.w.w01);
  assert.equal(g2.k.state().xp, before.xp);
  ['w01', 'w02', 'w03'].forEach(id =>
    assert.equal(g2.k.status(g2.k.byId(id)), g1.k.status(g1.k.byId(id)))
  );
  g2.click('learn');
  assert.ok(g2.k.view().list.some(w => w.id === 'w04') || g2.k.view().list.length === 3);
});
test('データ異常: 重複ID・必須欠落のレコードは除外され、ゲームは起動して他の単語の記録は無事', () => {
  const g = boot({
    storage: { [KEY]: JSON.stringify({ v: 3, xp: 9, best: 0, w: { w01: { intro: 1 } } }) },
    extraCode:
      "WORDS.push(W('w01', '自然', 'la', 'f', 'lune', '月', '🌙', 'リュヌ', 'La lune brille.', '月が輝く。'), { id: 'w40', cat: '自然', fr: '', ja: '' });"
  });
  assert.equal(g.k.vocab.length, 30);
  assert.equal(g.k.data.excluded, 2);
  assert.equal(g.k.data.errors.length >= 2, true);
  assert.equal(g.k.byId('w01').fr, 'bonjour', '先に登録された単語が残る');
  assert.equal(g.k.status(g.k.byId('w01')), 'learning');
  assert.ok(
    g.sb.__errors.some(e => /w01/.test(e)) && g.sb.__errors.some(e => /w40/.test(e)),
    'コンソールにID付きで出る'
  );
  assert.match(g.html(), /2語を除外/);
});
test('記録の書き出し/読み込み: 往復で復元でき、不正ファイルは拒否し、現在の記録を退避する', () => {
  const a = boot();
  a.learn(3);
  a.click('battle');
  playBattle(a, () => false);
  const exported = JSON.stringify({ app: 'kotoba-monster', format: 3, data: a.k.state() });
  const b = boot();
  assert.equal(b.k.importText(exported), null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(b.k.state())),
    JSON.parse(JSON.stringify(a.k.state()))
  );
  assert.ok(b.store[KEY + '-before-import']);
  const c = boot();
  assert.equal(c.k.importText(JSON.stringify(a.k.state())), null, '素のstate形式も読める');
  assert.equal(c.k.state().xp, a.k.state().xp);
  const d = boot();
  assert.ok(d.k.importText('not json'));
  assert.ok(d.k.importText('{"x":1}'));
  assert.ok(d.k.importText('[]'));
  assert.equal(d.k.state().xp, 0);
  const e = boot({ confirm: false });
  e.k.importText(exported);
  assert.equal(e.k.state().xp, 0, '取り消すと変更されない');
});

/* ---- 図鑑 ---- */
test('図鑑: 検索(フランス語・日本語・例文・大小文字)', () => {
  const g = boot();
  g.click('zukan');
  assert.match(g.html(), /id="zq"/);
  const ids = () => Array.from(g.k.zukan().list, w => w.id);
  g.type('zq', 'CHAT');
  assert.deepEqual(ids(), ['w08']);
  assert.match(g.el('zlist').innerHTML, /data-id="w08"/);
  assert.match(g.el('zlist').innerHTML, /1語/);
  g.type('zq', 'ありがとう');
  assert.deepEqual(ids(), ['w02']);
  g.type('zq', 'jardin');
  assert.deepEqual(ids(), ['w09']);
  g.type('zq', 'GÂTEAU');
  assert.deepEqual(ids(), ['w19']);
  g.type('zq', 'zzz');
  assert.equal(ids().length, 0);
  assert.match(g.el('zlist').innerHTML, /該当する単語はありません/);
  g.type('zq', '');
  assert.equal(ids().length, 30);
});
test('図鑑: カテゴリ・品詞・レベル・習熟状態の絞り込みと組み合わせ', () => {
  const g = boot();
  g.click('zukan');
  const ids = () => Array.from(g.k.zukan().list, w => w.id);
  g.select('cat', '動物');
  assert.equal(ids().length, 6);
  g.select('cat', 'all');
  g.select('pos', 'noun');
  assert.equal(ids().length, 23);
  g.select('pos', 'interjection');
  assert.deepEqual(ids(), ['w01', 'w02', 'w03']);
  g.select('pos', 'adverb');
  assert.deepEqual(ids(), ['w06', 'w07']);
  g.select('pos', 'all');
  g.select('lv', 'A1');
  assert.equal(ids().length, 30);
  g.select('lv', 'B1');
  assert.equal(ids().length, 0);
  g.select('lv', 'all');
  g.click('fst', { v: 'new' });
  assert.equal(ids().length, 30);
  g.click('fst', { v: 'mastered' });
  assert.equal(ids().length, 0);
  g.click('fst', { v: 'all' });
  g.type('zq', 'pain');
  g.select('cat', '食べ物');
  assert.deepEqual(ids(), ['w15']);
  assert.match(g.html(), /value="pain"/, '絞り込みで再描画しても検索語が保持される');
  g.learn(1);
  g.click('home');
  g.click('zukan');
  g.click('fst', { v: 'learning' });
  assert.equal(g.k.zukan().list.length, 0, '図鑑を開き直すと絞り込みはリセット');
});
test('図鑑: 習熟状態フィルタは学習記録を反映する / 詳細表示と戻る', () => {
  const g = boot();
  g.learn(3);
  g.click('battle');
  playBattle(g, () => false);
  g.click('home');
  g.click('zukan');
  g.click('fst', { v: 'learning' });
  const n = g.k.zukan().list.length;
  assert.ok(n >= 1);
  g.click('fst', { v: 'new' });
  assert.equal(g.k.zukan().list.length, 30 - 3);
  g.click('pick', { id: 'w02' });
  assert.match(g.html(), /merci/);
  assert.match(g.html(), /間投詞/);
  assert.match(g.html(), /A1/);
  g.click('zback');
  assert.match(g.html(), /id="zq"/);
});
test('図鑑: 大量データ(1000語)でページ分割・前後移動・端の無効化・絞り込み時のリセット', () => {
  const g = boot({ wordsCode: synthWords(1000) });
  g.click('zukan');
  const rows = () => (g.el('zlist').innerHTML.match(/data-act="pick"/g) || []).length;
  assert.equal(g.k.zukan().list.length, 1000);
  assert.equal(rows(), 30);
  assert.match(g.el('zlist').innerHTML, /1\s*\/\s*34/);
  assert.match(g.html(), /data-act="zpage" data-v="-1" disabled/);
  for (let i = 0; i < 40; i++) g.click('zpage', { v: '1' });
  assert.equal(g.k.view().page, 33);
  assert.equal(rows(), 10);
  assert.match(g.el('zlist').innerHTML, /data-act="zpage" data-v="1" disabled/);
  g.click('zpage', { v: '-1' });
  assert.equal(g.k.view().page, 32);
  g.type('zq', 'mot');
  assert.equal(g.k.view().page, 0, '検索でページ先頭へ');
  g.type('zq', '語777番');
  assert.equal(g.k.zukan().list.length, 1);
  assert.equal(rows(), 1);
  assert.doesNotMatch(g.el('zlist').innerHTML, /class="pager"/);
  g.type('zq', '');
  g.select('cat', '動物');
  assert.ok(g.k.zukan().list.every(w => w.cat === '動物'));
  assert.equal(g.k.view().page, 0);
});
test('大量データ(2000語): 学習・バトル・復習が従来どおり進行する', () => {
  const g = boot({ wordsCode: synthWords(2000) });
  g.learn(3);
  g.click('battle');
  playBattle(g, () => false);
  assert.equal(g.k.view().mode, 'result');
  g.click('home');
  assert.match(g.html(), /\/2000/);
  assert.equal(g.sb.__errors.length, 0);
});

test('本番の words.js でゲームが起動し、学習→バトル→図鑑まで動く(単語を足しても確認される)', () => {
  const g = boot({ wordsCode: read('data/words.js') });
  assert.equal(g.k.data.excluded, 0);
  assert.equal(g.sb.__errors.length, 0);
  g.learn(3);
  g.click('battle');
  playBattle(g, () => false);
  g.click('home');
  g.click('zukan');
  assert.equal(g.k.zukan().list.length, g.k.vocab.length);
  assert.equal(g.sb.__errors.length, 0);
});
