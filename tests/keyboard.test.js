'use strict';
// キーボードショートカット(カスタマイズ可能)のテスト。
// keymap.js(キー割り当てのロジック)と、app.js の統合(単語バトル・構文の選択式・語順整序・BOT・キー
// 設定画面・フォーカス・保存)を検証する。
// ハーネスの key() は document の keydown を発火する。ボタンの Enter / Space(標準の動作)は、
// ボタンの click() で再現する(本物のブラウザでは、フォーカス中のボタンの Enter / Space が click
// になる)。
const test = require('node:test');
const assert = require('node:assert/strict');
const KM = require('../src/lib/keymap.js');
const { bootP, KEY, answerQ } = require('./phrase_boot.js');

// ゲームは別の実行環境(vm)で動くので、オブジェクトは JSON を通して比べる
const deq = (a, b, m) =>
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
const MAPKEY = 'kotoba-monster-keymap';
const view = g => g.k.view();
const snapshot = g => JSON.stringify(g.k.state());
const withoutMap = store => {
  const o = Object.assign({}, store);
  delete o[MAPKEY];
  return JSON.stringify(o);
};
// 単語バトルを始める(3語を学んでから)
const battle = o => {
  const g = bootP(o);
  g.learn(3);
  g.click('battle');
  assert.equal(view(g).mode, 'battle');
  return g;
};
const startP = (g, kind) => {
  g.click('home');
  g.click('pmenu');
  g.click(kind === 'review' ? 'previewS' : 'plearn');
  if (view(g).mode === 'pwords') g.click('pgo');
  assert.equal(view(g).mode, 'pquiz');
};
const toKind = (g, kind) => {
  let n = 0;
  while (view(g).mode === 'pquiz' && view(g).q.kind !== kind && n++ < 30) {
    answerQ(g, true);
    g.click('pnext');
  }
  assert.equal(view(g).q.kind, kind);
};
const pressed = (g, k, e) => g.key(k, e);
const acts = g => g.buttons().map(b => b.dataset.act);
function fakeTimers(g) {
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
const botStart = (g, kind) => {
  g.click('botmenu');
  g.click('botkind', { v: kind || 'word' });
  g.click('botaudio', { v: 'off' });
  g.click('botstart');
  assert.equal(view(g).mode, 'bot');
};

/* ================= keymap.js(ロジック) ================= */
test('keymap.js: 初期設定は 1〜4=選択肢 / N=つぎへ / R=発音 / P=BOT一時停止 / Esc=もどる。重複がなく、有効', () => {
  deq(KM.DEFAULTS, {
    select1: '1',
    select2: '2',
    select3: '3',
    select4: '4',
    next: 'n',
    speak: 'r',
    pause: 'p',
    back: 'Escape'
  });
  assert.ok(KM.isValid(KM.DEFAULTS));
  assert.ok(KM.isDefault(KM.DEFAULTS));
  assert.equal(KM.STORAGE_KEY, 'kotoba-monster-keymap');
  assert.notEqual(KM.STORAGE_KEY, 'kotoba-monster-v1');
  assert.notEqual(KM.STORAGE_KEY, 'kotoba-monster-theme');
  assert.ok(Object.isFrozen(KM.DEFAULTS), '初期設定は書き換えられない');
});
test('keymap.js: キーの読み取り(英字は小文字・数字は e.code を優先=AZERTY でも 1〜4・NumLock なしのテンキーは数字にしない)', () => {
  assert.equal(KM.keyOf({ key: 'N' }), 'n');
  assert.equal(KM.keyOf({ key: 'n' }), 'n');
  assert.equal(KM.keyOf({ key: '3' }), '3');
  assert.equal(KM.keyOf({ key: 'Escape' }), 'Escape');
  assert.equal(KM.keyOf({ key: '&', code: 'Digit1' }), '1', 'AZERTY の数字の段');
  assert.equal(KM.keyOf({ key: '2', code: 'Numpad2' }), '2');
  assert.equal(KM.keyOf({ key: 'ArrowDown', code: 'Numpad2' }), null);
  [
    'Tab',
    'Enter',
    ' ',
    'F5',
    'ArrowUp',
    'Backspace',
    'Delete',
    'Shift',
    'Control',
    'é',
    '!',
    '/',
    'Process'
  ].forEach(k => assert.equal(KM.keyOf({ key: k }), null, k));
});
test('keymap.js: 割り当て — 重複は理由つきで拒否。元の設定は変えない。同じ操作に同じキーは可', () => {
  const r = KM.assign(KM.DEFAULTS, 'next', '1');
  assert.equal(r.ok, false);
  assert.equal(r.clash, 'select1');
  assert.match(r.reason, /キー「1」は「選択肢 1 を選ぶ」で使っています/);
  assert.match(r.reason, /重複/);
  const ok = KM.assign(KM.DEFAULTS, 'next', 'x');
  assert.ok(ok.ok);
  assert.equal(ok.map.next, 'x');
  assert.equal(KM.DEFAULTS.next, 'n', '元の設定は変わらない');
  assert.ok(KM.isValid(ok.map));
  assert.ok(KM.assign(KM.DEFAULTS, 'next', 'n').ok);
  assert.equal(KM.assign(KM.DEFAULTS, 'back', 'Escape').ok, true);
  assert.equal(KM.assign(KM.DEFAULTS, 'speak', 'Escape').ok, false, 'Esc は「もどる」で使用中');
  assert.equal(KM.assign(KM.DEFAULTS, 'nope', 'x').ok, false);
  ['Tab', 'Enter', ' ', 'F5', 'ArrowLeft', '!', '', null, 'ab', 'A'].forEach(k =>
    assert.equal(KM.assign(KM.DEFAULTS, 'speak', k).ok, false, String(k))
  );
});
test('keymap.js: 登録できないキーの理由(修飾キーとの組み合わせ・Tab・Enter・Space・F キー・記号)。割り当てできるキーは null', () => {
  assert.match(KM.whyNot({ key: 'c', ctrlKey: true }), /Ctrl・Command・Alt/);
  assert.match(KM.whyNot({ key: 'c', metaKey: true }), /Command/);
  assert.match(KM.whyNot({ key: 'c', altKey: true }), /Alt/);
  assert.match(KM.whyNot({ key: 'a', shiftKey: true }), /Shift/);
  assert.match(KM.whyNot({ key: 'Tab' }), /Tab/);
  assert.match(KM.whyNot({ key: 'Enter' }), /Enter と Space/);
  assert.match(KM.whyNot({ key: ' ' }), /Enter と Space/);
  assert.match(KM.whyNot({ key: 'F5' }), /F5/);
  assert.match(KM.whyNot({ key: 'F12' }), /F12/);
  assert.match(KM.whyNot({ key: 'ArrowUp' }), /英字・数字・Esc/);
  assert.match(KM.whyNot({ key: '!' }), /英字・数字・Esc/);
  assert.equal(KM.whyNot({ key: 'q' }), null);
  assert.equal(KM.whyNot({ key: '7' }), null);
  assert.equal(KM.whyNot({ key: 'Escape' }), null);
  assert.ok(
    KM.isNoise({ key: 'Shift' }) &&
      KM.isNoise({ key: 'Control' }) &&
      KM.isNoise({ key: 'Tab' }) &&
      !KM.isNoise({ key: 'a' })
  );
});
test('keymap.js: 保存形式の読み書き。壊れた値・不完全な値・重複のある値は、初期設定にもどす(一部だけ採用しない)', () => {
  const m = KM.assign(KM.DEFAULTS, 'next', 'x').map;
  deq(KM.parse(KM.serialize(m)), m);
  assert.equal(JSON.parse(KM.serialize(m)).v, 1);
  [
    null,
    '',
    'xx',
    '{',
    '[]',
    '{"v":2,"keys":{}}',
    '{"v":1}',
    '{"v":1,"keys":{"select1":"a"}}',
    JSON.stringify({ v: 1, keys: Object.assign({}, KM.DEFAULTS, { next: '1' }) }),
    JSON.stringify({ v: 1, keys: Object.assign({}, KM.DEFAULTS, { next: 'Tab' }) }),
    JSON.stringify({ v: 1, keys: Object.assign({}, KM.DEFAULTS, { next: 'N' }) })
  ].forEach(raw => deq(KM.parse(raw), KM.DEFAULTS, String(raw)));
  assert.equal(KM.actionFor(m, 'x'), 'next');
  assert.equal(KM.actionFor(m, 'n'), null);
  assert.equal(KM.actionFor(m, null), null);
  assert.equal(KM.show('Escape'), 'Esc');
  assert.equal(KM.show('n'), 'N');
  assert.equal(KM.show('3'), '3');
  assert.equal(KM.aria('Escape'), 'Escape');
  assert.equal(KM.aria('r'), 'R');
});
test('keymap.js: 入力中の場所(input・select・textarea・contenteditable)・変換中(IME)・修飾キーの判定', () => {
  ['INPUT', 'input', 'SELECT', 'TEXTAREA'].forEach(t =>
    assert.ok(KM.isTypingTarget({ tagName: t }), t)
  );
  assert.ok(KM.isTypingTarget({ tagName: 'DIV', isContentEditable: true }));
  assert.ok(
    KM.isTypingTarget({ tagName: 'SPAN', closest: s => (/contenteditable/.test(s) ? {} : null) })
  );
  assert.ok(!KM.isTypingTarget({ tagName: 'BUTTON', closest: () => null }));
  assert.ok(!KM.isTypingTarget({ tagName: 'BODY' }));
  assert.ok(!KM.isTypingTarget(null));
  assert.ok(KM.isComposing({ isComposing: true }));
  assert.ok(KM.isComposing({ keyCode: 229 }));
  assert.ok(!KM.isComposing({ key: 'a', keyCode: 65 }));
  ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'].forEach(k =>
    assert.ok(KM.hasModifier({ [k]: true }), k)
  );
  assert.ok(!KM.hasModifier({ key: 'a' }));
});

