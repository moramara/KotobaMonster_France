'use strict';
// 構文トレーニングの画面・学習記録・報酬・保存/移行・インポート/エクスポート・回帰テスト(本物の
// app.js / phrases.js を DOM スタブ上で実行)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot, readCss } = require('./harness.js');
const {
  bootP,
  KEY,
  wordCount,
  plain,
  answerQ,
  playAll,
  lint,
  PhraseLib: L
} = require('./phrase_boot.js');
const { onlyBaseline } = require('./baseline.js');

// vm 別コンテキストのオブジェクト(プロトタイプが異なる)を通常のオブジェクトにして比較する
const jp = x => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const deq = (a, b, m) => assert.deepEqual(jp(a), jp(b), m);
const T = new Date(2026, 5, 15, 10, 0, 0).getTime(),
  DAY = 86400000,
  MIN = 60000;
const fixed = (g, t) => g.k.setClock(() => t);
// ホームから構文メニュー → セッション開始
// 新しい単語を含む構文を始めるときは、先に単語の確認画面(pwords)が出る。
// その画面を通ってセッションを始める
const proceed = g => {
  if (g.k.view().mode === 'pwords') g.click('pgo');
};
const more = g => {
  g.click('plearn');
  proceed(g);
};
const start = (g, kind, scene) => {
  g.click('home');
  g.click('pmenu');
  if (scene) g.click('pscene', { v: scene });
  g.click(kind === 'review' ? 'previewS' : 'plearn');
  proceed(g);
};
// 現在の問題が kind になるまで正解で進める
const toKind = (g, kind) => {
  let n = 0;
  while (g.k.view().mode === 'pquiz' && g.k.view().q.kind !== kind && n++ < 20) {
    answerQ(g, true);
    g.click('pnext');
  }
  assert.equal(g.k.view().q.kind, kind);
};
const SEED_W = {
  intro: 1,
  d: {
    p: { lv: 3, n: 5, ok: 4, ng: 1, st: 2, last: 1, due: Date.now() + 7 * DAY },
    r: { lv: 2, n: 3, ok: 3, ng: 0, st: 3, last: 1, due: Date.now() + DAY }
  },
  t: {}
};
const masteredRec = now => {
  const r = L.newRec();
  ['meaning', 'cloze', 'ordering'].forEach(k => {
    L.recordAnswer(r, k, true, now - 2 * DAY);
    L.recordAnswer(r, k, true, now - 60 * MIN);
  });
  return r;
};

