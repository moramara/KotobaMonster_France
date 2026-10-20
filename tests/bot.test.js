'use strict';
// BOTおまかせ復習(観戦・高速復習専用モード)のテスト。
// タイマーと読み上げは偽物に差し替え、時間を自由に進める(実時間は待たない)。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootP, plain, realPhrases, lint, playAll } = require('./phrase_boot.js');
const { boot, synthWords, read, readCss } = require('./harness.js');
const WordLib = require('../src/lib/wordlib.js');

const deq = assert.deepEqual;
const T0 = 1700000000000,
  DAY = 86400000;
// app.js の BOT_MS / BOT_SPEECH_MAX と同じ値(速度1)
const Q_W = 3500,
  A_W = 5500,
  Q_P = 5000,
  A_P = 8000,
  SPEECH_MAX = 15000;
const EVIL = '"><img src=x onerror=alert(1)><script>alert(2)</script>&amp;\'';

/* ---------- 道具 ---------- */
function fakeTimers(g) {
  // setTimeout / clearTimeout を、手動で時間を進められるものに差し替える
  let now = 0,
    id = 0;
  const q = new Map();
  g.sb.setTimeout = (fn, ms) => {
    q.set(++id, { fn, at: now + (ms || 0) });
    return id;
  };
  g.sb.clearTimeout = k => {
    q.delete(k);
  };
  return {
    pending: () => q.size,
    // BOTのタイマーだけの数。トースト通知(app.js の toast は 2400ms)のタイマーは、
    // BOTのものではないので除く
    botPending: () => Array.from(q.values()).filter(t => t.at - now !== 2400).length,
    delays: () =>
      Array.from(q.values())
        .map(t => t.at - now)
        .sort((a, b) => a - b),
    // 保留中のタイマーの中身(「万一残っていて呼ばれた」場合の検査用)
    callbacks: () => Array.from(q.values()).map(t => t.fn),
    tick(ms) {
      const target = now + ms;
      for (;;) {
        let nk = null,
          nt = Infinity;
        q.forEach((t, k) => {
          if (t.at <= target && t.at < nt) {
            nt = t.at;
            nk = k;
          }
        });
        if (nk == null) break;
        const t = q.get(nk);
        q.delete(nk);
        now = Math.max(now, t.at);
        t.fn();
      }
      now = target;
    }
  };
}
function fakeSpeech(g) {
  // 読み上げの偽物。終了は u.onend() を呼んで知らせる(自動では終わらない)
  const log = { spoken: [], utts: [], cancels: 0 },
    s = g.sb.speechSynthesis;
  s.speak = u => {
    log.spoken.push(u.text);
    log.utts.push(u);
  };
  s.cancel = () => {
    log.cancels++;
  };
  return log;
}
function setup(o) {
  const g = bootP(o);
  const T = fakeTimers(g),
    S = fakeSpeech(g);
  return { g, T, S };
}
function start(g, o) {
  o = o || {};
  g.click('botmenu');
  g.click('botkind', { v: o.kind || 'word' });
  g.click('bottarget', { v: o.target || 'all' });
  g.click('botcount', { v: String(o.count == null ? 10 : o.count) });
  g.click('botorder', { v: o.order || 'seq' });
  g.click('botspeed', { v: String(o.speed || 1) });
  g.click('botaudio', { v: o.audio ? 'on' : 'off' });
  g.click('botstart');
}
const view = g => g.k.view();
const okTexts = html =>
  Array.from(html.matchAll(/class="btn ok" disabled>([^<]*)</g)).map(m => m[1]);
const trayTexts = (html, cls) => {
  const m = html.match(new RegExp('<div class="tray ' + cls + '">([\\s\\S]*?)</div>'));
  return m ? Array.from(m[1].matchAll(/>([^<]*)<\/button>/g)).map(x => x[1]) : null;
};
// 最後まで自動で進める(読み上げがあれば、終わったことにして先へ進める)
function finish(g, T, S) {
  let n = 0;
  while (view(g).mode === 'bot' && view(g).phase !== 'done' && n++ < 50000) {
    T.tick(1000);
    S.utts.splice(0).forEach(u => u.onend && u.onend());
  }
  assert.equal(view(g).phase, 'done', '最後まで再生できる');
}
const words = g => {
  g.learn(3);
  g.click('battle');
  let n = 0;
  while (view(g).mode === 'battle' && n++ < 40) {
    g.answer(n % 3 !== 0);
    g.next();
  }
  g.click('home');
};
const phrases = (g, ok) => {
  g.click('pmenu');
  g.click('plearn');
  if (view(g).mode === 'pwords') g.click('pgo');
  playAll(g, ok);
  g.click('home');
};