/* ================= 初期設定で、各ショートカットが働く ================= */
test('単語バトル: 1〜4 で選択肢を選ぶ(回答は既存の処理。経験値・記録が更新される)。回答後に押しても二重に回答しない', () => {
  [1, 2, 3, 4].forEach(n => {
    const g = battle();
    const xp0 = g.k.state().xp,
      opts = view(g).q.opts;
    assert.equal(pressed(g, String(n)), true, 'ブラウザ標準の動作は止める');
    const v = view(g);
    assert.equal(v.done, true);
    assert.equal(v.pick, n - 1);
    assert.equal(v.answered, 1);
    assert.equal(v.last, opts[n - 1].ok);
    assert.equal(g.k.state().xp - xp0, opts[n - 1].ok ? 10 : 2, '既存の回答処理の経験値');
    assert.ok(g.store[KEY], '学習記録は既存の処理で保存される');
    assert.equal(pressed(g, '1'), false, '回答後の数字キーは何もしない');
    assert.equal(view(g).answered, 1);
    assert.equal(g.k.state().xp - xp0, opts[n - 1].ok ? 10 : 2);
  });
});
test('単語バトル: N は回答後だけ次へ進む。未回答の N・範囲外の数字・BOT用のキーでは何も起きない', () => {
  const g = battle();
  const i0 = view(g).i,
    q0 = view(g).q;
  assert.equal(pressed(g, 'n'), false);
  assert.equal(view(g).i, i0);
  assert.equal(view(g).done, false);
  assert.strictEqual(view(g).q, q0, '未回答で勝手に次へ進まない');
  ['5', '0', 'p', 'x'].forEach(k => {
    assert.equal(pressed(g, k), false, k);
    assert.equal(view(g).done, false);
    assert.equal(view(g).answered, 0);
  });
  pressed(g, '1');
  assert.equal(pressed(g, 'n'), true);
  assert.equal(view(g).i, i0 + 1);
  assert.equal(view(g).done, false);
  assert.equal(view(g).answered, 1);
  assert.equal(pressed(g, 'n'), false, '新しい問題が未回答のうちは、続けて N を押しても進まない');
  assert.notStrictEqual(view(g).q, q0);
});
test('単語バトル: 5問を、キーだけで最後まで進められる(結果画面へ)。R は回答後に発音を再生する', () => {
  const g = battle();
  let guard = 0;
  while (view(g).mode === 'battle' && guard++ < 30) {
    pressed(g, '1');
    if (view(g).done) {
      const n = g.sb.__spoken.length;
      pressed(g, 'r');
      assert.ok(g.sb.__spoken.length > n, 'R で発音(回答後の「🔊 聞く」)');
    }
    pressed(g, 'n');
  }
  assert.equal(view(g).mode, 'result');
  assert.ok(view(g).answered >= 5);
});
test('単語バトル: Esc は確認を表示して中断する(いいえ=続ける、はい=ホームへ。回答の記録は保たれる)', () => {
  const g = bootP({ confirm: false });
  g.learn(3);
  g.click('battle');
  pressed(g, '1');
  const s0 = snapshot(g);
  assert.equal(pressed(g, 'Escape'), true);
  assert.equal(g.confirms.length, 1);
  assert.match(g.confirms[0], /やめて/);
  assert.equal(view(g).mode, 'battle', '「いいえ」なら続ける');
  assert.equal(snapshot(g), s0);
  const h = battle();
  pressed(h, '2');
  const s1 = snapshot(h);
  pressed(h, 'Escape');
  assert.equal(h.confirms.length, 1);
  assert.equal(view(h).mode, 'home');
  assert.equal(snapshot(h), s1, '中断しても、それまでの答えは保存されたまま・増減しない');
  assert.equal(pressed(h, 'Escape'), false, 'ホームでは Esc は何もしない(確認も出さない)');
  assert.equal(h.confirms.length, 1);
});
test('学習画面: N でつぎの単語、R で発音、Esc でホーム。最後の単語の N はバトルを始めない', () => {
  const g = bootP();
  g.click('learn');
  assert.equal(view(g).i, 0);
  pressed(g, 'r');
  assert.equal(g.sb.__spoken.length, 1);
  pressed(g, 'n');
  assert.equal(view(g).i, 1);
  pressed(g, 'n');
  assert.equal(view(g).i, 2);
  assert.equal(pressed(g, 'n'), false);
  assert.equal(view(g).mode, 'learn', '最後の単語では「バトルへ」ボタンなので、N では進まない');
  pressed(g, 'Escape');
  assert.equal(view(g).mode, 'home');
});
test('構文の選択式問題: 1〜4 で答え、N で次へ、R で発音。未回答の N は何もしない', () => {
  const g = bootP();
  startP(g, 'learn');
  assert.notEqual(view(g).q.kind, 'ordering');
  const n0 = view(g).num;
  assert.equal(pressed(g, 'n'), false);
  assert.equal(view(g).done, false);
  assert.equal(view(g).num, n0);
  const opts = view(g).q.opts,
    xp0 = g.k.state().xp;
  assert.equal(pressed(g, '3'), true);
  assert.equal(view(g).done, true);
  assert.equal(view(g).pick, 2);
  assert.equal(view(g).last, opts[2].ok);
  assert.ok(g.k.state().ph[view(g).cur.pid], '構文の学習記録は既存の処理で更新される');
  assert.ok(g.k.state().xp >= xp0);
  assert.equal(pressed(g, '1'), false);
  assert.equal(view(g).answered, 1);
  const sp = g.sb.__spoken.length;
  pressed(g, 'r');
  assert.equal(g.sb.__spoken.length, sp + 1);
  pressed(g, 'n');
  assert.equal(view(g).done, false);
  assert.equal(view(g).num, n0 + (view(g).cur.retry ? 0 : 1));
});
test('構文の選択式問題: Esc は確認のうえ構文メニューへ。記録は残る', () => {
  const g = bootP();
  startP(g, 'learn');
  pressed(g, '1');
  const s = snapshot(g);
  pressed(g, 'Escape');
  assert.equal(g.confirms.length, 1);
  assert.equal(view(g).mode, 'pmenu');
  assert.equal(snapshot(g), s);
  const h = bootP({ confirm: false });
  startP(h, 'learn');
  pressed(h, 'Escape');
  assert.equal(view(h).mode, 'pquiz');
});
test('構文の語順整序: Tab・Enter・Space で語句の追加・取り消し・こたえ合わせができる(語句はボタン。Tab・Enter・Space はそのままブラウザの標準の動作)', () => {
  const g = bootP();
  startP(g, 'learn');
  toKind(g, 'ordering');
  const q = view(g).q,
    n = q.cards.length;
  ['Tab', 'Enter', ' '].forEach(k => {
    assert.equal(pressed(g, k), false, k + ' は横取りしない');
  });
  deq(view(g).sel, []);
  const pool = g.buttons().filter(b => b.dataset.act === 'padd');
  assert.equal(pool.length, n);
  assert.ok(
    pool.every(b => !b.disabled && b.tagName === 'BUTTON' && b.getAttribute('tabindex') === null),
    '語句は、Tab で移動できるボタン'
  );
  // Tab で最初の語句へ → Enter / Space(= click)で追加。フォーカスは次の語句に移る
  pool[0].focus();
  g.activeEl().click();
  deq(view(g).sel, [q.cards[0].cid]);
  assert.equal(g.focused().act, 'padd');
  assert.equal(g.focused().data.c, q.cards[1].cid, '次の語句にフォーカスが移る');
  // 追加した語句は、答えの欄のボタン。Enter / Space で取り消すと、その語句がプールにもどり、
  // フォーカスもそこへ
  g.focusAct('pdel', { c: q.cards[0].cid });
  g.activeEl().click();
  deq(view(g).sel, []);
  assert.equal(g.focused().act, 'padd');
  assert.equal(g.focused().data.c, q.cards[0].cid);
  // 正しい順に全部ならべる → フォーカスは「こたえ合わせ」へ → 確定 → 「つぎへ」へ →
  // 次の問題の最初の操作へ
  q.p.chunks.forEach((_, i) => {
    g.focusAct('padd', { c: 'c' + i });
    g.activeEl().click();
  });
  assert.equal(view(g).sel.length, n);
  assert.equal(g.focused().act, 'pcheck');
  assert.equal(g.focused().disabled, false);
  g.activeEl().click();
  assert.equal(view(g).done, true);
  assert.equal(view(g).last, true);
  assert.equal(g.focused().act, 'pnext');
  g.activeEl().click();
  assert.notEqual(view(g).done, true);
  assert.ok(
    ['ans', 'pans', 'padd', 'pcheck'].indexOf(g.focused().act) >= 0 ||
      g.focused().act === 'pnext' ||
      view(g).mode === 'presult',
    '次の問題でも、フォーカスが失われない'
  );
});
test('構文の語順整序: 数字キーで n 番目の語句を追加(Tab 操作に加えて)。追加済み・範囲外は何もしない。N は確定前は何もしない', () => {
  const g = bootP();
  startP(g, 'learn');
  toKind(g, 'ordering');
  const q = view(g).q;
  assert.equal(pressed(g, '1'), true);
  deq(view(g).sel, [q.cards[0].cid]);
  assert.equal(pressed(g, '1'), false, '追加済みの語句は、もう一度追加されない');
  deq(view(g).sel, [q.cards[0].cid]);
  assert.equal(pressed(g, 'n'), false);
  assert.equal(view(g).done, false);
  assert.equal(pressed(g, '9'), false);
  assert.match(g.hint().text, /Tab/);
  assert.match(g.hint().text, /Enter \/ Space/);
});
test('BOT: P で一時停止・再開(フォーカスは対のボタンに残る)、N は答えが出てから次の問題へ、Esc は確認して終了。学習記録は変わらない', () => {
  const g = bootP({ confirm: true });
  const T = fakeTimers(g);
  g.learn(3);
  const s0 = snapshot(g),
    store0 = JSON.stringify(g.store);
  botStart(g, 'word');
  assert.equal(view(g).phase, 'q');
  assert.equal(pressed(g, 'n'), false, '問題の途中では N で飛ばさない');
  assert.equal(view(g).i, 0);
  g.focusAct('botpause');
  assert.equal(pressed(g, 'p'), true);
  assert.equal(view(g).paused, true);
  assert.equal(g.focused().act, 'botresume', 'フォーカスは再開ボタンへ');
  pressed(g, 'p');
  assert.equal(view(g).paused, false);
  assert.equal(g.focused().act, 'botpause');
  T.tick(3500);
  assert.equal(view(g).phase, 'a', '時間で答えの表示へ');
  assert.equal(g.focused().act, 'botpause', 'BOTのタイマーでの再描画でもフォーカスが残る');
  const i0 = view(g).i;
  assert.equal(pressed(g, 'n'), true);
  assert.equal(view(g).i, i0 + 1);
  assert.equal(view(g).phase, 'q');
  pressed(g, 'p');
  T.tick(60000);
  assert.equal(view(g).phase, 'q', '一時停止中はタイマーが進まない');
  pressed(g, 'p');
  assert.equal(pressed(g, 'Escape'), true);
  assert.equal(g.confirms.length, 1);
  assert.equal(view(g).mode, 'botmenu');
  assert.equal(snapshot(g), s0, 'BOTは学習記録を変えない');
  assert.equal(JSON.stringify(g.store), store0);
});
test('BOT: 構文でも P・N・Esc が働く。Esc の確認で「いいえ」なら再生を続ける。一時停止中だけ R で発音(再生中は読み上げに干渉しない)', () => {
  const g = bootP({ confirm: false });
  const T = fakeTimers(g);
  botStart(g, 'phrase');
  assert.equal(view(g).kind, 'phrase');
  pressed(g, 'Escape');
  assert.equal(g.confirms.length, 1);
  assert.equal(view(g).mode, 'bot', '確認で「いいえ」');
  const n = g.sb.__spoken.length;
  assert.equal(pressed(g, 'r'), false, '再生中の R は何もしない');
  assert.equal(g.sb.__spoken.length, n);
  pressed(g, 'p');
  assert.equal(view(g).paused, true);
  assert.equal(pressed(g, 'r'), true);
  assert.equal(g.sb.__spoken.length, n + 1);
  assert.equal(g.sb.__spoken[n], view(g).items[view(g).i].fr);
  pressed(g, 'p');
  T.tick(5000);
  assert.equal(view(g).phase, 'a');
  pressed(g, 'n');
  assert.equal(view(g).i, 1);
});
test('P は BOT 以外では何もしない(BOTのメニュー・単語バトル・ホーム)。N・R も、使えない画面では何もしない', () => {
  const g = bootP();
  assert.equal(pressed(g, 'p'), false);
  assert.equal(pressed(g, 'n'), false);
  assert.equal(pressed(g, 'r'), false);
  assert.equal(pressed(g, '1'), false);
  g.click('botmenu');
  assert.equal(pressed(g, 'p'), false);
  assert.equal(pressed(g, '1'), false);
  assert.equal(view(g).mode, 'botmenu');
  assert.equal(g.sb.__spoken.length, 0);
});