/* ---- 導線・画面 ---- */
test('導線: ホームに構文トレーニングがあり、構文メニューから場面を選んで開始できる。単語図鑑とは別の画面', () => {
  const g = bootP();
  deq(g.k.pdata.errors, []);
  const N = g.k.phrases.length;
  assert.ok(N >= 50, '構文は50件以上(上限なし): ' + N);
  assert.match(g.html(), /data-act="pmenu"[^>]*>🗣️ 構文トレーニング/);
  assert.match(g.html(), /data-act="zukan">📚 単語図鑑/);
  g.click('pmenu');
  assert.equal(g.k.view().mode, 'pmenu');
  const h = g.html();
  [
    'あいさつ・自己紹介',
    '質問・確認',
    '買い物・注文',
    '日常生活・依頼',
    '否定・予定・希望',
    '旅行・道案内',
    '日常の行動',
    '会話をつなぐ'
  ].forEach(s => assert.ok(h.includes(s), s));
  assert.match(h, /data-act="plearn"/);
  assert.match(h, /data-act="previewS"/);
  assert.match(h, /data-act="pzukan"/);
  assert.ok(h.includes('未学習 ' + N));
  g.click('pscene', { v: 'shop' });
  assert.match(g.html(), /chip on" data-act="pscene" data-v="shop"/);
  assert.ok(g.html().includes('未学習 ' + g.k.phrases.filter(p => p.scene === 'shop').length));
  g.click('home');
  assert.equal(g.k.view().mode, 'home');
  assert.equal(g.sb.__errors.length, 0);
});
test('導線: phraselib.js / phrases.js が無くても、単語のゲームは従来どおり動き、構文ボタンは出ない', () => {
  const g = boot();
  assert.doesNotMatch(g.html(), /pmenu/);
  g.learn(3);
  g.click('battle');
  g.answer(true);
  assert.equal(g.k.state().xp, 10);
  g.click('pmenu');
  assert.equal(g.k.view().mode, 'battle', '構文の操作は無視される');
  deq(g.k.state().ph, {});
  assert.equal(g.sb.__errors.length, 0);
});

/* ---- セッションの進行・採点 ---- */
test('学習セッション: 新しい構文2つを 意味→空欄→語順 で6問。進行状況が分かり、全問正解で結果画面へ', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  const v = g.k.view();
  assert.equal(v.mode, 'pquiz');
  assert.equal(v.base, 6);
  deq(
    v.queue.map(x => x.skill),
    ['meaning', 'meaning', 'cloze', 'cloze', 'ordering', 'ordering']
  );
  assert.match(g.html(), /もんだい 1 \/ 6/);
  assert.match(g.html(), /<b>意味<\/b>の問題/);
  assert.match(g.html(), /<div class="bar"><i style="width:0%"/);
  answerQ(g, true);
  assert.match(g.html(), /fb good/);
  assert.match(g.html(), /data-act="pnext">つぎへ/);
  g.click('pnext');
  assert.match(g.html(), /もんだい 2 \/ 6/);
  assert.match(g.html(), /width:16\.6/);
  playAll(g, true);
  const r = g.k.view();
  assert.equal(r.mode, 'presult');
  assert.equal(r.right1, 6);
  assert.match(g.html(), /6 \/ 6 正解/);
  assert.match(g.html(), /経験値 \+58/);
  assert.match(g.html(), /完走ボーナス \+10/);
  assert.equal(g.sb.__errors.length, 0);
});
test('正誤表示: 選択・空欄は正解と選んだ誤答の色分け。誤答時は正解の文・日本語訳・構文パターン・文法解説を表示', () => {
  const g = bootP();
  start(g, 'learn');
  const q = g.k.view().q,
    p = q.p;
  answerQ(g, false);
  const h = g.html();
  assert.match(h, /class="btn ok"/);
  assert.match(h, /class="btn ng"/);
  assert.match(h, /fb bad/);
  assert.ok(
    h.includes(g.k.esc(p.fr)) &&
      h.includes(g.k.esc(p.ja)) &&
      h.includes(g.k.esc(p.pattern)) &&
      h.includes(g.k.esc(p.grammarNote)),
    '正解の文・訳・型・解説'
  );
  assert.match(h, /あとでまた出る/);
  const btns = h.match(/<button class="btn[^"]*" data-act="pans"[^>]*>/g) || [];
  assert.ok(
    btns.length >= 2 && btns.every(b => /disabled/.test(b)),
    '回答後は選択肢がすべて押せなくなる'
  );
  g.click('pans', { i: '0' });
  assert.equal(g.k.view().answered, 1, '回答後の再タップは無視');
});
test('正誤表示: 正答時は正しい文と日本語訳を確認できる(解説は簡潔に、型も表示)', () => {
  const g = bootP();
  start(g, 'learn');
  const p = g.k.view().q.p;
  answerQ(g, true);
  const h = g.html();
  assert.match(h, /正解!/);
  assert.ok(
    h.includes(g.k.esc(p.fr)) && h.includes(g.k.esc(p.ja)) && h.includes(g.k.esc(p.pattern))
  );
  assert.match(h, /\+8 XP/);
});
test('誤答は復習に結びつく: 同じ構文・技能が3問あとに1回だけ再出題され、2回目の誤答では増えない', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  const first = g.k.view().cur;
  assert.equal(g.k.view().queue.length, 6);
  answerQ(g, false);
  assert.equal(g.k.view().queue.length, 7);
  const rt = g.k.view().queue[3];
  deq([rt.pid, rt.skill, rt.retry], [first.pid, first.skill, true]);
  assert.equal(g.k.state().xp, 1, '誤答は+1');
  g.click('pnext');
  g.click('pnext'.replace('pnext', 'pnext')); // 2問目へ(1問目の次)
  while (g.k.view().mode === 'pquiz' && !g.k.view().cur.retry) {
    if (!g.k.view().done) answerQ(g, true);
    g.click('pnext');
  }
  assert.ok(g.k.view().cur.retry);
  assert.match(g.html(), /もう一度チャレンジ/);
  answerQ(g, false);
  assert.equal(g.k.view().queue.length, 7, '再出題の誤答ではさらに増えない');
  playAll(g, true);
  assert.equal(g.k.view().mode, 'presult');
  assert.ok(g.k.view().retries >= 1);
  assert.match(g.html(), /一度で正解した数/);
  assert.match(g.html(), /復習待ち/);
  const rec = g.k.state().ph[first.pid];
  assert.ok(rec.sk[first.skill].ng >= 2);
});
test('語順整序の操作: 選択状態が分かり、取り消し・全部もどす・答え合わせ(全部ならべるまで押せない)ができる。誤答時は自分の答えと正解を表示', () => {
  const g = bootP();
  start(g, 'learn');
  toKind(g, 'ordering');
  const q = g.k.view().q,
    n = q.cards.length;
  assert.match(g.html(), /data-act="pcheck" disabled/);
  assert.match(g.html(), /data-act="preset" disabled/);
  assert.match(g.html(), /ここに語句をならべる/);
  g.click('padd', { c: 'c1' });
  deq(g.k.view().sel, ['c1']);
  assert.match(g.html(), /class="pcard used" data-act="padd" data-c="c1" disabled/);
  assert.match(g.html(), /class="pcard in" data-act="pdel" data-c="c1"/);
  g.click('padd', { c: 'c1' });
  deq(g.k.view().sel, ['c1'], '同じカードは2回追加できない');
  g.click('pdel', { c: 'c1' });
  deq(g.k.view().sel, []);
  assert.doesNotMatch(g.html(), /pcard used/);
  g.click('pcheck');
  assert.equal(g.k.view().done, false, '未完成では判定されない');
  for (let i = n - 1; i >= 0; i--) g.click('padd', { c: 'c' + i });
  assert.doesNotMatch(g.html(), /data-act="pcheck" disabled/);
  g.click('preset');
  deq(g.k.view().sel, []);
  for (let i = n - 1; i >= 0; i--) g.click('padd', { c: 'c' + i });
  g.click('pcheck');
  assert.equal(g.k.view().done, true);
  assert.equal(g.k.view().last, false);
  assert.match(g.html(), /tray ng/);
  assert.match(g.html(), /あなたの答え/);
  assert.ok(g.html().includes(g.k.esc(q.p.fr)), '正しい文');
  assert.match(g.html(), / = /, '語句の意味');
  g.click('padd', { c: 'c0' });
  g.click('preset');
  g.click('pdel', { c: 'c1' });
  assert.equal(g.k.view().sel.length, n, '回答後は操作できない');
});
test('語順整序: 正しい順にならべて答え合わせすると正解になり、完成した文が表示される', () => {
  const g = bootP();
  start(g, 'learn');
  toKind(g, 'ordering');
  const q = g.k.view().q;
  answerQ(g, true);
  assert.equal(g.k.view().last, true);
  assert.match(g.html(), /tray ok/);
  assert.ok(g.html().includes(g.k.esc(q.p.fr)));
  assert.match(g.html(), /正解!/);
});
test('空欄補充: 空欄つきの文と日本語訳が表示され、正しい語だけが正解になる', () => {
  const g = bootP();
  start(g, 'learn');
  toKind(g, 'cloze');
  const q = g.k.view().q;
  assert.ok(g.html().includes(g.k.esc(q.sentence)) && g.html().includes('___'));
  assert.ok(g.html().includes(g.k.esc(q.p.ja)));
  const bad = q.opts.findIndex(o => !o.ok);
  g.click('pans', { i: String(bad) });
  assert.equal(g.k.view().last, false);
  assert.match(g.html(), /あなたの答え/);
});
test('セッション途中でメニューにもどっても、そこまでの記録は保存される。構文の操作は別モードでは無視される', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  const id = g.k.view().cur.pid;
  answerQ(g, true);
  g.click('pmenu');
  assert.equal(g.k.view().mode, 'pmenu');
  assert.equal(JSON.parse(g.store[KEY]).ph[id].n, 1);
  g.click('pans', { i: '0' });
  g.click('pnext');
  g.click('padd', { c: 'c0' });
  assert.equal(g.k.view().mode, 'pmenu');
  assert.equal(g.sb.__errors.length, 0);
});