/* ================= 導線・画面 ================= */
test('導線: ホームに「BOTおまかせ復習」があり、設定画面で 教材・対象・数・順番・速度・音声 を選べる(既存のボタンはそのまま)', () => {
  const { g } = setup();
  const h = g.html();
  assert.match(h, /data-act="botmenu"[^>]*>🤖 BOTおまかせ復習/);
  assert.match(h, /data-act="pmenu"/);
  ['learn', 'battle', 'review', 'zukan'].forEach(a =>
    assert.ok(h.includes('data-act="' + a + '"'), a)
  );
  g.click('botmenu');
  assert.equal(view(g).mode, 'botmenu');
  const m = g.html();
  lint(m, 'botmenu');
  [
    'botkind',
    'bottarget',
    'botcount',
    'botorder',
    'botspeed',
    'botaudio',
    'botstart',
    'home'
  ].forEach(a => assert.ok(m.includes('data-act="' + a + '"'), a + ' がある'));
  [
    '単語',
    '構文',
    'すべて',
    '未学習',
    '学習中',
    '復習待ち',
    '習得済み',
    'ゆっくり',
    'ふつう',
    'はやい',
    'とても速い',
    '🔊 ON',
    '🔇 OFF'
  ].forEach(t => assert.ok(m.includes(t), t));
  assert.ok(m.includes('観戦専用'), '記録が変わらないことを明示');
});
test('導線: 構文データがない環境では、構文は選べず、単語だけで動く(単語30語の固定データ・読み上げ機能なし)', () => {
  const g = boot();
  const T = fakeTimers(g);
  g.click('botmenu');
  const m = g.html();
  assert.ok(!m.includes('data-v="phrase"') && m.includes('data-v="word"'));
  assert.ok(m.includes('音声が使えない'), '音声が使えない旨を表示');
  g.click('botkind', { v: 'phrase' });
  assert.ok(!g.html().includes('data-v="phrase"'));
  g.click('botaudio', { v: 'on' });
  g.click('botstart');
  assert.equal(view(g).mode, 'bot');
  finish(g, T, { utts: [] });
  assert.equal(T.pending(), 0);
  assert.equal(g.sb.__errors.length, 0);
});
test('操作ボタン: 一時停止・再開・次の問題・終了があり、スマートフォンで押しやすい大きさ(CSSで高さ48px以上)', () => {
  const { g } = setup();
  start(g);
  const h = g.html();
  lint(h, 'bot');
  ['botpause', 'botnext', 'botstop'].forEach(a => assert.ok(h.includes('data-act="' + a + '"'), a));
  g.click('botpause');
  assert.ok(g.html().includes('data-act="botresume"') && !g.html().includes('data-act="botpause"'));
  const css = readCss(),
    m = css.match(/\.botbar \.btn\{[^}]*min-height:(\d+)px/);
  assert.ok(m && Number(m[1]) >= 48, '.botbar .btn の min-height');
  assert.match(css, /\.botbar\{[^}]*position:sticky/, '操作バーは画面下に固定');
});

/* ================= 自動再生(単語・構文) ================= */
test('単語: 問題を表示 → 時間後にBOTが正解と解説を表示 → 次の問題へ自動で進み、最後は終了画面。正解は教材データのとおり', () => {
  const { g, T } = setup();
  start(g, { kind: 'word', count: 10, audio: false });
  const ids = view(g).items.map(w => w.id);
  assert.equal(ids.length, 10);
  deq(
    ids,
    g.k.vocab.slice(0, 10).map(w => w.id),
    'すべて+じゅんばん = 教材の並び順'
  );
  for (let i = 0; i < 10; i++) {
    const v = view(g),
      w = g.k.byId(ids[i]);
    assert.equal(v.i, i);
    assert.equal(v.phase, 'q');
    assert.equal(v.q.w.id, w.id);
    assert.ok(g.html().includes(`もんだい ${i + 1} / 10`));
    assert.ok(
      !g.html().includes('BOTの答え') && okTexts(g.html()).length === 0,
      '問題の表示中は正解を見せない'
    );
    lint(g.html(), 'word q');
    T.tick(Q_W - 1);
    assert.equal(view(g).phase, 'q');
    T.tick(1);
    assert.equal(view(g).phase, 'a');
    const h = g.html(),
      q = view(g).q,
      correct = q.type === 'ja2fr' || q.type === 'img2fr' ? WordLib.display(w) : w.ja;
    lint(h, 'word a');
    deq(okTexts(h), [g.k.esc(correct)], '正解の選択肢だけに印');
    assert.ok(h.includes('BOTの答え'));
    [WordLib.display(w), w.ja, w.kana, w.ex, w.exJa]
      .filter(Boolean)
      .forEach(t => assert.ok(h.includes(g.k.esc(t)), w.id + ' の ' + t + ' を表示'));
    T.tick(A_W - 1);
    assert.equal(view(g).phase, 'a');
    T.tick(1);
  }
  assert.equal(view(g).phase, 'done');
  assert.ok(g.html().includes('再生おわり') && g.html().includes('10問'));
  lint(g.html(), 'done');
  assert.equal(T.pending(), 0);
  assert.equal(g.sb.__errors.length, 0);
});
test('構文: 全構文を自動再生でき、選択・空欄・語順のどれも、正解の形・完成文・日本語訳・型・文法解説が教材データのとおりに出る', () => {
  const { g, T } = setup();
  start(g, { kind: 'phrase', count: 0, audio: false });
  const items = view(g).items,
    kinds = new Set();
  assert.equal(items.length, g.k.phrases.length);
  deq(
    items.map(p => p.id),
    g.k.phrases.map(p => p.id)
  );
  items.forEach((p, i) => {
    const v = view(g);
    assert.equal(v.i, i);
    assert.equal(v.q.p.id, p.id);
    const kind = v.q.kind;
    kinds.add(kind);
    lint(g.html(), p.id + ' q');
    assert.ok(
      !g.html().includes('BOTの答え') &&
        okTexts(g.html()).length === 0 &&
        trayTexts(g.html(), 'ok') === null,
      p.id + ': 問題の表示中は正解を見せない'
    );
    if (kind === 'ordering')
      deq(
        trayTexts(g.html(), 'pool').slice().sort(),
        Array.from(p.chunks, c => g.k.esc(c.t)).sort(),
        p.id + ': 語句カードは教材の語句'
      );
    T.tick(Q_P);
    assert.equal(view(g).phase, 'a');
    const h = g.html();
    lint(h, p.id + ' a');
    [p.fr, p.ja, p.pattern, p.grammarNote].forEach(t =>
      assert.ok(h.includes(g.k.esc(t)), p.id + ': ' + t)
    );
    p.chunks.forEach(c =>
      assert.ok(h.includes(g.k.esc(c.t) + ' = ' + g.k.esc(c.ja)), p.id + ': 語句の意味')
    );
    if (kind === 'choice') deq(okTexts(h), [g.k.esc(p.fr)], p.id + ': 選択の正解は完成文');
    else if (kind === 'cloze') {
      deq(okTexts(h), [g.k.esc(p.cloze.answer)], p.id + ': 空欄の正解');
      assert.ok(h.includes('空欄の答え: 「' + g.k.esc(p.cloze.answer) + '」'));
    } else
      deq(
        trayTexts(h, 'ok'),
        Array.from(p.chunks, c => g.k.esc(c.t)),
        p.id + ': 語順は教材の並び'
      );
    T.tick(A_P);
  });
  deq(Array.from(kinds).sort(), ['choice', 'cloze', 'ordering']);
  assert.equal(view(g).phase, 'done');
  assert.equal(T.pending(), 0);
  assert.equal(g.sb.__errors.length, 0);
});
test('教材にない解説を作らない: 答えの画面の文字は、教材データ(と固定の見出し)だけから作られる', () => {
  const { g, T } = setup();
  start(g, { kind: 'word', count: 0, audio: false, target: 'all' });
  // 例文・メモ・発音がない語があれば、それらの欄を出さない
  const bare = g.k.vocab.findIndex(w => !w.ex && !w.note && !w.kana);
  if (bare >= 0) {
    for (let i = 0; i < bare; i++) g.click('botnext');
    T.tick(Q_W);
    const h = g.html();
    assert.ok(
      !/発音の目安|📝|class="ex"/.test(h.split('BOTの答え')[1] || ''),
      '無い情報の欄を勝手に作らない'
    );
  }
  const w = g.k.vocab[bare >= 0 ? bare : 0];
  assert.ok(g.html().includes(g.k.esc(w.ja)));
});