/* ================= 画面ごとの Esc(もどる) ================= */
test('Esc: 各画面で、画面の「もどる」ボタンと同じ移動をする(確認が要るのは出題・BOT再生の途中だけ)', () => {
  const g = bootP();
  const to = (open, mode) => {
    open();
    pressed(g, 'Escape');
    assert.equal(view(g).mode, mode);
    assert.equal(g.confirms.length, 0, '出題の途中でなければ、確認は出さない');
  };
  to(() => g.click('zukan'), 'home');
  to(() => g.click('botmenu'), 'home');
  to(() => g.click('pmenu'), 'home');
  to(() => g.click('keys'), 'home');
  to(() => g.click('learn'), 'home');
  to(() => {
    g.click('pmenu');
    g.click('pzukan');
  }, 'pmenu');
  to(() => {
    g.click('home');
    g.click('zukan');
    g.click('pick', { id: view(g).list ? 'w01' : 'w01' });
    assert.ok(view(g).sel);
  }, 'zukan');
  pressed(g, 'Escape');
  assert.equal(view(g).mode, 'home');
  g.click('pmenu');
  g.click('pzukan');
  g.click('ppick', { pid: 'p10' });
  assert.ok(view(g).sel);
  pressed(g, 'Escape');
  assert.equal(view(g).mode, 'pzukan');
  assert.equal(view(g).sel, null);
  pressed(g, 'Escape');
  assert.equal(view(g).mode, 'pmenu');
});