/* ---- 学習記録・復習 ---- */
test('学習記録: 問題形式(技能)ごとに保存され、構文ごとの出題・正答・連続正解・復習時刻・最終学習時刻が更新される', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  playAll(g, true);
  const ph = g.k.state().ph;
  deq(Object.keys(ph).sort(), ['p01', 'p02']);
  ['p01', 'p02'].forEach(id => {
    const r = ph[id];
    deq([r.intro, r.n, r.ok, r.ng, r.st, r.last, r.at], [1, 3, 3, 0, 3, 1, T]);
    assert.equal(r.due, T + 5 * MIN);
    L.SKILLS.forEach(k =>
      deq(
        [r.sk[k].n, r.sk[k].ok, r.sk[k].st, r.sk[k].lv, r.sk[k].due],
        [1, 1, 1, 1, T + 5 * MIN],
        id + k
      )
    );
  });
  assert.equal(g.k.pstatus(g.k.phrases[0]), 'learning');
  assert.equal(g.k.pstatus(g.k.phrases[2]), 'new');
});
test('学習記録: 構文の記録と単語の記録は混在しない(互いに変更しない)', () => {
  const g = bootP();
  fixed(g, T);
  g.learn(3);
  g.click('battle');
  g.answer(true);
  g.answer;
  const w0 = JSON.stringify(g.k.state().w),
    xp0 = g.k.state().xp;
  start(g, 'learn');
  playAll(g, true);
  assert.equal(JSON.stringify(g.k.state().w), w0, '構文の学習で単語の記録は変わらない');
  assert.equal(g.k.state().best, 0);
  const ph0 = JSON.stringify(g.k.state().ph);
  g.click('home');
  g.click('review');
  g.click('learn');
  g.click('battle');
  g.answer(true);
  assert.equal(JSON.stringify(g.k.state().ph), ph0, '単語の学習で構文の記録は変わらない');
  assert.ok(g.k.state().xp > xp0);
  deq(
    Object.keys(g.k.state().w).filter(id => /^p\d/.test(id)),
    []
  );
});
test('復習: 時間が経つと復習待ちになり、ホームと構文メニューに件数が出て、復習セッションは復習待ちだけを出題する', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  playAll(g, true);
  g.click('home');
  assert.doesNotMatch(g.html(), /構文トレーニング\(復習待ち/);
  assert.equal(g.k.pdue().length, 0);
  fixed(g, T + 2 * DAY);
  g.click('home');
  assert.equal(g.k.pdue().length, 2);
  assert.match(g.html(), /🗣️ 構文トレーニング\(復習待ち 2\)/);
  g.click('pmenu');
  assert.match(g.html(), /復習する\(復習待ち 2\)/);
  g.click('previewS');
  const v = g.k.view();
  assert.equal(v.mode, 'pquiz');
  assert.equal(v.kind, 'review');
  deq(v.queue.map(x => x.pid).sort(), ['p01', 'p02']);
  const xp0 = g.k.state().xp;
  playAll(g, true);
  assert.equal(g.k.view().mode, 'presult');
  assert.equal(g.k.state().xp - xp0, 16, '時期が来た技能への正解は +8 ずつ(ボーナスは3問未満なし)');
  assert.match(g.html(), /もう一度復習/);
  // 復習は技能ごと。1回の復習で出題した技能(意味)は次回まで待ち、残りの技能(空欄→語順)が順に出る。
  // 全技能を復習し終えると復習待ちが消える
  assert.equal(g.k.pdue().length, 2, '他の技能がまだ復習待ち');
  assert.equal(g.k.state().ph.p01.sk.meaning.lv, 2);
  assert.ok(g.k.state().ph.p01.sk.meaning.due > T + 2 * DAY);
  g.click('pmenu');
  g.click('previewS');
  deq(
    g.k.view().queue.map(x => x.skill),
    ['cloze', 'cloze']
  );
  playAll(g, true);
  g.click('pmenu');
  g.click('previewS');
  deq(
    g.k.view().queue.map(x => x.skill),
    ['ordering', 'ordering']
  );
  playAll(g, true);
  assert.equal(g.k.pdue().length, 0, '全技能を復習し終えると復習待ちがなくなる');
  g.click('pmenu');
  g.click('previewS');
  assert.equal(g.k.view().mode, 'pmenu', '復習待ちがなければ開始しない');
});
test('復習: 誤答した構文・技能が優先され、正答率の低い技能が選ばれる', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  toKind(g, 'ordering');
  const id = g.k.view().cur.pid;
  answerQ(g, false);
  g.click('pnext');
  playAll(g, true);
  fixed(g, T + 2 * DAY);
  const list = g.k.pdue();
  assert.equal(list[0].id, id, '誤答した構文が先頭');
  g.click('pmenu');
  g.click('previewS');
  const first = g.k.view().queue[0];
  deq([first.pid, first.skill], [id, 'ordering']);
});
test('復習: 新しいセッションを始めても、学習済みの構文の履歴は初期化されない', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  playAll(g, true);
  const snap = JSON.stringify(g.k.state().ph);
  g.click('pmenu');
  g.click('plearn');
  assert.equal(g.k.view().mode, 'pwords', '新しい単語(café)を含むので先に単語を確認');
  proceed(g);
  assert.equal(g.k.view().mode, 'pquiz');
  deq(
    g.k
      .view()
      .queue.map(x => x.pid)
      .filter((v, i, a) => a.indexOf(v) === i),
    ['p03', 'p04'],
    '未学習の構文が出る'
  );
  const ph = g.k.state().ph;
  assert.equal(
    JSON.stringify({ p01: ph.p01, p02: ph.p02 }),
    JSON.stringify({ p01: JSON.parse(snap).p01, p02: JSON.parse(snap).p02 })
  );
});