/* ================= 速度 ================= */
test('速度: 問題と答えの表示時間に反映される(単語・構文とも ×0.5 / ×1 / ×1.5 / ×2)', () => {
  [
    [0.5, 'word', Q_W, A_W],
    [1, 'word', Q_W, A_W],
    [1.5, 'word', Q_W, A_W],
    [2, 'word', Q_W, A_W],
    [0.5, 'phrase', Q_P, A_P],
    [2, 'phrase', Q_P, A_P]
  ].forEach(([sp, kind, q, a]) => {
    const { g, T } = setup();
    start(g, { kind, speed: sp, audio: false });
    deq(T.delays(), [Math.round(q / sp)], kind + ' ×' + sp + ' 問題');
    T.tick(Math.round(q / sp) - 1);
    assert.equal(view(g).phase, 'q');
    T.tick(1);
    deq(T.delays(), [Math.round(a / sp)], kind + ' ×' + sp + ' 答え');
    T.tick(Math.round(a / sp) - 1);
    assert.equal(view(g).phase, 'a');
    T.tick(1);
    assert.equal(view(g).i, 1);
  });
});
test('速度: 再生中に変えると、いまの表示時間は変えず、次の表示から反映される', () => {
  const { g, T } = setup();
  start(g, { audio: false });
  T.tick(1000);
  g.click('botspeed', { v: '2' });
  deq(T.delays(), [Q_W - 1000], 'いまの問題の残り時間は変わらない');
  T.tick(Q_W - 1000);
  deq(T.delays(), [Math.round(A_W / 2)], '答えの表示時間から新しい速度');
  g.click('botspeed', { v: '99' });
  assert.equal(view(g).speed, 2, '不正な速度は無視');
});