/* ================= キー設定画面 ================= */
test('キー設定: ホームから開ける。8つの操作と現在のキーが表示される', () => {
  const g = bootP();
  assert.ok(g.html().includes('data-act="keys"'));
  g.click('keys');
  assert.equal(view(g).mode, 'keys');
  const h = g.html();
  KM.ACTIONS.forEach(a => {
    assert.ok(h.includes(a.label), a.label);
    assert.ok(h.includes('data-v="' + a.id + '"'), a.id);
  });
  ['>1<', '>2<', '>3<', '>4<', '>N<', '>R<', '>P<', '>Esc<'].forEach(x =>
    assert.ok(h.includes(x), x)
  );
  assert.match(h, /初期設定です/);
  assert.match(h, /data-act="keyreset" disabled/);
  assert.match(h, /Tab・Enter・Space/);
  assert.match(h, /入力しているとき、変換中/);
});
test('キー設定: 再割り当てして保存。キーを押すと確定し、画面に反映され、対応するショートカットが新しいキーで働く(旧キーでは働かない)', () => {
  const g = battle();
  g.click('home');
  g.click('keys');
  g.click('keyset', { v: 'next' });
  assert.equal(view(g).listen, 'next');
  assert.equal(g.focused().act, 'keycancel', '割り当て中は「キャンセル」にフォーカス');
  assert.equal(pressed(g, 'x'), true, '割り当てに使ったキーのブラウザ標準の動作は止める');
  assert.equal(view(g).listen, null);
  deq(g.k.keys(), Object.assign({}, KM.DEFAULTS, { next: 'x' }));
  assert.match(g.html(), />X</);
  assert.match(g.html(), /「回答後に次へ進む」を X に変更しました/);
  assert.match(g.html(), /初期設定から変更されています/);
  assert.ok(!/data-act="keyreset" disabled/.test(g.html()));
  assert.equal(g.focused().act, 'keyset');
  assert.equal(g.focused().data.v, 'next', '変更した行の「変更」ボタンにフォーカスがもどる');
  deq(JSON.parse(g.store[MAPKEY]), { v: 1, keys: Object.assign({}, KM.DEFAULTS, { next: 'x' }) });
  g.click('home');
  g.learn(3);
  g.click('battle');
  pressed(g, '1');
  assert.equal(pressed(g, 'n'), false, '旧キー N は働かない');
  assert.equal(view(g).done, true);
  assert.equal(pressed(g, 'x'), true);
  assert.equal(view(g).done, false, '新しいキー X で次へ');
});
test('キー設定: 設定はページを再読み込みしても維持される(別の起動でも、保存された設定が使われる)', () => {
  const g = bootP();
  g.click('keys');
  g.click('keyset', { v: 'select1' });
  pressed(g, 'a');
  g.click('keyset', { v: 'back' });
  pressed(g, 'q');
  g.click('keyset', { v: 'pause' });
  pressed(g, '9');
  const expected = Object.assign({}, KM.DEFAULTS, { select1: 'a', back: 'q', pause: '9' });
  deq(g.k.keys(), expected);
  const h = bootP({ storage: g.store });
  deq(h.k.keys(), expected, '再読み込み後も維持');
  h.learn(3);
  h.click('battle');
  assert.equal(pressed(h, '1'), false, '旧キー 1 は選択肢1ではない');
  assert.equal(view(h).done, false);
  assert.equal(pressed(h, 'a'), true);
  assert.equal(view(h).pick, 0);
  assert.equal(pressed(h, 'Escape'), false, '旧キー Esc は働かない');
  assert.equal(h.confirms.length, 0);
  assert.equal(pressed(h, 'q'), true);
  assert.equal(h.confirms.length, 1);
  const k = bootP({ storage: g.store });
  k.click('keys');
  assert.match(k.html(), />A</);
  assert.match(k.html(), />Q</);
  assert.match(k.html(), />9</);
});
test('キー設定: 重複したキーは拒否され、理由が表示される。設定は確定されず、保存もされない(割り当て中のまま、別のキーを待つ)', () => {
  const g = bootP();
  g.click('keys');
  g.click('keyset', { v: 'next' });
  assert.equal(pressed(g, '1'), true);
  assert.equal(view(g).listen, 'next', '確定しない');
  deq(g.k.keys(), KM.DEFAULTS);
  assert.ok(!(MAPKEY in g.store), '保存されない');
  assert.match(view(g).msg, /キー「1」は「選択肢 1 を選ぶ」で使っています/);
  assert.equal(g.el('keymsg').textContent, view(g).msg, '理由が画面に出る');
  assert.equal(g.el('toast').textContent, view(g).msg, 'スクリーンリーダー向けにも通知される');
  pressed(g, 'Escape');
  assert.match(view(g).msg, /キー「Esc」は「戻る/);
  assert.match(view(g).msg, /で使っています/);
  pressed(g, 'r');
  assert.match(view(g).msg, /「発音を再生する」で使っています/);
  deq(g.k.keys(), KM.DEFAULTS);
  pressed(g, 'z');
  deq(g.k.keys(), Object.assign({}, KM.DEFAULTS, { next: 'z' }));
  assert.equal(view(g).listen, null);
  g.click('keyset', { v: 'speak' });
  pressed(g, 'z');
  assert.match(view(g).msg, /「回答後に次へ進む」で使っています/);
  assert.equal(g.k.keys().speak, 'r');
  g.click('keyset', { v: 'speak' });
  pressed(g, 'r');
  assert.equal(g.k.keys().speak, 'r', '同じキーをそのまま選ぶのは可');
  assert.equal(view(g).listen, null);
  // 保存された値に重複がある場合も、使わない(初期設定)
  const bad = JSON.stringify({ v: 1, keys: Object.assign({}, KM.DEFAULTS, { next: '1' }) });
  deq(bootP({ storage: { [MAPKEY]: bad } }).k.keys(), KM.DEFAULTS);
  deq(bootP({ storage: { [MAPKEY]: '{壊れた' } }).k.keys(), KM.DEFAULTS);
});
test('キー設定: 禁止された割り当て(修飾キーとの組み合わせ・Tab・Enter・Space・F キー・矢印・記号)は拒否される。ブラウザの操作は妨げない', () => {
  const g = bootP();
  g.click('keys');
  g.click('keyset', { v: 'speak' });
  const tries = [
    ['c', { ctrlKey: true }, /Ctrl・Command・Alt/],
    ['c', { metaKey: true }, /Command/],
    ['x', { altKey: true }, /Alt/],
    ['a', { shiftKey: true }, /Shift/],
    ['Enter', {}, /Enter と Space/],
    [' ', {}, /Enter と Space/],
    ['F5', {}, /F5/],
    ['F11', {}, /F11/],
    ['ArrowUp', {}, /英字・数字・Esc/],
    ['Backspace', {}, /英字・数字・Esc/],
    ['!', {}, /英字・数字・Esc/],
    ['/', {}, /英字・数字・Esc/]
  ];
  tries.forEach(([k, e, re]) => {
    const before = view(g).listen;
    assert.equal(
      pressed(g, k, Object.assign({ target: { tagName: 'DIV', closest: () => null } }, e)),
      false,
      k + ': ブラウザの標準の動作(コピー・再読み込みなど)は止めない'
    );
    assert.match(view(g).msg, re, k);
    assert.equal(view(g).listen, before);
    deq(g.k.keys(), KM.DEFAULTS);
  });
  assert.ok(!(MAPKEY in g.store));
  view(g).msg = '';
  pressed(g, 'Shift');
  pressed(g, 'Control');
  pressed(g, 'Tab');
  assert.equal(view(g).msg, '', '修飾キーだけ・Tab では、メッセージを出さない');
  assert.equal(view(g).listen, 'speak');
  // フォーカス中のボタンで Enter / Space を押した場合は、ボタンの標準の動作(押す)に任せ、
  // 何も言わない
  const btn = g.focusAct('keycancel');
  pressed(g, 'Enter', { target: btn });
  pressed(g, ' ', { target: btn });
  assert.equal(view(g).msg, '');
  g.click('keycancel');
  assert.equal(view(g).listen, null);
  assert.equal(g.focused().act, 'keyset');
});
test('キー設定: キャンセル・初期設定へのリセットができる。リセットは保存した設定を消す', () => {
  const g = bootP();
  g.click('keys');
  g.click('keyset', { v: 'next' });
  g.click('keycancel');
  assert.equal(view(g).listen, null);
  deq(g.k.keys(), KM.DEFAULTS);
  assert.ok(!(MAPKEY in g.store));
  g.click('keyset', { v: 'next' });
  pressed(g, 'x');
  g.click('keyset', { v: 'back' });
  pressed(g, 'b');
  assert.ok(MAPKEY in g.store);
  assert.ok(!/data-act="keyreset" disabled/.test(g.html()));
  g.click('keyreset');
  deq(g.k.keys(), KM.DEFAULTS);
  assert.ok(!(MAPKEY in g.store), '保存した設定を消す');
  assert.match(g.html(), /初期設定にもどしました/);
  assert.match(g.html(), /data-act="keyreset" disabled/);
  assert.match(g.html(), />Esc</);
  g.click('home');
  g.learn(3);
  g.click('battle');
  pressed(g, '1');
  assert.equal(pressed(g, 'n'), true, '初期設定の N にもどる');
  g.click('keyset', { v: 'next' });
  assert.equal(view(g).mode, 'battle', 'キー設定の外では、割り当て操作は何もしない');
});
test('キー設定: 保存できない環境(localStorage が使えない)でも、このページの間は変更が有効。エラーにならない', () => {
  const g = bootP({ storageFails: true });
  g.click('keys');
  g.click('keyset', { v: 'next' });
  assert.doesNotThrow(() => pressed(g, 'x'));
  assert.equal(g.k.keys().next, 'x');
  assert.match(g.el('toast').textContent, /保存できませんでした/);
  assert.equal(g.sb.__errors.length, 0);
});