/* ---- 経験値・育成・称号 ---- */
test('報酬: 復習の時期前に同じ構文を練習しても経験値は増えない(完走ボーナスも出ない)', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn', 'ask');
  playAll(g, true);
  assert.equal(g.k.state().xp, 58, '最初の2構文: 6問(+48)+完走ボーナス10');
  // 場面内の新しい構文をすべて学習(1回に2構文ずつ。周回の上限は構文数=場面の大きさに依存しない)
  for (
    let n = 0;
    n < g.k.phrases.length && g.k.phrases.some(p => p.scene === 'ask' && g.k.pstatus(p) === 'new');
    n++
  ) {
    more(g);
    playAll(g, true);
  }
  assert.ok(g.k.phrases.filter(p => p.scene === 'ask').every(p => g.k.pstatus(p) !== 'new'));
  // 1日の上限の影響を除いて、「時期前は0」だけを確認する
  g.k.state().pd = { d: '', xp: 0 };
  const xp1 = g.k.state().xp;
  more(g);
  const v = g.k.view();
  assert.equal(v.mode, 'pquiz');
  assert.equal(v.queue.length, 4, '新しい構文がなければ練習(各1問)');
  playAll(g, true);
  assert.equal(g.k.state().xp, xp1, '時期前の正解は経験値0');
  assert.equal(g.k.state().pd.xp, 0, '上限ではなく時期前だから増えない');
  assert.match(g.html(), /復習の時期が来ていない問題では経験値は増えません/);
  assert.doesNotMatch(g.html(), /完走ボーナス/);
  assert.equal(g.k.view().xp, 0);
});
test('報酬: わざと間違えて稼げない。誤答は同じ構文・技能で1回だけ+1、直後の正解は +3', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  answerQ(g, false);
  assert.equal(g.k.state().xp, 1);
  g.click('pnext');
  while (g.k.view().mode === 'pquiz' && !g.k.view().cur.retry) {
    answerQ(g, true);
    g.click('pnext');
  }
  const before = g.k.state().xp;
  answerQ(g, true);
  assert.equal(g.k.state().xp - before, L.REWARD.recover);
});
test('報酬: 1日の上限(120)。上限に達すると表示され、日付が変わると再び獲得できる', () => {
  const g = bootP();
  fixed(g, T);
  g.k.state().pd = { d: L.dayKey(T), xp: 119 };
  start(g, 'learn');
  playAll(g, true);
  assert.equal(g.k.state().xp, 1);
  assert.equal(g.k.state().pd.xp, 120);
  assert.match(g.html(), /今日の構文の経験値は上限に達しました/);
  g.click('pmenu');
  assert.match(g.html(), /今日、構文で得た経験値: 120\/120/);
  fixed(g, T + DAY);
  g.click('pmenu');
  assert.match(g.html(), /今日、構文で得た経験値: 0\/120/);
  more(g);
  playAll(g, true);
  assert.equal(g.k.state().xp, 1 + 58);
  assert.equal(g.k.state().pd.d, L.dayKey(T + DAY));
});
test('報酬: 同じセッションの結果を二重に計上しない(結果画面からの再操作・再終了)', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  playAll(g, true);
  const xp = g.k.state().xp,
    st = JSON.stringify(g.k.state());
  assert.equal(g.k.view().mode, 'presult');
  g.click('pnext');
  g.click('pnext');
  g.click('pans', { i: '0' });
  g.click('pcheck');
  g.click('padd', { c: 'c0' });
  playAll(g, true);
  assert.equal(g.k.view().mode, 'presult', '結果画面のまま(二重に終了処理されない)');
  assert.equal(g.k.state().xp, xp);
  assert.equal(JSON.stringify(g.k.state()), st);
});
test('育成: 構文の経験値は state.xp に加わるが、単語の習得数(best)・進化段階・単語の称号には影響しない', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  playAll(g, true);
  assert.equal(g.k.state().xp, 58);
  assert.equal(g.k.state().best, 0);
  g.click('home');
  assert.ok(g.html().includes('<b>0/' + wordCount() + '</b><span>習得済み</span>'));
  assert.match(g.html(), /<b>58<\/b><span>経験値<\/span>/);
  assert.match(g.html(), /🥚/);
  assert.doesNotMatch(g.html(), /称号: /);
});
test('称号: 構文の称号は習得した構文の最大数で決まり、単語の称号・習得数とは別。復習待ちになっても失われない', () => {
  const now = Date.now(),
    ph = {};
  ['p01', 'p02', 'p03'].forEach(id => {
    ph[id] = masteredRec(now);
  });
  const g = bootP({
    storage: {
      [KEY]: JSON.stringify({ v: 4, xp: 0, best: 0, w: {}, ph, pbest: 0, pd: { d: '', xp: 0 } })
    }
  });
  assert.equal(g.k.state().pbest, 3);
  g.click('pmenu');
  assert.match(g.html(), /構文の称号: ぶんけい見習い/);
  assert.ok(g.html().includes('<b>3/' + g.k.phrases.length + '</b><span>習得済み</span>'));
  g.click('home');
  assert.doesNotMatch(g.html(), /称号: /, '単語の称号は出ない');
  assert.equal(g.k.state().best, 0);
  g.k.setClock(() => now + 30 * DAY);
  g.click('pmenu');
  more(g);
  answerQ(g, true);
  assert.equal(JSON.parse(g.store[KEY]).pbest, 3, '習得数が減っても称号の基準は下がらない');
  assert.match(g.html(), /fb good/);
});