/* ================= 一時停止・再開・次の問題・終了 ================= */
test('一時停止: タイマーが止まり、時間が過ぎても進まない。再開すると、いまの場面を最初から数え直して再生する', () => {
  const { g, T } = setup();
  start(g, { audio: false });
  T.tick(2000);
  g.click('botpause');
  assert.equal(view(g).paused, true);
  assert.equal(T.pending(), 0);
  assert.ok(g.html().includes('一時停止中'));
  T.tick(1e6);
  assert.equal(view(g).i, 0);
  assert.equal(view(g).phase, 'q');
  g.click('botpause');
  assert.equal(T.pending(), 0, '二重の一時停止でもタイマーは増えない');
  g.click('botresume');
  assert.equal(view(g).paused, false);
  deq(T.delays(), [Q_W], '最初から数え直す');
  g.click('botresume');
  deq(T.delays(), [Q_W], '二重の再開でタイマーは増えない');
  T.tick(Q_W);
  assert.equal(view(g).phase, 'a');
  g.click('botpause');
  g.click('botresume');
  deq(T.delays(), [A_W], '答えの表示中に止めても、再開で答えをもう一度表示');
  assert.equal(g.sb.__errors.length, 0);
});
test('次の問題: すぐ次の問題へ進む(問題・答えのどちらの途中でも)。一時停止中なら、停止したまま次の問題を表示する。最後の問題で押すと終了画面', () => {
  const { g, T } = setup();
  start(g, { audio: false, count: 10 });
  g.click('botnext');
  assert.equal(view(g).i, 1);
  assert.equal(view(g).phase, 'q');
  deq(T.delays(), [Q_W], '新しい問題のタイマー1本だけ');
  T.tick(Q_W);
  assert.equal(view(g).phase, 'a');
  g.click('botnext');
  assert.equal(view(g).i, 2);
  assert.equal(view(g).phase, 'q');
  assert.equal(T.pending(), 1);
  for (let i = 2; i < 9; i++) g.click('botnext');
  assert.equal(view(g).i, 9);
  g.click('botpause');
  g.click('botnext');
  assert.equal(view(g).phase, 'done', '最後の問題で押すと終了(一時停止中でも)');
  assert.equal(T.pending(), 0);
  assert.equal(view(g).paused, false);
  g.click('botnext');
  assert.equal(view(g).phase, 'done', '終了後に押しても何も起きない');
  const h = setup();
  start(h.g, { audio: false, count: 10 });
  h.g.click('botpause');
  h.g.click('botnext');
  assert.equal(view(h.g).i, 1);
  assert.equal(view(h.g).paused, true);
  assert.equal(h.T.pending(), 0);
  h.g.click('botresume');
  assert.equal(h.T.pending(), 1);
});
test('終了: 設定画面に戻り、タイマーが残らない。その後いくら時間が過ぎても画面は進まない', () => {
  const { g, T } = setup();
  start(g, { audio: false });
  T.tick(Q_W);
  g.click('botstop');
  assert.equal(view(g).mode, 'botmenu');
  assert.equal(T.pending(), 0);
  T.tick(1e7);
  assert.equal(view(g).mode, 'botmenu');
  assert.ok(g.html().includes('data-act="botstart"'));
  g.click('botnext');
  g.click('botpause');
  g.click('botresume');
  assert.equal(view(g).mode, 'botmenu', '終了後のBOT操作は無視される');
  assert.equal(T.pending(), 0);
});
test('終了後の画面: 「もういちど再生」で同じ設定をもう一度、「設定にもどる」「ホームにもどる」', () => {
  const { g, T } = setup();
  start(g, { audio: false, count: 10, kind: 'phrase' });
  finish(g, T, { utts: [] });
  g.click('botagain');
  assert.equal(view(g).mode, 'bot');
  assert.equal(view(g).kind, 'phrase');
  assert.equal(view(g).phase, 'q');
  assert.equal(view(g).items.length, 10);
  assert.equal(T.pending(), 1);
  finish(g, T, { utts: [] });
  g.click('botmenu');
  assert.equal(view(g).mode, 'botmenu');
  g.click('home');
  assert.equal(view(g).mode, 'home');
  assert.equal(T.pending(), 0);
});

/* ================= タイマー・画面遷移 ================= */
test('タイマー: どの経路で画面を離れても(ホーム・他の画面・読み込み)、保留中のタイマーと読み上げが残らず、その後に進まない', () => {
  [
    ['ホーム', g => g.click('home')],
    ['単語図鑑', g => g.click('zukan')],
    ['学習', g => g.click('learn')],
    ['構文メニュー', g => g.click('pmenu')],
    ['記録の読み込み', g => g.k.importText(JSON.stringify(g.k.state()))]
  ].forEach(([name, leave]) => {
    [false, true].forEach(audio => {
      const { g, T, S } = setup();
      start(g, { audio });
      T.tick(Q_W);
      const spokeBefore = S.cancels;
      leave(g);
      assert.notEqual(view(g).mode, 'bot', name);
      assert.equal(T.botPending(), 0, name + ': タイマーが残っている');
      if (audio) assert.ok(S.cancels > spokeBefore, name + ': 読み上げを止める');
      const mode = view(g).mode;
      T.tick(1e7);
      S.utts.forEach(u => u.onend && u.onend());
      assert.equal(view(g).mode, mode, name + ': 離れたあとに画面が進んだ');
    });
  });
});
test('タイマー: 開始・一時停止・再開・次へ・終了を何度繰り返しても、動いているタイマーは1本以下で、自動進行は1回ずつしか起きない', () => {
  const { g, T } = setup();
  const ops = [
    'botpause',
    'botresume',
    'botnext',
    'botpause',
    'botresume',
    'botresume',
    'botpause',
    'botresume'
  ];
  for (let round = 0; round < 6; round++) {
    start(g, { audio: false, count: 30 });
    g.click('botstart');
    assert.ok(T.pending() <= 1, '二重の開始');
    ops.forEach(a => {
      g.click(a);
      assert.ok(T.pending() <= 1, a + ' のあとのタイマー数 ' + T.pending());
    });
    // 問題+答えの1周ぶんだけ進める
    if (view(g).paused) g.click('botresume');
    const i0 = view(g).i,
      ph0 = view(g).phase;
    T.tick(Q_W + A_W);
    assert.equal(
      view(g).i - i0,
      1,
      '問題+答えの1周で進むのは1問だけ(' + ph0 + ' から。自動進行が重複していない)'
    );
    g.click(round % 2 ? 'botstop' : 'home');
    assert.equal(T.pending(), 0);
  }
  assert.equal(g.sb.__errors.length, 0);
});