/* ================= 入力中・変換中・修飾キー・押しっぱなしでは発動しない ================= */
test('入力欄・セレクトボックス・テキストエリア・contenteditable の操作中は、ショートカットが発動しない', () => {
  const targets = [
    { tagName: 'INPUT' },
    { tagName: 'SELECT' },
    { tagName: 'TEXTAREA' },
    { tagName: 'DIV', isContentEditable: true },
    { tagName: 'P', closest: s => (/contenteditable/.test(s) ? {} : null) }
  ];
  targets.forEach(t => {
    const g = battle();
    assert.equal(pressed(g, '1', { target: t }), false);
    assert.equal(view(g).done, false);
    assert.equal(view(g).answered, 0);
    assert.equal(pressed(g, 'Escape', { target: t }), false);
    assert.equal(g.confirms.length, 0);
    assert.equal(view(g).mode, 'battle');
  });
  const g = battle();
  pressed(g, '1');
  assert.equal(pressed(g, 'n', { target: { tagName: 'INPUT' } }), false);
  assert.equal(view(g).done, true, '入力中の N では進まない');
  assert.equal(pressed(g, 'n'), true);
  // 図鑑の検索欄: 入力中の文字(n・r・p・1)はショートカットにならない
  const z = bootP();
  z.click('zukan');
  ['n', 'r', 'p', '1', 'Escape'].forEach(k => {
    assert.equal(pressed(z, k, { target: { tagName: 'INPUT', id: 'zq' } }), false);
    assert.equal(view(z).mode, 'zukan');
  });
  assert.equal(z.sb.__spoken.length, 0);
  // キー設定の割り当て中でも、入力欄では割り当てない
  const k = bootP();
  k.click('keys');
  k.click('keyset', { v: 'next' });
  pressed(k, 'x', { target: { tagName: 'INPUT' } });
  assert.equal(k.k.keys().next, 'n');
});
test('IME の変換中は、ショートカットが発動しない(isComposing・keyCode 229)', () => {
  const g = battle();
  assert.equal(pressed(g, '1', { isComposing: true }), false);
  assert.equal(pressed(g, 'Process', { keyCode: 229 }), false);
  assert.equal(pressed(g, '1', { keyCode: 229 }), false);
  assert.equal(pressed(g, 'Escape', { isComposing: true }), false);
  assert.equal(view(g).answered, 0);
  assert.equal(g.confirms.length, 0);
  assert.equal(pressed(g, '1', { isComposing: false, keyCode: 49 }), true, '変換中でなければ働く');
  assert.equal(view(g).answered, 1);
  const k = bootP();
  k.click('keys');
  k.click('keyset', { v: 'next' });
  pressed(k, 'x', { isComposing: true });
  assert.equal(k.k.keys().next, 'n', '変換中は割り当てない');
});
test('Ctrl・Command・Alt・Shift を押しているときと、キーの押しっぱなし(repeat)では発動せず、ブラウザの操作を妨げない', () => {
  // 音声問題は表示時に自動で読み上げるので、その分は基準にする
  const g = battle();
  const sp0 = g.sb.__spoken.length;
  [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }].forEach(m => {
    assert.equal(pressed(g, '1', m), false, JSON.stringify(m) + ': 止めない');
    assert.equal(view(g).answered, 0);
  });
  [{ ctrlKey: true }, { metaKey: true }, { altKey: true }].forEach(m => {
    assert.equal(pressed(g, 'Escape', m), false);
    assert.equal(g.confirms.length, 0);
  });
  assert.equal(pressed(g, 'r', { ctrlKey: true }), false, 'Ctrl+R(再読み込み)を妨げない');
  assert.equal(pressed(g, 'n', { metaKey: true }), false, 'Command+N(新しいウィンドウ)を妨げない');
  assert.equal(g.sb.__spoken.length, sp0);
  assert.equal(pressed(g, '1', { repeat: true }), false);
  assert.equal(view(g).answered, 0, '押しっぱなしで連続して発動しない');
  assert.equal(
    pressed(g, '1', { defaultPrevented: true }),
    false,
    '他の処理が扱ったキーは扱わない'
  );
  assert.equal(view(g).answered, 0);
  pressed(g, '1');
  assert.equal(view(g).answered, 1);
  assert.equal(pressed(g, 'n', { repeat: true }), false);
  assert.equal(view(g).done, true);
});
test('Enter の押しっぱなしでは、フォーカスが移った先のボタンが連続して押されない(繰り返しは止める)。1回目の Enter は横取りしない', () => {
  const g = battle();
  const b = g.focusAct('ans', { i: 0 });
  assert.equal(
    pressed(g, 'Enter', { target: b }),
    false,
    '1回目は標準の動作(ボタンを押す)に任せる'
  );
  assert.equal(pressed(g, 'Enter', { target: b, repeat: true }), true, '繰り返しは止める');
  assert.equal(view(g).answered, 0);
  g.key('Enter', { target: g.buttons().find(x => x.dataset.act === 'ans'), repeat: true });
  assert.equal(view(g).answered, 0);
  assert.equal(
    pressed(g, 'Enter', { target: { tagName: 'BODY' }, repeat: true }),
    false,
    'ボタン以外の繰り返しには触れない'
  );
});
test('ブラウザ標準のキー(Tab・Enter・Space・F キー・PageDown など)は、どの画面でも横取りしない。矢印は、動かす選択肢があるときだけ', () => {
  const g = battle();
  ['Tab', 'Enter', ' ', 'F5', 'F12', 'PageDown', 'PageUp', 'Backspace', 'Home', 'End'].forEach(k =>
    assert.equal(pressed(g, k), false, k)
  );
  pressed(g, '1');
  ['Tab', 'Enter', ' '].forEach(k => assert.equal(pressed(g, k), false, k));
  assert.equal(view(g).answered, 1);
  // 回答後は動かす選択肢がないので、矢印キーもページのスクロールなど標準の動作に任せる
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].forEach(k =>
    assert.equal(pressed(g, k), false, k)
  );
  // ホーム・図鑑・BOT などでも、矢印は横取りしない
  const h = bootP();
  ['ArrowUp', 'ArrowDown'].forEach(k => assert.equal(pressed(h, k), false, 'ホーム ' + k));
  h.click('zukan');
  assert.equal(pressed(h, 'ArrowDown'), false);
});