/* ---- セーブデータ・移行 ---- */
test('移行: v3 → v4。単語の履歴を完全に維持し、構文の記録は空の初期値になり、元の記録はバックアップに残る', () => {
  const raw = JSON.stringify({ v: 3, xp: 50, best: 1, w: { w01: SEED_W, removed_word: SEED_W } });
  const g = bootP({ storage: { [KEY]: raw } }),
    s = g.k.state();
  assert.equal(s.v, 4);
  assert.equal(s.xp, 50);
  assert.equal(s.best, 1);
  deq(s.ph, {});
  deq(s.pd, { d: '', xp: 0 });
  assert.equal(s.pbest, 0);
  assert.equal(JSON.stringify(plain(s.w.w01).d), JSON.stringify(SEED_W.d));
  assert.ok(s.w.removed_word);
  assert.equal(g.store[KEY + '-backup-v3'], raw, '旧形式のバックアップ');
  start(g, 'learn');
  answerQ(g, true);
  const saved = JSON.parse(g.store[KEY]);
  assert.equal(saved.v, 4);
  assert.equal(saved.w.w01.d.p.lv, 3);
  assert.ok(saved.w.removed_word);
  assert.ok(saved.ph.p01);
  assert.equal(g.store[KEY + '-backup-v3'], raw, '保存後も旧バックアップは残る');
});
test('移行: 古い形式のバックアップを、新形式への移行後も復元できる(v1 → v4 → バックアップから再読み込み)', () => {
  const v1 = JSON.stringify({
    v: 1,
    xp: 120,
    best: 4,
    w: { w01: { intro: 1, a: 3, b: 3 }, w02: { intro: 1, a: 1, b: 0, miss: 2 } }
  });
  const g = bootP({ storage: { [KEY]: v1 } });
  const migrated = plain(g.k.state());
  assert.equal(migrated.v, 4);
  assert.equal(g.store[KEY + '-backup-v1'], v1);
  start(g, 'learn');
  playAll(g, true);
  assert.equal(JSON.parse(g.store[KEY]).v, 4);
  // v1 変換の due は起動時刻に依存するので除く
  const restored = bootP({ storage: { [KEY]: g.store[KEY + '-backup-v1'] } });
  const core = w =>
    Object.keys(w).map(id => [
      id,
      w[id].intro,
      ['p', 'r'].map(d => ['lv', 'n', 'ok', 'ng', 'st', 'last'].map(k => w[id].d[d][k]))
    ]);
  deq(core(restored.k.state().w), core(migrated.w), 'バックアップから同じ単語の記録に戻る');
  assert.equal(restored.k.state().xp, 120);
  deq(restored.k.state().ph, {});
});
test('移行: すでに v4 で保存された記録を、構文の記録も含めて正しく読み込む', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  playAll(g, true);
  const saved = g.store[KEY];
  const g2 = bootP({ storage: { [KEY]: saved } });
  assert.equal(JSON.stringify(plain(g2.k.state())), JSON.stringify(JSON.parse(saved)));
  assert.equal(g2.store[KEY + '-backup-v4'], undefined, 'v4 は退避しない');
  assert.equal(g2.k.state().ph.p01.sk.cloze.ok, 1);
});
test('移行: 読み込み・再保存を繰り返しても情報が失われず、結果が変わらない(冪等)', () => {
  let g = bootP();
  fixed(g, T);
  start(g, 'learn');
  answerQ(g, false);
  g.click('pnext');
  playAll(g, true);
  g.click('home');
  g.learn(3);
  g.click('battle');
  g.answer(true);
  let cur = g.store[KEY];
  for (let i = 0; i < 4; i++) {
    const n = bootP({ storage: { [KEY]: cur } });
    fixed(n, T);
    n.click('pmenu');
    n.click('previewS');
    /* 何も答えずに戻る */ n.click('pmenu');
    n.k.importText(JSON.stringify({ app: 'kotoba-monster', data: plain(n.k.state()) }));
    const next = n.store[KEY];
    assert.equal(JSON.stringify(JSON.parse(next)), JSON.stringify(JSON.parse(cur)), i + '回目');
    cur = next;
  }
});
test('移行: 不正な構文の記録(型違い・範囲外・矛盾・不明な技能・__proto__・不正ID)を安全に処理し、破損しても起動する', () => {
  const bad = {
    v: 4,
    xp: 5,
    best: 0,
    w: {},
    pbest: 'x',
    pd: { d: 5, xp: -1 },
    ph: JSON.parse(
      '{"p01":{"intro":"yes","sk":{"meaning":{"lv":99,"n":"a","ok":-1},"cloze":{"n":2,"ok":9,"last":3},"zzz":{"n":9}}},"p02":"oops","p03":null,"p04":[],"BAD ID":{"intro":1},"__proto__":{"intro":1},"gone":{"intro":1,"sk":{"ordering":{"n":2,"ok":2,"st":2,"last":1,"lv":2,"due":99}}}}'
    )
  };
  const g = bootP({ storage: { [KEY]: JSON.stringify(bad) } }),
    s = g.k.state();
  assert.equal(s.xp, 5);
  deq(s.pd, { d: '', xp: 0 });
  assert.equal(s.pbest, 0);
  deq(s.ph.p01.sk.meaning, L.newSkill());
  deq([s.ph.p01.sk.cloze.n, s.ph.p01.sk.cloze.ok, s.ph.p01.sk.cloze.last], [2, 2, null]);
  assert.equal(s.ph.p01.sk.zzz, undefined);
  deq(s.ph.p02, L.newRec());
  assert.equal(s.ph['BAD ID'], undefined);
  assert.equal(Object.getPrototypeOf(Object.getPrototypeOf(s.ph)), null, '通常のオブジェクト');
  assert.equal(s.ph.intro, undefined, '__proto__ キーでプロトタイプが書き換わらない');
  assert.equal(s.ph.gone.sk.ordering.lv, 2, '教材にないIDの記録も残す');
  g.click('pmenu');
  assert.equal(g.k.view().mode, 'pmenu');
  start(g, 'learn');
  answerQ(g, true);
  assert.ok(JSON.parse(g.store[KEY]).ph.gone, '保存後も残る');
  assert.equal(g.sb.__errors.length, 0);
  const c = bootP({ storage: { [KEY]: '{broken' } });
  assert.equal(c.store[KEY + '-corrupt'], '{broken', '破損データは退避');
  assert.equal(c.k.state().v, 4);
  deq(c.k.state().ph, {});
  assert.equal(bootP({ storage: { [KEY]: '[1,2]' } }).k.state().v, 4);
});
test('移行: 構文モジュールが無い環境でも、保存された構文の記録を消さない', () => {
  const ph = { p01: masteredRec(Date.now()) },
    g = boot({
      storage: {
        [KEY]: JSON.stringify({
          v: 4,
          xp: 0,
          best: 0,
          w: {},
          ph: plain(ph),
          pbest: 1,
          pd: { d: '', xp: 0 }
        })
      }
    });
  g.learn(3);
  const saved = JSON.parse(g.store[KEY]);
  assert.equal(JSON.stringify(saved.ph), JSON.stringify(plain(ph)));
  assert.equal(saved.v, 4);
});
test('リセット: 「記録を消してはじめから」で構文の記録も消え、消す前の記録は退避される', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  playAll(g, true);
  g.click('home');
  g.click('reset');
  deq(g.k.state().ph, {});
  assert.equal(g.k.state().xp, 0);
  assert.ok(JSON.parse(g.store[KEY + '-before-reset']).ph.p01);
});