test('防御: 古い再生のタイマー・読み上げの通知が万一呼ばれても、いまの再生(新しい開始・一時停止中)には影響しない', () => {
  {
    const { g, T } = setup();
    start(g, { audio: false });
    const stale = T.callbacks();
    assert.equal(stale.length, 1);
    g.click('botstop');
    start(g, { audio: false });
    stale.forEach(f => f());
    assert.equal(view(g).i, 0);
    assert.equal(view(g).phase, 'q', '古いタイマーで新しい再生が進まない');
    deq(T.delays(), [Q_W]);
  }
  {
    const { g, T } = setup();
    start(g, { audio: false });
    const stale = T.callbacks();
    g.click('botpause');
    stale.forEach(f => f());
    assert.equal(view(g).phase, 'q', '一時停止中は、古いタイマーが呼ばれても進まない');
    assert.equal(T.pending(), 0);
  }
  {
    const { g, T, S } = setup();
    start(g, { audio: true });
    T.tick(Q_W);
    const old = S.utts.slice();
    g.click('botstop');
    start(g, { audio: true });
    T.tick(Q_W);
    T.tick(A_W);
    assert.equal(view(g).i, 0);
    assert.equal(view(g).speaking, true);
    old.forEach(u => u.onend());
    assert.equal(view(g).i, 0, '前の再生の読み上げ通知で、いまの読み上げを切って進まない');
    S.utts[S.utts.length - 1].onend();
    assert.equal(view(g).i, 1);
  }
});

/* ================= 音声 ================= */
test('音声ON: 答えの表示でフランス語を読み上げ、読み上げが終わるまで(表示時間が過ぎても)次へ進まない', () => {
  const { g, T, S } = setup();
  start(g, { audio: true, count: 3 });
  const w0 = view(g).items[0];
  assert.equal(S.spoken.length, 0, 'ja2fr の問題の提示では読み上げない');
  T.tick(Q_W);
  deq(S.spoken, [WordLib.display(w0)], '答えの表示で、表示と同じ綴りを読み上げ');
  T.tick(A_W);
  assert.equal(view(g).phase, 'a', '表示時間が過ぎても、読み上げ中は進まない');
  assert.equal(view(g).i, 0);
  S.utts[0].onend();
  assert.equal(view(g).i, 1, '読み上げが終わったら進む');
  assert.equal(view(g).phase, 'q');
  T.tick(Q_W);
  T.tick(A_W);
  S.utts[S.utts.length - 1].onend();
  assert.equal(view(g).i, 2);
  assert.ok(T.pending() <= 2);
});
test('音声ON: 読み上げの終了通知が来なくても、上限(15秒)で進む。構文は完成文を読み上げる', () => {
  const { g, T, S } = setup();
  start(g, { kind: 'phrase', audio: true, count: 2 });
  const p0 = view(g).items[0];
  T.tick(Q_P);
  deq(S.spoken, [p0.fr]);
  T.tick(A_P);
  assert.equal(view(g).phase, 'a');
  T.tick(SPEECH_MAX - A_P - 1);
  assert.equal(view(g).phase, 'a');
  T.tick(1);
  assert.equal(view(g).i, 1, '上限で進む');
  assert.ok(T.pending() <= 1);
});
test('音声ON: 音声問題(音→日)は問題の提示でも読み上げ、読み上げが終わるまで答えを出さない', () => {
  const { g, T, S } = setup();
  start(g, { audio: true, count: 0 });
  let n = 0;
  while (view(g).q.type !== 'aud2ja' && n++ < 20) g.click('botnext');
  assert.equal(view(g).q.type, 'aud2ja', '音声問題が出る');
  const w = view(g).q.w;
  assert.equal(S.spoken[S.spoken.length - 1], WordLib.display(w));
  assert.ok(g.html().includes('音声を聞いて'));
  T.tick(Q_W);
  assert.equal(view(g).phase, 'q', '読み上げ中は答えを出さない');
  S.utts[S.utts.length - 1].onend();
  assert.equal(view(g).phase, 'a');
  assert.equal(S.spoken[S.spoken.length - 1], WordLib.display(w), '答えでも読み上げる');
});
test('音声ON: 次の問題・一時停止・終了・音声OFFで読み上げを止め、止めた読み上げの終了通知では進まない', () => {
  {
    const { g, T, S } = setup();
    start(g, { audio: true });
    T.tick(Q_W);
    const c = S.cancels,
      old = S.utts[0];
    g.click('botnext');
    assert.ok(S.cancels > c, '次へ: 止める');
    old.onend();
    assert.equal(view(g).i, 1);
    assert.equal(view(g).phase, 'q', '古い通知で進まない');
  }
  {
    const { g, T, S } = setup();
    start(g, { audio: true });
    T.tick(Q_W);
    const c = S.cancels,
      old = S.utts[0];
    g.click('botpause');
    assert.ok(S.cancels > c, '一時停止: 止める');
    old.onend();
    assert.equal(view(g).i, 0);
    assert.equal(T.pending(), 0);
    g.click('botresume');
    assert.equal(S.spoken.length, 2, '再開で答えをもう一度読み上げる');
    T.tick(A_W);
    assert.equal(view(g).i, 0, '表示時間が過ぎても、新しい読み上げの最中は進まない');
    old.onend();
    assert.equal(view(g).i, 0, '止めた読み上げの終了通知で、新しい読み上げを途中で切って進まない');
    assert.equal(view(g).speaking, true);
    S.utts[1].onend();
    assert.equal(view(g).i, 1, '新しい読み上げが終わって進む');
  }
  {
    const { g, T, S } = setup();
    start(g, { audio: true });
    T.tick(Q_W);
    const c = S.cancels,
      old = S.utts[0];
    g.click('botstop');
    assert.ok(S.cancels > c, '終了: 止める');
    old.onend();
    T.tick(1e7);
    assert.equal(view(g).mode, 'botmenu');
    assert.equal(T.pending(), 0);
  }
  {
    const { g, T, S } = setup();
    start(g, { audio: true });
    T.tick(Q_W);
    T.tick(A_W);
    assert.equal(view(g).i, 0, '読み上げ待ち');
    g.click('botaudio', { v: 'off' });
    assert.equal(view(g).i, 1, '音声OFFで待たずに進む');
    T.tick(Q_W);
    T.tick(A_W);
    assert.equal(S.spoken.length, 1, 'OFFのあとは読み上げない');
  }
});
test('音声OFF・音声が使えない端末: 読み上げず、表示時間だけで進む。ONにはできない', () => {
  {
    const { g, T, S } = setup();
    start(g, { audio: false, count: 2 });
    finish(g, T, S);
    assert.equal(S.spoken.length, 0);
  }
  const { g, T, S } = setup({ extraCode: 'globalThis.speechSynthesis.getVoices = () => [];' });
  g.click('botmenu');
  assert.ok(
    g.html().includes('フランス語の音声が使えない') && /data-v="on" disabled/.test(g.html())
  );
  g.click('botaudio', { v: 'on' });
  start(g, { audio: true, count: 2 });
  finish(g, T, S);
  assert.equal(S.spoken.length, 0, '音声が使えないときは読み上げを試みない');
  assert.equal(g.sb.__errors.length, 0);
});