/* ================= 矢印キーで選択を動かす ================= */
test('矢印キー(単語バトル): ↓↑ で選択中の項目(フォーカス)が動き、端でつながる。Enter / Space(click)で決定する', () => {
  const g = battle();
  const idx = () => Number(g.focused().data.i);
  assert.equal(g.activeEl(), null, '最初は、フォーカスなし');
  assert.equal(pressed(g, 'ArrowDown'), true, '動かしたキーは、標準の動作(スクロール)を止める');
  assert.equal(g.focused().act, 'ans');
  assert.equal(idx(), 0, 'フォーカスがないときの ↓ は、最初の選択肢');
  pressed(g, 'ArrowDown');
  assert.equal(idx(), 1);
  pressed(g, 'ArrowDown');
  pressed(g, 'ArrowDown');
  assert.equal(idx(), 3);
  pressed(g, 'ArrowDown');
  assert.equal(idx(), 0, '最後の次は、最初へつながる');
  pressed(g, 'ArrowUp');
  assert.equal(idx(), 3, '最初の前は、最後へつながる');
  pressed(g, 'ArrowUp');
  assert.equal(idx(), 2);
  assert.equal(view(g).answered, 0, '動かしただけでは回答しない');
  assert.equal(view(g).done, false);
  // → ← も同じ(向きが同じ)
  pressed(g, 'ArrowRight');
  assert.equal(idx(), 3);
  pressed(g, 'ArrowLeft');
  assert.equal(idx(), 2);
  // 決定: Enter / Space はフォーカス中のボタンの標準の動作(= click)。数字キーと同じ既存の回答処理を通る
  assert.equal(pressed(g, 'Enter'), false, 'Enter は横取りしない');
  g.activeEl().click();
  assert.equal(view(g).done, true);
  assert.equal(view(g).pick, 2, '選択中だった3番目が回答される');
  assert.equal(view(g).answered, 1);
  assert.equal(g.focused().act, 'next', '回答後は「つぎへ」にフォーカス');
});
test('矢印キー: フォーカスが選択肢の外にあるとき、↑ は最後の選択肢へ。数字キーと併用できる', () => {
  const g = battle();
  pressed(g, 'ArrowUp');
  assert.equal(g.focused().data.i, '3');
  pressed(g, 'ArrowUp');
  pressed(g, 'ArrowUp');
  assert.equal(g.focused().data.i, '1');
  assert.equal(pressed(g, '3'), true, '数字キーは、フォーカスの位置に関係なく働く');
  assert.equal(view(g).pick, 2);
});
test('矢印キー(構文の選択式): ↓↑ で選択が動き、Enter / Space で回答する', () => {
  const g = bootP();
  startP(g, 'learn');
  assert.notEqual(view(g).q.kind, 'ordering');
  pressed(g, 'ArrowDown');
  assert.equal(g.focused().act, 'pans');
  assert.equal(g.focused().data.i, '0');
  pressed(g, 'ArrowDown');
  pressed(g, 'ArrowDown');
  assert.equal(g.focused().data.i, '2');
  assert.equal(view(g).done, false);
  g.activeEl().click();
  assert.equal(view(g).done, true);
  assert.equal(view(g).pick, 2);
  assert.equal(g.focused().act, 'pnext');
});
test('矢印キー(語順整序): 押せる語句カードの間を動く(追加済みは飛ばす)。Enter / Space で追加し、次の語句へフォーカスが移る', () => {
  const g = bootP();
  startP(g, 'learn');
  toKind(g, 'ordering');
  const q = view(g).q;
  const n = q.cards.length;
  pressed(g, 'ArrowDown');
  assert.equal(g.focused().act, 'padd');
  assert.equal(g.focused().data.c, q.cards[0].cid);
  pressed(g, 'ArrowDown');
  assert.equal(g.focused().data.c, q.cards[1].cid);
  g.activeEl().click(); // 2番目の語句を追加 → フォーカスは押せる語句へ
  deq(view(g).sel, [q.cards[1].cid]);
  assert.equal(g.focused().act, 'padd');
  // 追加済みの語句は押せないので、矢印で飛ばされる
  const seen = [];
  for (let i = 0; i < n; i++) {
    seen.push(g.focused().data.c);
    pressed(g, 'ArrowDown');
  }
  assert.ok(seen.indexOf(q.cards[1].cid) < 0, '追加済みの語句には止まらない');
  assert.equal(new Set(seen).size, n - 1, '残りの語句を一巡する');
});
test('矢印キー: 入力中・変換中・修飾キー・押しっぱなしでは働かない。キー設定の割り当て中は、矢印は登録できない', () => {
  const g = battle();
  assert.equal(pressed(g, 'ArrowDown', { target: { tagName: 'INPUT' } }), false);
  assert.equal(pressed(g, 'ArrowDown', { target: { tagName: 'SELECT' } }), false);
  assert.equal(pressed(g, 'ArrowDown', { isComposing: true }), false);
  assert.equal(pressed(g, 'ArrowDown', { keyCode: 229 }), false);
  assert.equal(pressed(g, 'ArrowDown', { ctrlKey: true }), false);
  assert.equal(
    pressed(g, 'ArrowDown', { altKey: true }),
    false,
    'Alt+↓ などのブラウザの操作を妨げない'
  );
  assert.equal(pressed(g, 'ArrowDown', { metaKey: true }), false);
  assert.equal(pressed(g, 'ArrowDown', { shiftKey: true }), false);
  assert.equal(pressed(g, 'ArrowDown', { repeat: true }), false);
  assert.equal(g.activeEl(), null, 'どれもフォーカスを動かしていない');
  const k = bootP();
  k.click('keys');
  k.click('keyset', { v: 'next' });
  assert.equal(pressed(k, 'ArrowDown'), false);
  assert.match(view(k).msg, /英字・数字・Esc/, '矢印は割り当てできない(固定のキー)');
  deq(k.k.keys(), KM.DEFAULTS);
});
test('矢印キー: 学習記録・保存には触れない(動かしただけでは何も変わらない)', () => {
  const g = battle();
  const s0 = snapshot(g);
  const store0 = JSON.stringify(g.store);
  ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowRight'].forEach(k => pressed(g, k));
  assert.equal(snapshot(g), s0);
  assert.equal(JSON.stringify(g.store), store0);
  assert.equal(view(g).answered, 0);
});
test('矢印キー: 画面下の案内に表示される(語順整序では Tab / ↑↓)', () => {
  const g = battle();
  assert.match(g.hint().text, /↑↓ で選択を移動・Enter で決定/);
  g.answer(true);
  assert.ok(!/↑↓/.test(g.hint().text), '回答後は、移動する選択肢がないので案内しない');
  const h = bootP();
  startP(h, 'learn');
  toKind(h, 'ordering');
  assert.match(h.hint().text, /Tab \/ ↑↓ で語句へ移動/);
});