/* ---- インポート・エクスポート ---- */
test('書き出し: 形式 v4 で、構文の記録(ph・pd・pbest)も含まれる', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  playAll(g, true);
  g.click('home');
  g.click('export');
  const out = JSON.parse(g.sb.__blobs[g.sb.__blobs.length - 1]);
  assert.equal(out.app, 'kotoba-monster');
  assert.equal(out.format, 4);
  assert.equal(out.data.v, 4);
  assert.ok(out.data.ph.p01 && out.data.ph.p02);
  assert.equal(out.data.pd.xp, 58);
  assert.equal(out.data.xp, 58);
});
test('読み込み: 書き出したファイルを別の端末(新規)に読み込むと、単語・構文の記録が同じになる', () => {
  const g = bootP();
  fixed(g, T);
  g.learn(3);
  g.click('battle');
  g.answer(true);
  start(g, 'learn');
  playAll(g, true);
  g.click('home');
  g.click('export');
  const file = g.sb.__blobs[g.sb.__blobs.length - 1];
  const h = bootP();
  assert.equal(h.k.importText(file), null);
  assert.equal(JSON.stringify(plain(h.k.state())), JSON.stringify(JSON.parse(file).data));
  assert.ok(h.store[KEY + '-before-import']);
  assert.ok(h.k.state().ph.p01);
  assert.equal(h.k.view().mode, 'home');
});
test('読み込み: 構文の記録を持たない古い書き出し(v3)を読み込んでも、いまの構文の記録は消えない', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn');
  playAll(g, true);
  const ph0 = JSON.stringify(g.k.state().ph),
    pd0 = JSON.stringify(g.k.state().pd);
  const old = JSON.stringify({
    app: 'kotoba-monster',
    format: 3,
    data: { v: 3, xp: 200, best: 2, w: { w01: SEED_W } }
  });
  assert.equal(g.k.importText(old), null);
  assert.equal(g.k.state().xp, 200);
  assert.equal(g.k.state().w.w01.d.p.lv, 3);
  assert.equal(JSON.stringify(g.k.state().ph), ph0);
  assert.equal(JSON.stringify(g.k.state().pd), pd0);
  assert.equal(g.k.state().v, 4);
  assert.ok(JSON.parse(g.store[KEY + '-before-import']).ph.p01, '上書き前の記録も退避');
});
test('読み込み: 構文の記録つきファイルは構文の記録も置き換える。不正なファイル・取消では何も変えない', () => {
  const g = bootP();
  const ph = { p05: masteredRec(Date.now()) };
  const file = JSON.stringify({
    app: 'kotoba-monster',
    format: 4,
    data: { v: 4, xp: 7, best: 0, w: {}, ph: plain(ph), pbest: 0, pd: { d: '', xp: 0 } }
  });
  assert.equal(g.k.importText(file), null);
  deq(Object.keys(g.k.state().ph), ['p05']);
  assert.equal(g.k.state().pbest, 1);
  const before = JSON.stringify(g.k.state());
  assert.match(g.k.importText('not json'), /JSON/);
  assert.match(g.k.importText('{"w":[]}'), /読み込めません/);
  assert.match(g.k.importText('{"ph":{}}'), /読み込めません/);
  assert.equal(JSON.stringify(g.k.state()), before);
  const no = bootP({ confirm: false });
  no.k.importText(file);
  deq(no.k.state().ph, {}, '取消では変わらない');
});