/* ================= 対象・並び・数 ================= */
test('対象: すべて/未学習/学習中/復習待ち/習得済みは既存の学習状態と一致し、件数がボタンに出る。復習待ちは既存の復習の優先順', () => {
  const { g, T } = setup();
  g.k.setClock(() => T0);
  words(g);
  phrases(g, true);
  g.k.setClock(() => T0 + 2 * DAY);
  words(g);
  phrases(g, false);
  g.k.setClock(() => T0 + 40 * DAY);
  ['word', 'phrase'].forEach(kind =>
    ['all', 'new', 'learning', 'review', 'mastered'].forEach(t => {
      const expect =
        kind === 'word'
          ? t === 'review'
            ? g.k.reviewList()
            : g.k.vocab.filter(w => t === 'all' || g.k.status(w) === t)
          : t === 'review'
            ? g.k.pdue()
            : g.k.phrases.filter(p => t === 'all' || g.k.pstatus(p) === t);
      g.click('botmenu');
      g.click('botkind', { v: kind });
      g.click('bottarget', { v: t });
      g.click('botcount', { v: '0' });
      const n = expect.length;
      assert.ok(
        g
          .html()
          .includes(
            (t === 'all'
              ? 'すべて'
              : { new: '未学習', learning: '学習中', review: '復習待ち', mastered: '習得済み' }[
                  t
                ]) +
              '(' +
              n +
              ')'
          ),
        kind + '/' + t + ' の件数表示'
      );
      if (!n) {
        assert.ok(/data-act="botstart" disabled/.test(g.html()), '該当なしは開始できない');
        g.click('botstart');
        assert.equal(view(g).mode, 'botmenu');
        return;
      }
      g.click('botaudio', { v: 'off' });
      g.click('botstart');
      deq(
        view(g).items.map(x => x.id),
        expect.map(x => x.id),
        kind + '/' + t
      );
      g.click('botstop');
    })
  );
  assert.equal(T.botPending(), 0);
});
test('再生する数・順番: 10/30問/すべて、じゅんばん/ランダム(ランダムでも同じ教材の並べ替え)', () => {
  const { g } = setup();
  const run = o => {
    start(g, Object.assign({ audio: false }, o));
    const ids = view(g).items.map(x => x.id);
    g.click('botstop');
    return ids;
  };
  assert.equal(run({ count: 10 }).length, 10);
  assert.equal(run({ count: 30 }).length, 30);
  assert.equal(run({ count: 0 }).length, g.k.vocab.length);
  assert.equal(run({ kind: 'phrase', count: 0 }).length, g.k.phrases.length);
  const all = run({ count: 0 }),
    rnd = run({ count: 0, order: 'rand' });
  deq(rnd.slice().sort(), all.slice().sort(), 'ランダムでも同じ教材');
  assert.notDeepEqual(rnd, all, 'ランダムは並びが変わる(確率的に一致しない)');
});