/* ================= フォーカスの維持・連続操作 ================= */
test('フォーカス: 回答後は「つぎへ」、次の問題では最初の選択肢へ。キーだけで連続して操作できる(フォーカスが body に戻らない)', () => {
  const g = battle();
  assert.equal(g.activeEl(), null, '起動直後は、勝手にフォーカスを奪わない');
  pressed(g, '2');
  assert.equal(g.focused().act, 'next');
  pressed(g, 'n');
  assert.equal(g.focused().act, 'ans');
  assert.equal(g.focused().data.i, '0');
  g.focusAct('ans', { i: 2 });
  g.activeEl().click();
  assert.equal(view(g).pick, 2, 'Enter / Space(= click)でも回答できる');
  assert.equal(g.focused().act, 'next');
  g.activeEl().click();
  assert.equal(g.focused().act, 'ans');
  let guard = 0;
  while (view(g).mode === 'battle' && guard++ < 30) {
    assert.ok(g.activeEl(), 'フォーカスがある');
    pressed(g, '1');
    assert.ok(g.activeEl());
    pressed(g, 'n');
  }
  assert.equal(view(g).mode, 'result');
  assert.ok(g.activeEl(), '結果画面にもフォーカスがある');
});
test('フォーカス: 構文の選択式問題でも、回答後・次の問題へフォーカスが移る', () => {
  const g = bootP();
  startP(g, 'learn');
  assert.notEqual(view(g).q.kind, 'ordering');
  pressed(g, '1');
  assert.equal(g.focused().act, 'pnext');
  pressed(g, 'n');
  assert.ok(
    (g.focused() && ['pans', 'padd', 'pcheck'].indexOf(g.focused().act) >= 0) ||
      view(g).mode !== 'pquiz',
    '次の問題の最初の操作へ'
  );
});
test('フォーカス: マウス・タップの操作でも、ボタンの作り直しでフォーカスが失われない。テーマの切り替えでは同じボタンにとどまる', () => {
  const g = bootP();
  g.focusAct('theme', { v: 'dark' });
  g.activeEl().click();
  assert.equal(g.focused().act, 'theme');
  assert.equal(g.focused().data.v, 'dark');
  assert.equal(g.root.getAttribute('data-theme'), 'dark');
});