/* ---- 構文図鑑 ---- */
test('構文図鑑: 一覧・検索・場面と状態の絞り込み。単語図鑑とは別の画面とデータ(教材が増えても成り立つ)', () => {
  const g = bootP();
  fixed(g, T);
  g.click('pmenu');
  g.click('pzukan');
  assert.equal(g.k.view().mode, 'pzukan');
  assert.match(g.html(), /📖 構文図鑑/);
  assert.doesNotMatch(g.html(), /単語図鑑/);
  const N = g.k.phrases.length;
  assert.equal(g.k.pzukan().list.length, N);
  assert.ok(g.k.pzukan().html.includes(N + '構文'));
  assert.ok(g.k.pzukan().html.includes('Je voudrais un café, s&#39;il vous plaît.'));
  assert.ok(g.k.pzukan().html.includes('コーヒーを1杯お願いします。'));
  g.type('pzq', 'cafe');
  assert.ok(['p04', 'p10', 'p32', 'p60'].every(id => g.k.pzukan().list.some(p => p.id === id)));
  deq(
    onlyBaseline(g.k.pzukan().list.map(p => p.id)),
    ['p04', 'p10', 'p32', 'p60'],
    '出荷済みの構文では café を含む4構文(アクセントなしの検索)'
  );
  g.type('pzq', '');
  g.type('pzq', 'zzzzz');
  assert.equal(g.k.pzukan().list.length, 0);
  assert.match(g.k.pzukan().html, /該当する構文はありません/);
  g.type('pzq', '');
  g.select('psc', 'shop');
  deq(
    g.k.pzukan().list.map(p => p.id),
    g.k.phrases.filter(p => p.scene === 'shop').map(p => p.id)
  );
  assert.ok(g.k.pzukan().list.length >= 9);
  g.select('psc', 'all');
  g.select('plv', 'A2');
  deq(
    g.k
      .pzukan()
      .list.map(p => p.level)
      .filter((v, i, a) => a.indexOf(v) === i),
    ['A2']
  );
  assert.equal(g.k.pzukan().list.length, g.k.phrases.filter(p => p.level === 'A2').length);
  g.select('psc', 'travel');
  assert.ok(
    g.k.pzukan().list.length > 0 &&
      g.k.pzukan().list.every(p => p.level === 'A2' && p.scene === 'travel'),
    '場面とレベルの組み合わせ'
  );
  g.select('plv', 'all');
  g.select('psc', 'all');
  assert.equal(g.k.pzukan().list.length, N);
  g.click('pfst', { v: 'new' });
  assert.equal(g.k.pzukan().list.length, N);
  g.click('pfst', { v: 'mastered' });
  assert.equal(g.k.pzukan().list.length, 0);
  g.click('zukan');
  assert.equal(g.k.view().mode, 'zukan');
  assert.match(g.html(), /単語図鑑/);
  assert.equal(g.k.zukan().list.length, wordCount(), '単語図鑑は従来どおり');
});
test('構文図鑑: 詳細に 完成文・訳・型・解説・場面・語句の意味・応用・関連単語・学習状況・技能ごとの習熟を表示する', () => {
  const g = bootP();
  fixed(g, T);
  start(g, 'learn', 'shop');
  playAll(g, true);
  g.click('pzukan');
  g.click('ppick', { pid: 'p10' });
  const h = g.html();
  [
    'Je voudrais un café, s&#39;il vous plaît.',
    'コーヒーを1杯お願いします。',
    'Je voudrais + 名詞 + s&#39;il vous plaît',
    '条件法現在形',
    '買い物・注文',
    '学習中'
  ].forEach(s => assert.ok(h.includes(s), s));
  assert.ok(
    h.includes('語句のまとまり') && h.includes('Je voudrais</span> = 〜をいただきたいのですが')
  );
  assert.ok(
    h.includes('Je voudrais un thé, s&#39;il vous plaît.') &&
      h.includes('Je voudrais de l&#39;eau, s&#39;il vous plaît.'),
    '応用例'
  );
  assert.ok(h.includes('関連する単語') && h.includes('le café'), '関連単語');
  ['意味', '空欄', '語順'].forEach(k =>
    assert.match(h, new RegExp(k + ' ●○○○ 正解1/1回 ・ 次の復習:'))
  );
  g.click('pzback');
  assert.equal(g.k.view().sel, null);
  g.click('ppick', { pid: 'p09' });
  assert.match(g.html(), /空欄: この構文では出題しません/);
  assert.match(g.html(), /未学習/);
  assert.equal(g.sb.__errors.length, 0);
});
test('構文図鑑: 読み上げには生の完成文が渡される', () => {
  const g = bootP();
  g.click('pzukan');
  g.click('ppick', { pid: 'p10' });
  g.click('pspeak', { pid: 'p10' });
  assert.equal(g.sb.__spoken[g.sb.__spoken.length - 1], "Je voudrais un café, s'il vous plaît.");
});