/* ================= 学習記録の保護 ================= */
test('学習記録の保護: BOTが全対象・全形式・音声ON/OFFで再生し、一時停止・次へ・終了を使っても、state・localStorage・経験値・習熟度は1バイトも変わらない', () => {
  const { g, T, S } = setup();
  g.k.setClock(() => T0);
  words(g);
  phrases(g, true);
  g.k.setClock(() => T0 + 2 * DAY);
  words(g);
  phrases(g, false);
  g.k.setClock(() => T0 + 40 * DAY);
  const snap = () => ({
    state: JSON.stringify(g.k.state()),
    store: JSON.stringify(g.store),
    xp: g.k.state().xp,
    ws: g.k.vocab.map(w => g.k.status(w)).join(),
    ps: g.k.phrases.map(p => g.k.pstatus(p)).join()
  });
  const before = snap();
  assert.ok(
    before.xp > 0 &&
      Object.keys(g.k.state().w).length > 0 &&
      Object.keys(g.k.state().ph).length > 0,
    '記録がある状態から始める'
  );
  const ls = g.sb.localStorage;
  let writes = 0;
  const orig = { set: ls.setItem, rem: ls.removeItem };
  ls.setItem = (k, v) => {
    writes++;
    return orig.set(k, v);
  };
  ls.removeItem = k => {
    writes++;
    return orig.rem(k);
  };
  ['word', 'phrase'].forEach(kind =>
    ['all', 'new', 'learning', 'review', 'mastered'].forEach(t =>
      [false, true].forEach(audio => {
        g.click('botmenu');
        g.click('botkind', { v: kind });
        g.click('bottarget', { v: t });
        g.click('botcount', { v: '30' });
        g.click('botaudio', { v: audio ? 'on' : 'off' });
        if (/data-act="botstart" disabled/.test(g.html())) return;
        g.click('botstart');
        g.click('botnext');
        g.click('botpause');
        g.click('botresume');
        finish(g, T, S);
        g.click('botagain');
        T.tick(Q_W);
        g.click('botstop');
      })
    )
  );
  assert.equal(writes, 0, 'BOTは localStorage に何も書かない');
  deq(snap(), before);
  assert.equal(T.pending(), 0);
  const g2 = bootP({ storage: g.store });
  deq(JSON.stringify(g2.k.state()), before.state, '再読み込みしても同じ');
});
test('学習記録の保護: 記録がまっさらな状態でBOTを使っても、記録は作られない(state.w / state.ph が空のまま、保存もされない)', () => {
  const { g, T, S } = setup();
  const before = JSON.stringify(g.k.state());
  ['word', 'phrase'].forEach(kind => {
    start(g, { kind, audio: true, count: 0 });
    for (let i = 0; i < 12; i++) g.click('botnext');
    finish(g, T, S);
  });
  assert.equal(JSON.stringify(g.k.state()), before);
  assert.equal(Object.keys(g.k.state().w).length, 0);
  assert.equal(Object.keys(g.k.state().ph).length, 0);
  assert.ok(
    !Object.prototype.hasOwnProperty.call(g.store, 'kotoba-monster-v1'),
    '何も保存されていない'
  );
});

/* ================= 既存機能への影響 ================= */
test('既存機能: BOTを使ったあと(途中で抜けた場合も)、単語学習・バトル・復習・構文トレーニングが従来どおり動く', () => {
  const { g, T } = setup();
  g.k.setClock(() => T0);
  start(g, { audio: false });
  T.tick(Q_W);
  g.click('home');
  start(g, { kind: 'phrase', audio: false });
  g.click('botpause');
  g.click('home');
  g.learn(3);
  assert.equal(view(g).mode, 'learn');
  g.click('battle');
  assert.equal(view(g).mode, 'battle');
  g.answer(true);
  assert.equal(g.k.state().xp, 10, 'バトルの正解は +10 XP');
  g.next();
  let n = 0;
  while (view(g).mode === 'battle' && n++ < 40) {
    g.answer(true);
    g.next();
  }
  assert.equal(view(g).mode, 'result');
  const ids = Object.keys(g.k.state().w).filter(id => g.k.state().w[id].intro);
  assert.equal(ids.length, 3);
  g.click('home');
  g.click('pmenu');
  g.click('plearn');
  if (view(g).mode === 'pwords') g.click('pgo');
  assert.equal(view(g).mode, 'pquiz');
  playAll(g, true);
  assert.equal(view(g).mode, 'presult');
  assert.ok(Object.keys(g.k.state().ph).length >= 2, '構文の記録が付く');
  g.click('home');
  g.k.setClock(() => T0 + 2 * DAY);
  g.click('home');
  assert.ok(g.k.reviewList().length > 0, '時間が過ぎると復習待ちが出る');
  g.click('review');
  assert.equal(view(g).mode, 'battle');
  assert.equal(view(g).kind, 'review');
  g.click('home');
  g.click('pmenu');
  g.click('previewS');
  assert.equal(view(g).mode, 'pquiz');
  assert.equal(view(g).kind, 'review');
  assert.equal(g.sb.__errors.length, 0);
});