/* ================= 画面での案内・アクセシビリティ ================= */
test('画面の案内: 選択肢・つぎへ・発音のボタンに aria-keyshortcuts と表示用の data-key が付く。キーの案内文が出る(設定を変えると追従)', () => {
  const g = battle();
  const ans = g.buttons().filter(b => b.dataset.act === 'ans');
  assert.equal(ans.length, 4);
  ans.forEach((b, i) => {
    assert.equal(b.getAttribute('aria-keyshortcuts'), String(i + 1));
    assert.equal(b.getAttribute('data-key'), String(i + 1));
  });
  assert.match(g.hint().text, /キーボード/);
  assert.match(g.hint().text, /1〜4 で答えを選ぶ/);
  assert.match(g.hint().text, /Esc で中断/);
  assert.equal(g.hint().hidden, false);
  g.answer(true);
  const nx = g.buttons().find(b => b.dataset.act === 'next');
  assert.equal(nx.getAttribute('aria-keyshortcuts'), 'N');
  assert.equal(nx.getAttribute('data-key'), 'N');
  assert.match(g.hint().text, /N でつぎへ/);
  g.buttons()
    .filter(b => b.dataset.act === 'speak')
    .forEach(b => assert.equal(b.getAttribute('aria-keyshortcuts'), 'R'));
  assert.ok(
    g
      .buttons()
      .filter(b => b.dataset.act === 'ans')
      .every(b => b.getAttribute('aria-keyshortcuts') === null),
    '回答後の(押せない)選択肢には付けない'
  );
  g.click('home');
  assert.equal(g.hint().hidden, true, 'ホームでは案内を出さない');
  g.click('keys');
  g.click('keyset', { v: 'select1' });
  pressed(g, 'a');
  g.click('keyset', { v: 'next' });
  pressed(g, 'x');
  g.click('home');
  g.learn(3);
  g.click('battle');
  assert.match(g.hint().text, /A \/ 2 \/ 3 \/ 4 で答えを選ぶ/);
  assert.equal(
    g
      .buttons()
      .find(b => b.dataset.act === 'ans' && b.dataset.i === '0')
      .getAttribute('aria-keyshortcuts'),
    'A'
  );
  g.answer(true);
  assert.equal(
    g
      .buttons()
      .find(b => b.dataset.act === 'next')
      .getAttribute('aria-keyshortcuts'),
    'X'
  );
  assert.match(g.hint().text, /X でつぎへ/);
});
test('画面の案内: 語順整序・BOT・構文の選択式でも表示される。BOTの一時停止ボタンには P', () => {
  const g = bootP();
  startP(g, 'learn');
  toKind(g, 'ordering');
  const pool = g.buttons().filter(b => b.dataset.act === 'padd');
  assert.equal(pool[0].getAttribute('aria-keyshortcuts'), '1');
  if (pool[3]) assert.equal(pool[3].getAttribute('aria-keyshortcuts'), '4');
  if (pool[4])
    assert.equal(
      pool[4].getAttribute('aria-keyshortcuts'),
      null,
      '5枚目以降は数字キーなし(Tab・Enter・Space)'
    );
  const h = bootP();
  fakeTimers(h);
  botStart(h, 'word');
  const p = h.buttons().find(b => b.dataset.act === 'botpause');
  assert.equal(p.getAttribute('aria-keyshortcuts'), 'P');
  assert.match(h.hint().text, /P で一時停止・再開/);
  pressed(h, 'p');
  assert.equal(
    h
      .buttons()
      .find(b => b.dataset.act === 'botresume')
      .getAttribute('aria-keyshortcuts'),
    'P'
  );
});

/* ================= 学習記録・既存の保存を壊さない ================= */
test('キー設定の変更だけでは、学習記録・テーマ・バックアップなど、既存の保存内容は一切変わらない(保存するのは kotoba-monster-keymap だけ)', () => {
  const g = bootP();
  g.learn(3);
  g.click('battle');
  pressed(g, '1');
  g.click('home');
  const rec0 = g.store[KEY],
    other0 = withoutMap(g.store),
    s0 = snapshot(g);
  g.click('keys');
  g.click('keyset', { v: 'next' });
  pressed(g, 'x');
  g.click('keyset', { v: 'speak' });
  pressed(g, '1');
  pressed(g, 'k');
  g.click('keyset', { v: 'back' });
  g.click('keycancel');
  g.click('keyreset');
  g.click('keyset', { v: 'pause' });
  pressed(g, 'y');
  assert.equal(g.store[KEY], rec0);
  assert.equal(withoutMap(g.store), other0, 'キー設定以外の保存は変わらない');
  assert.equal(snapshot(g), s0);
  assert.deepEqual(
    Object.keys(g.store).filter(k => k.indexOf('keymap') >= 0),
    [MAPKEY]
  );
  const text = JSON.stringify(g.k.state());
  assert.ok(!/keymap|select1|Escape/.test(text), '学習記録にキー設定は入らない');
  assert.equal(g.k.state().v, 4, '学習記録の形式は v4 のまま');
  // 書き出しにもキー設定は入らない(書き出し・読み込みは変更していない)
  g.click('home');
  g.click('export');
  const blob = JSON.parse(g.sb.__blobs[0]);
  assert.equal(blob.format, 4);
  assert.ok(!/select1|keymap/.test(g.sb.__blobs[0]));
});
test('起動しただけでは何も保存しない。保存されたキー設定を読んでも、書き換えない', () => {
  const stored = { [MAPKEY]: KM.serialize(Object.assign({}, KM.DEFAULTS, { next: 'x' })) };
  const g = bootP({ storage: stored });
  assert.equal(g.store[MAPKEY], stored[MAPKEY]);
  assert.ok(!(KEY in g.store), '起動だけでは学習記録も作らない');
  g.click('keys');
  g.click('home');
  assert.equal(g.store[MAPKEY], stored[MAPKEY]);
  const bad = bootP({ storage: { [MAPKEY]: '{壊れた' } });
  deq(bad.k.keys(), KM.DEFAULTS);
  assert.equal(bad.store[MAPKEY], '{壊れた', '壊れた値は初期設定として使うだけで、書き換えない');
});
test('他のタブでキー設定が変わったら(storage イベント)読み直す。他のキーの変更では読み直さない', () => {
  const g = bootP();
  g.store[MAPKEY] = KM.serialize(Object.assign({}, KM.DEFAULTS, { next: 'x' }));
  g.fireStorage('kotoba-monster-theme');
  assert.equal(g.k.keys().next, 'n');
  g.fireStorage(MAPKEY);
  assert.equal(g.k.keys().next, 'x');
});
test('keymap.js が無い環境(読み込めなかった場合)でも、ゲームは従来どおり動く。キー設定の入口は出ない', () => {
  const g = bootP({ keymap: false });
  assert.ok(!g.html().includes('data-act="keys"'));
  assert.equal(pressed(g, '1'), false);
  g.learn(3);
  g.click('battle');
  assert.equal(pressed(g, '1'), false);
  assert.equal(view(g).done, false);
  g.answer(true);
  assert.equal(view(g).done, true);
  assert.equal(g.sb.__errors.length, 0);
  assert.equal(g.hint().text, '');
});
test('エラーなく動く: 一連のキー操作で console.error が出ない(単語・構文・BOT・キー設定)', () => {
  const g = bootP();
  fakeTimers(g);
  g.learn(3);
  g.click('battle');
  for (let i = 0; i < 12 && view(g).mode === 'battle'; i++) {
    pressed(g, '1');
    pressed(g, 'n');
  }
  pressed(g, 'Escape');
  startP(g, 'learn');
  for (let i = 0; i < 8 && view(g).mode === 'pquiz'; i++) {
    if (view(g).q.kind === 'ordering') {
      pressed(g, '1');
      pressed(g, '2');
      pressed(g, '3');
      pressed(g, '4');
    } else pressed(g, '1');
    pressed(g, 'n');
  }
  pressed(g, 'Escape');
  pressed(g, 'Escape');
  botStart(g, 'phrase');
  pressed(g, 'p');
  pressed(g, 'r');
  pressed(g, 'p');
  pressed(g, 'Escape');
  g.click('keys');
  g.click('keyset', { v: 'next' });
  pressed(g, 'x');
  pressed(g, 'Escape');
  assert.deepEqual(g.sb.__errors, []);
});