/* ---- 回帰: 既存の単語機能 ---- */
test('回帰: 構文機能を読み込んでも、単語の学習・バトル・復習・図鑑・称号は従来どおり', () => {
  const g = bootP();
  g.learn(3);
  g.click('battle');
  assert.equal(g.k.view().mode, 'battle');
  g.answer(true);
  assert.equal(g.k.state().xp, 10);
  g.answer;
  g.next();
  g.answer(false);
  assert.equal(g.k.state().xp, 12);
  while (g.k.view().mode === 'battle') {
    if (!g.k.view().done) g.answer(true);
    g.next();
  }
  assert.equal(g.k.view().mode, 'result');
  assert.match(g.html(), /バトルしゅうりょう/);
  g.click('home');
  assert.match(g.html(), /習得済み/);
  g.click('zukan');
  assert.equal(g.k.zukan().list.length, wordCount());
  g.click('home');
  g.click('review');
  assert.ok(['battle', 'noreview'].includes(g.k.view().mode));
  assert.equal(g.sb.__errors.length, 0);
  assert.equal(g.k.state().v, 4);
  deq(g.k.state().ph, {});
  assert.equal(g.k.data.excluded, 0);
});

/* ---- HTMLの安全性・レイアウト ---- */
const QUOTE = '" onmouseover="alert(1)\'`';
const EVIL = '"><img src=x onerror=alert(1)><script>alert(2)</script>&amp;\'';
function tourPhrases(g, label) {
  const snap = n => lint(g.html(), label + ' / ' + n);
  g.click('pmenu');
  snap('menu');
  g.click('plearn');
  if (g.k.view().mode === 'pwords') {
    snap('pwords');
    g.click('pgo');
  }
  let guard = 0;
  const kinds = new Set();
  while (g.k.view().mode === 'pquiz' && guard++ < 40) {
    kinds.add(g.k.view().q.kind);
    snap('q:' + g.k.view().q.kind);
    answerQ(g, guard % 2 === 0);
    snap('feedback');
    g.click('pnext');
  }
  assert.ok(
    kinds.has('choice') && kinds.has('cloze') && kinds.has('ordering'),
    label + ': 3形式を確認'
  );
  snap('result');
  g.click('pzukan');
  snap('pzukan');
  g.type('pzq', EVIL);
  snap('pzukan-search');
  g.type('pzq', '');
  g.select('psc', 'shop');
  snap('pzukan-scene');
  g.select('psc', 'all');
  g.k.phrases.forEach(p => {
    g.click('ppick', { pid: p.id });
    snap('detail:' + p.id);
    g.click('pzback');
  });
  g.click('pmenu');
  g.click('home');
  snap('home');
}
test('HTML安全: 引用符を含む構文データ(検証を通る形)でも、全画面でタグ・属性が壊れない', () => {
  const code =
    "PHRASES.forEach(p => { ['ja', 'pattern', 'grammarNote'].forEach(f => { p[f] += " +
    JSON.stringify(QUOTE) +
    '; }); p.chunks.forEach(c => { c.ja += ' +
    JSON.stringify(QUOTE) +
    "; }); p.chunks[0].t += '\"x'; p.fr = PhraseLib.render(p); if (p.cloze && p.cloze.chunk === 0) p.cloze.post += '\"x'; (p.slots || []).forEach(s => s.options.forEach(o => { o.ja += '\"'; })); });";
  const g = bootP({ extraCode: code });
  assert.equal(g.k.pdata.excluded, 0, 'この payload は検証を通る');
  deq(g.k.pdata.errors, []);
  tourPhrases(g, 'quote');
  assert.equal(g.sb.__errors.length, 0);
});
test('HTML安全(二重防御): < > & を含む構文データ・場面名・検索語が、HTMLとして解釈されない', () => {
  const g = bootP({ extraCode: 'PHRASE_SCENES.shop = ' + JSON.stringify(EVIL) + ';' });
  g.k.phrases.forEach(p => {
    // 文ごとに別の値にする(同じ文だと選択問題が成立しない)
    ['fr', 'ja', 'pattern', 'grammarNote'].forEach(f => {
      p[f] = EVIL + p.id;
    });
    p.chunks.forEach((c, i) => {
      c.t = EVIL + p.id + i;
      c.ja = EVIL;
      c.after = '';
    });
    p.slots.forEach(s => {
      s.label = EVIL;
      s.options.forEach(o => {
        o.t = EVIL;
        o.ja = EVIL;
      });
    });
    if (p.cloze) {
      p.cloze.answer = EVIL + p.id;
      p.cloze.options = [EVIL + p.id, EVIL + 'a', EVIL + 'b', EVIL + 'c'];
      p.cloze.pre = '';
      p.cloze.post = '';
    }
  });
  tourPhrases(g, 'evil');
  g.click('pzukan');
  g.click('ppick', { pid: 'p10' });
  assert.ok(
    g.html().includes('&lt;img src=x onerror=alert(1)&gt;'),
    '危険な文字列は文字として表示される'
  );
});
test('レイアウト: スマートフォンで操作しやすい(カード・ボタンは高さ48px以上、長い文は折り返し、横スクロールしない)', () => {
  const css = readCss(),
    html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(css, /\.pcard\{min-height:48px/);
  assert.match(css, /\.pcard\{[^}]*max-width:100%[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.tray\{display:flex;flex-wrap:wrap/);
  assert.match(css, /\.pc\{[^}]*min-height:76px[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.choices\.fr \.btn\{[^}]*white-space:normal/);
  assert.match(css, /\.btn\{[^}]*min-height:58px/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1/);
  assert.match(
    html,
    /<script src="data\/phrases\.js"><\/script>\s*<script src="src\/lib\/phraselib\.js"><\/script>\s*<script src="src\/app\.js">/
  );
});