/* ================= 新しい教材・極端な教材 ================= */
test('新しい単語・構文を追加しても動く(追加分も再生対象に入り、正しい内容で表示される)', () => {
  const nw =
    "W('w9001', '形容詞・副詞', '', '', 'lourd', '重い', '', 'ルール', 'Le sac est lourd.', 'かばんは重いです。', { pos: 'adjective', level: 'A1', forms: { fem: 'lourde', plural: 'lourds' } })";
  const base = realPhrases().phrases.find(p => p.id === 'p10'),
    np = JSON.parse(JSON.stringify(base));
  Object.assign(np, {
    id: 'p9001',
    fr: "Je voudrais un café noir, s'il vous plaît.",
    ja: 'ブラックコーヒーを1杯お願いします。',
    slots: [],
    wordIds: ['w21']
  });
  np.chunks[1].t = 'un café noir';
  np.cloze.post = ' café noir';
  const g = bootP({
    wordsCode: read('data/words.js') + '\nWORDS.push(' + nw + ');',
    extraCode: 'PHRASES.push(' + JSON.stringify(np) + ');'
  });
  const T = fakeTimers(g);
  fakeSpeech(g);
  assert.equal(g.k.pdata.excluded, 0);
  assert.equal(g.k.pdata.errors.length, 0);
  assert.equal(g.k.data.excluded, 0);
  start(g, { kind: 'word', count: 0, audio: false });
  const wn = view(g).items.length;
  assert.equal(wn, g.k.vocab.length);
  assert.equal(view(g).items[wn - 1].id, 'w9001');
  for (let i = 0; i < wn - 1; i++) g.click('botnext');
  T.tick(Q_W);
  let h = g.html();
  lint(h, 'new word');
  ['lourd', '重い', 'Le sac est lourd.', 'かばんは重いです。', 'lourde'].forEach(t =>
    assert.ok(h.includes(t), t)
  );
  g.click('botstop');
  start(g, { kind: 'phrase', count: 0, audio: false });
  const pn = view(g).items.length;
  assert.equal(pn, g.k.phrases.length);
  assert.equal(view(g).items[pn - 1].id, 'p9001');
  for (let i = 0; i < pn - 1; i++) g.click('botnext');
  T.tick(Q_P);
  h = g.html();
  lint(h, 'new phrase');
  assert.ok(h.includes(g.k.esc(np.fr)) && h.includes(np.ja) && h.includes(g.k.esc(np.grammarNote)));
  assert.equal(g.sb.__errors.length, 0);
});
test('大量の教材(1000語)でも、設定画面・開始・全件の送りが問題なく動く。すべて再生でも件数どおり', () => {
  const g = boot({ wordsCode: synthWords(1000) });
  const T = fakeTimers(g);
  g.click('botmenu');
  assert.ok(g.html().includes('すべて(1000)'));
  lint(g.html(), 'menu1000');
  g.click('botcount', { v: '0' });
  g.click('botstart');
  assert.equal(view(g).items.length, 1000);
  for (let i = 0; i < 999; i++) g.click('botnext');
  assert.equal(view(g).i, 999);
  assert.ok(g.html().includes('もんだい 1000 / 1000'));
  T.tick(Q_W);
  T.tick(A_W);
  assert.equal(view(g).phase, 'done');
  assert.equal(T.pending(), 0);
  assert.equal(g.sb.__errors.length, 0);
});
test('選択肢を作れない教材(1語だけ)でも止まらず、答えだけ表示して進む', () => {
  const g = boot({ wordsCode: synthWords(1) });
  const T = fakeTimers(g);
  g.click('botmenu');
  g.click('botstart');
  assert.equal(view(g).mode, 'bot');
  assert.equal(view(g).q.opts.length, 0);
  lint(g.html(), 'q');
  T.tick(Q_W);
  const h = g.html();
  lint(h, 'a');
  assert.ok(h.includes('BOTの答え') && h.includes(g.k.esc(g.k.vocab[0].ja)));
  T.tick(A_W);
  assert.equal(view(g).phase, 'done');
  assert.equal(g.sb.__errors.length, 0);
});

/* ================= HTMLの安全性 ================= */
test('HTMLの安全性: 教材に危険な文字列(タグ・引用符)が入っていても、BOTの全画面で属性・タグが壊れない', () => {
  const { g, T, S } = setup();
  g.k.vocab.forEach(w => {
    ['ja', 'kana', 'ex', 'exJa', 'emoji', 'fr', 'note', 'cat', 'level', 'ipa'].forEach(f => {
      w[f] = EVIL;
    });
    w.alt = [EVIL];
    w.syn = [EVIL];
    w.forms = { plural: EVIL, [EVIL]: EVIL };
  });
  g.k.phrases.forEach(p => {
    ['fr', 'ja', 'pattern', 'grammarNote'].forEach(f => {
      p[f] = EVIL;
    });
    p.chunks.forEach(c => {
      c.t = EVIL;
      c.ja = EVIL;
    });
    if (p.cloze) {
      p.cloze.answer = EVIL;
      p.cloze.pre = EVIL;
      p.cloze.post = EVIL;
      p.cloze.options = [EVIL, 'x', 'y', 'z'];
    }
  });
  g.click('botmenu');
  lint(g.html(), 'menu');
  ['word', 'phrase'].forEach(kind => {
    start(g, { kind, audio: true, count: 12 });
    for (let i = 0; i < 12; i++) {
      lint(g.html(), kind + ' q');
      T.tick(kind === 'word' ? Q_W : Q_P);
      S.utts.splice(0).forEach(u => u.onend && u.onend());
      lint(g.html(), kind + ' a');
      T.tick(kind === 'word' ? A_W : A_P);
      S.utts.splice(0).forEach(u => u.onend && u.onend());
    }
    assert.equal(view(g).phase, 'done');
    lint(g.html(), 'done');
  });
  assert.equal(g.sb.__errors.length, 0);
});
