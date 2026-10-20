'use strict';
// 表示テーマ(ライト/ダーク)のテスト。
// 動作 : 切り替え・画面遷移後の維持・再読み込み・OS設定との優先順位・不正な保存値・保存できない環境
// 保護 : テーマの操作で、学習記録(localStorage の既存キー・state)が変わらない /
// 記録のリセットでテーマが消えない
// CSS  : 色を CSS 変数で一元管理(直書き・全体反転なし)
// ・ダークの2つの定義が一致・参照する変数がすべて定義済み・コントラスト比
//   起動 : index.html の先読みスクリプト(描画前に data-theme を付けてちらつきを防ぐ)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { bootP, KEY, lint, playAll } = require('./phrase_boot.js');
const { boot, read, readCss } = require('./harness.js');

const THEME_KEY = 'kotoba-monster-theme';
const css = readCss(),
  indexHtml = read('index.html'),
  appJs = read('src/app.js');
const T0 = 1700000000000;
const pressed = html =>
  Array.from(html.matchAll(/data-v="(auto|light|dark)" aria-pressed="(true|false)"/g)).map(m => [
    m[1],
    m[2]
  ]);
const selected = html =>
  pressed(html)
    .filter(x => x[1] === 'true')
    .map(x => x[0]);
const learnSome = g => {
  g.k.setClock(() => T0);
  g.learn(3);
  g.click('battle');
  let n = 0;
  while (g.k.view().mode === 'battle' && n++ < 40) {
    g.answer(n % 3 !== 0);
    g.next();
  }
  g.click('home');
};

/* ================= 動作 ================= */
test('切り替え: 自動 / ライト / ダーク を選べ、<html> の data-theme と保存値が変わる(自動は属性・保存値なし)', () => {
  const g = boot();
  assert.equal(g.theme(), null, '初期は未選択');
  deqSel(g, ['auto']);
  g.click('theme', { v: 'dark' });
  assert.equal(g.theme(), 'dark');
  assert.equal(g.store[THEME_KEY], 'dark');
  deqSel(g, ['dark']);
  g.click('theme', { v: 'light' });
  assert.equal(g.theme(), 'light');
  assert.equal(g.store[THEME_KEY], 'light');
  deqSel(g, ['light']);
  g.click('theme', { v: 'auto' });
  assert.equal(g.theme(), null);
  assert.ok(!(THEME_KEY in g.store), '自動に戻すと保存値は消える');
  deqSel(g, ['auto']);
  g.click('theme', { v: 'blue' });
  g.click('theme', { v: '' });
  g.click('theme', {});
  assert.equal(g.theme(), null, '不正な値は無視');
  assert.ok(!(THEME_KEY in g.store));
  assert.equal(g.sb.__errors.length, 0);
});
function deqSel(g, want) {
  assert.deepEqual(selected(g.html()), want);
}
test('ホームの表示: 現在のテーマ名と、選択中のボタン(✓ と aria-pressed)が分かる。色だけに頼らない・HTMLは安全', () => {
  const g = boot();
  const h = g.html();
  lint(h, 'home');
  assert.match(
    h,
    /<fieldset class="theme"><legend class="small">表示テーマ\(現在: ライト・OSの設定に従っています\)<\/legend>/
  );
  deqPairs(pressed(h), [
    ['auto', 'true'],
    ['light', 'false'],
    ['dark', 'false']
  ]);
  assert.ok(h.includes('✓ 🖥️ 自動'), '選択中には ✓');
  assert.ok(!h.includes('✓ ☀️') && !h.includes('✓ 🌙'));
  g.click('theme', { v: 'dark' });
  const d = g.html();
  lint(d, 'home dark');
  assert.ok(
    d.includes('現在: ダーク)</legend>') &&
      d.includes('✓ 🌙 ダーク') &&
      !d.includes('OSの設定に従っています')
  );
  deqPairs(pressed(d), [
    ['auto', 'false'],
    ['light', 'false'],
    ['dark', 'true']
  ]);
  ['auto', 'light', 'dark'].forEach(v =>
    assert.ok(d.includes('data-act="theme" data-v="' + v + '"'))
  );
});
function deqPairs(a, b) {
  assert.deepEqual(
    a.map(x => x.join(':')),
    b.map(x => x.join(':'))
  );
}
test('維持: 選んだテーマは画面遷移(学習・バトル・復習・図鑑・構文・BOT)と再描画のあとも変わらず、切り替えボタンも動き続ける', () => {
  const g = bootP();
  g.click('theme', { v: 'dark' });
  const keep = label => {
    assert.equal(g.theme(), 'dark', label);
  };
  g.click('learn');
  keep('学習');
  g.click('learnNext');
  keep('学習2');
  g.click('battle');
  keep('バトル');
  g.answer(true);
  keep('回答');
  g.next();
  keep('次の問題');
  let n = 0;
  while (g.k.view().mode === 'battle' && n++ < 40) {
    g.answer(true);
    g.next();
  }
  keep('結果');
  g.click('home');
  g.click('zukan');
  keep('図鑑');
  g.click('home');
  g.click('review');
  keep('復習');
  g.click('home');
  g.click('pmenu');
  keep('構文メニュー');
  g.click('plearn');
  if (g.k.view().mode === 'pwords') g.click('pgo');
  keep('構文');
  playAll(g, true);
  keep('構文の結果');
  g.click('home');
  g.click('pmenu');
  g.click('pzukan');
  keep('構文図鑑');
  g.click('home');
  g.click('botmenu');
  keep('BOT設定');
  g.click('botstart');
  keep('BOT再生');
  g.click('botpause');
  keep('BOT一時停止');
  g.click('botresume');
  g.click('botnext');
  keep('BOT次へ');
  g.click('botstop');
  keep('BOT終了');
  g.click('home');
  keep('ホーム');
  deqSel(g, ['dark']);
  g.click('theme', { v: 'light' });
  assert.equal(g.theme(), 'light', '再描画のあとでも切り替えられる');
  g.click('botmenu');
  g.click('botstart');
  assert.equal(g.theme(), 'light');
  g.click('botstop');
  g.click('home');
  g.click('theme', { v: 'dark' });
  assert.equal(g.theme(), 'dark');
  assert.equal(g.sb.__errors.length, 0);
});
test('再読み込み: 保存したテーマが、最初の描画の前(起動直後)から適用される', () => {
  const g1 = boot();
  g1.click('theme', { v: 'dark' });
  const g2 = boot({ storage: g1.store });
  assert.equal(g2.theme(), 'dark', '再読み込み後も dark');
  deqSel(g2, ['dark']);
  g2.click('theme', { v: 'light' });
  const g3 = boot({ storage: g2.store });
  assert.equal(g3.theme(), 'light');
  g3.click('theme', { v: 'auto' });
  const g4 = boot({ storage: g3.store });
  assert.equal(g4.theme(), null);
  deqSel(g4, ['auto']);
});
test('OS の設定: 保存がなければ OS に従う(ダーク/ライト)。OS の変更にも追従し、アドレスバーの色も合う', () => {
  const d = boot({ prefersDark: true });
  assert.equal(d.theme(), null, 'data-theme は付けず CSS の prefers-color-scheme に任せる');
  assert.ok(d.html().includes('現在: ダーク・OSの設定に従っています'));
  assert.equal(d.el('tc').getAttribute('content'), '#0f1426');
  const l = boot({ prefersDark: false });
  assert.ok(l.html().includes('現在: ライト・OSの設定に従っています'));
  assert.equal(l.el('tc').getAttribute('content'), '#e8f0ff');
  d.setOS(false);
  assert.ok(d.html().includes('現在: ライト・OSの設定に従っています'), 'OSの変更に追従');
  assert.equal(d.el('tc').getAttribute('content'), '#e8f0ff');
  d.setOS(true);
  assert.ok(d.html().includes('現在: ダーク'));
});
test('ユーザーの選択が OS の設定より優先される(OSがダークでライトを選ぶ・OSがライトでダークを選ぶ)。OSが変わっても選択は変わらない', () => {
  const a = boot({ prefersDark: true });
  a.click('theme', { v: 'light' });
  assert.equal(
    a.theme(),
    'light',
    'data-theme=light が OS のダークより優先(CSSの :not([data-theme=light]) で確認)'
  );
  assert.ok(a.html().includes('現在: ライト)</legend>'));
  assert.equal(a.el('tc').getAttribute('content'), '#e8f0ff');
  a.setOS(false);
  a.setOS(true);
  assert.equal(a.theme(), 'light', 'OS が変わっても選択を維持');
  assert.ok(a.html().includes('現在: ライト)</legend>'));
  const b = boot({ prefersDark: false });
  b.click('theme', { v: 'dark' });
  assert.equal(b.theme(), 'dark');
  assert.ok(b.html().includes('現在: ダーク)</legend>'));
  assert.equal(b.el('tc').getAttribute('content'), '#0f1426');
  b.click('theme', { v: 'auto' });
  assert.ok(b.html().includes('現在: ライト・OSの設定に従っています'), '自動に戻すと OS に従う');
  const c = boot({ prefersDark: true, storage: { [THEME_KEY]: 'light' } });
  assert.equal(c.theme(), 'light', '保存された選択は起動時から OS より優先');
});
test('他のタブでテーマが変わったら(storage イベント)、このタブも追従する', () => {
  const g = boot();
  g.store[THEME_KEY] = 'dark';
  g.fireStorage(THEME_KEY);
  assert.equal(g.theme(), 'dark');
  deqSel(g, ['dark']);
  delete g.store[THEME_KEY];
  g.fireStorage(THEME_KEY);
  assert.equal(g.theme(), null);
  g.store[THEME_KEY] = 'dark';
  g.fireStorage('kotoba-monster-v1');
  assert.equal(g.theme(), null, '無関係なキーの変更では動かない');
  ['blue', '', 'DARK'].forEach(bad => {
    g.store[THEME_KEY] = 'dark';
    g.fireStorage(THEME_KEY);
    assert.equal(g.theme(), 'dark');
    g.store[THEME_KEY] = bad;
    g.fireStorage(THEME_KEY);
    assert.equal(
      g.theme(),
      null,
      '起動後に他のタブが書いた不正な値(' + JSON.stringify(bad) + ')は無視して OS に従う'
    );
    deqSel(g, ['auto']);
  });
});
test('不正な保存値: 安全な初期状態(OSに従う)に戻し、テーマのキーだけを消す。記録は消さない', () => {
  ['blue', '', 'DARK', 'true', '{"x":1}', '0'].forEach(bad => {
    const rec = JSON.stringify({ v: 4, xp: 123 }),
      g = boot({ storage: { [THEME_KEY]: bad, [KEY]: rec, [KEY + '-backup-v1']: 'old' } });
    assert.equal(g.theme(), null, JSON.stringify(bad) + ' は無視');
    assert.ok(!(THEME_KEY in g.store), '不正な保存値は削除');
    assert.equal(g.store[KEY + '-backup-v1'], 'old', '退避した記録は残る');
    assert.ok(KEY in g.store, '記録は残る');
    deqSel(g, ['auto']);
    g.click('theme', { v: 'dark' });
    assert.equal(g.theme(), 'dark', '不正値のあとでも選べる');
    assert.equal(g.sb.__errors.length, 0);
  });
});
test('保存できない環境(localStorage が書き込み不可): エラーにならず、このページを開いている間は選択を保つ', () => {
  const g = boot({ storageFails: true });
  g.click('theme', { v: 'dark' });
  assert.equal(g.theme(), 'dark');
  g.click('learn');
  g.click('home');
  assert.equal(g.theme(), 'dark');
  deqSel(g, ['dark']);
  g.click('theme', { v: 'auto' });
  assert.equal(g.theme(), null);
  deqSel(g, ['auto']);
  assert.equal(g.sb.__errors.length, 0);
  const h = boot();
  h.sb.localStorage.getItem = () => {
    throw new Error('denied');
  };
  h.click('theme', { v: 'light' });
  assert.equal(h.theme(), 'light');
  assert.equal(h.sb.__errors.length, 0);
});

/* ================= 学習記録の保護 ================= */
test('記録の保護: テーマの切り替え・再描画・OSの変更では、学習記録(state・既存の localStorage キー)は1バイトも変わらない。変わるのはテーマのキーだけ', () => {
  const g = bootP({ prefersDark: true });
  learnSome(g);
  const stateBefore = JSON.stringify(g.k.state()),
    storeBefore = JSON.stringify(g.store);
  assert.ok(g.k.state().xp > 0 && KEY in g.store);
  const ls = g.sb.localStorage;
  const keysWritten = [];
  const so = ls.setItem,
    ro = ls.removeItem;
  ls.setItem = (k, v) => {
    keysWritten.push(k);
    return so(k, v);
  };
  ls.removeItem = k => {
    keysWritten.push(k);
    return ro(k);
  };
  ['dark', 'light', 'auto', 'dark', 'dark', 'light'].forEach(v => g.click('theme', { v }));
  g.setOS(false);
  g.setOS(true);
  g.click('botmenu');
  g.click('botstart');
  g.click('botstop');
  g.click('home');
  g.click('zukan');
  g.click('home');
  assert.ok(
    keysWritten.length > 0 && keysWritten.every(k => k === THEME_KEY),
    '触れたキーはテーマだけ: ' + Array.from(new Set(keysWritten)).join()
  );
  assert.equal(JSON.stringify(g.k.state()), stateBefore, 'state が変わっていない');
  const after = Object.assign({}, g.store);
  delete after[THEME_KEY];
  assert.equal(JSON.stringify(after), storeBefore, '既存キーの中身が変わっていない');
});
test('記録の保護: 「記録を消してはじめから」「記録の読み込み」でも、テーマの設定は消えない(記録とは独立)', () => {
  const g = bootP();
  learnSome(g);
  g.click('theme', { v: 'dark' });
  g.click('reset');
  assert.equal(g.k.state().xp, 0, '記録はリセットされた');
  assert.equal(g.theme(), 'dark');
  assert.equal(g.store[THEME_KEY], 'dark', 'テーマは残る');
  learnSome(g);
  g.k.importText(JSON.stringify(g.k.state()));
  assert.equal(g.theme(), 'dark');
  assert.equal(g.store[THEME_KEY], 'dark');
  const h = bootP({ storage: g.store });
  assert.equal(h.theme(), 'dark');
  assert.ok(h.k.state().xp > 0, '記録も再読み込みで残る');
});
test('記録の保護: テーマを選んだだけでは、学習記録の保存(KEY)は作られない', () => {
  const g = boot();
  g.click('theme', { v: 'dark' });
  g.click('learn');
  g.click('home');
  assert.ok(!(KEY in g.store), '記録のキーはまだ無い');
  assert.deepEqual(Object.keys(g.store), [THEME_KEY]);
});

/* ================= CSS(配色の一元管理) ================= */
const blocks = (() => {
  const rootRe = /:root\{([^}]*)\}/,
    darkRe = /:root\[data-theme="dark"\]\{([^}]*)\}/,
    mediaRe =
      /@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)\{([^}]*)\}\}/;
  const parse = b => {
    const o = {};
    b.split(';')
      .map(x => x.trim())
      .filter(Boolean)
      .forEach(d => {
        const i = d.indexOf(':');
        o[d.slice(0, i)] = d.slice(i + 1);
      });
    return o;
  };
  const l = css.match(rootRe),
    d = css.match(darkRe),
    m = css.match(mediaRe);
  assert.ok(l && d && m, 'ライト・ダーク(選択)・ダーク(OS設定)の3ブロックがある');
  return { light: parse(l[1]), dark: parse(d[1]), media: parse(m[1]), raw: [l[0], d[0], m[0]] };
})();
test('CSS: ダークの定義が2か所(ユーザー選択・OS設定)で完全に一致し、ライトと同じ変数がすべて揃っている', () => {
  assert.deepEqual(blocks.dark, blocks.media, 'ダークの2つのブロックの内容が違う');
  assert.deepEqual(
    Object.keys(blocks.dark).sort(),
    Object.keys(blocks.light).sort(),
    'ライトとダークで変数の集合が違う'
  );
  assert.equal(blocks.light['color-scheme'], 'light');
  assert.equal(blocks.dark['color-scheme'], 'dark');
  assert.ok(
    css.indexOf(':root[data-theme="dark"]') < css.indexOf('@media (prefers-color-scheme:dark)')
  );
});
test('CSS: 色はこの3ブロック以外に直接書かない(すべて var(--…))。参照する変数はすべて定義済み。全体反転(filter: invert)は使わない', () => {
  let rest = css;
  blocks.raw.forEach(b => {
    rest = rest.replace(b, '');
  });
  assert.deepEqual(
    rest.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [],
    [],
    '色の直書きが残っている'
  );
  assert.ok(!/invert\s*\(/i.test(css), 'filter: invert は使わない');
  const defined = new Set(Object.keys(blocks.light)),
    used = new Set(Array.from(css.matchAll(/var\((--[a-z-]+)\)/g)).map(m => m[1]));
  used.forEach(v => assert.ok(defined.has(v), v + ' が未定義'));
  defined.forEach(v => {
    if (v !== 'color-scheme') assert.ok(used.has(v), v + ' は定義だけで使われていない(不要な変数)');
  });
  assert.match(css, /outline:4px solid var\(--focus\)/, 'フォーカスリングは変数');
  assert.match(
    css,
    /\.btn:disabled\{background:var\(--dis-bg\);color:var\(--dis-ink\)/,
    '無効状態は、専用の色(--dis-bg / --dis-ink)で示す(opacity で薄くしない)'
  );
});
// WCAG のコントラスト比
const lum = h => {
  h = h.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map(c => c + c)
      .join('');
  const [r, g, b] = [0, 2, 4]
    .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const TEXT_PAIRS = [
  ['ink', 'bg'],
  ['ink', 'card'],
  ['ink', 'surface'],
  ['mute', 'bg'],
  ['mute', 'card'],
  ['mute', 'surface'],
  ['pri-ink', 'pri'],
  ['ok-ink', 'ok'],
  ['ng-ink', 'ng'],
  ['sun-ink', 'sun'],
  ['toast-ink', 'toast-bg'],
  ['ink', 'badge'],
  ['ink', 'badge-learning'],
  ['ink', 'badge-review'],
  ['ink', 'badge-mastered'],
  ['dis-ink', 'dis-bg'],
  ['mute', 'badge'],
  ['mute', 'track']
];
test('CSS: ダークモードは、すべての文字と背景の組み合わせで WCAG AA(4.5:1)以上。フォーカスリング・進捗・枠線も背景と区別できる', () => {
  const d = blocks.dark;
  TEXT_PAIRS.forEach(([f, b]) =>
    assert.ok(
      ratio(d['--' + f], d['--' + b]) >= 4.5,
      'ダーク ' + f + ' on ' + b + ' = ' + ratio(d['--' + f], d['--' + b]).toFixed(2)
    )
  );
  [
    ['focus', 'bg'],
    ['focus', 'card'],
    ['focus', 'surface']
  ].forEach(([f, b]) =>
    assert.ok(ratio(d['--' + f], d['--' + b]) >= 3, 'フォーカス ' + f + ' on ' + b)
  );
  ['card', 'surface', 'bg'].forEach(b =>
    assert.ok(
      ratio(d['--line'], d['--' + b]) >= 2.5,
      '枠線 on ' + b + ' = ' + ratio(d['--line'], d['--' + b]).toFixed(2)
    )
  );
  ['ok', 'ng', 'pri'].forEach(c =>
    assert.ok(ratio(d['--' + c], d['--card']) >= 3, c + ' on card (ボタン・バー)')
  );
  assert.ok(ratio(d['--ok'], d['--track']) >= 3, '進捗バーの塗りと下地');
  assert.ok(ratio(d['--ng'], d['--track']) >= 3, 'HPバーの塗りと下地');
  assert.ok(ratio(d['--bg'], d['--surface']) >= 1.1);
});
test('CSS: ライトモードも、すべての文字と背景の組み合わせで WCAG 2.2 の 1.4.3(通常サイズの文字 4.5:1)以上。補助文字 --mute も満たす', () => {
  const l = blocks.light;
  TEXT_PAIRS.forEach(([f, b]) =>
    assert.ok(
      ratio(l['--' + f], l['--' + b]) >= 4.5,
      'ライト ' + f + ' on ' + b + ' = ' + ratio(l['--' + f], l['--' + b]).toFixed(2)
    )
  );
  assert.ok(ratio(l['--mute'], l['--bg']) >= 4.5, '改善前は 3.98:1 だった --mute on --bg');
  assert.equal(l['--mute'], '#4f5a7e');
  ['ok', 'ng', 'pri'].forEach(c =>
    assert.ok(ratio(l['--' + c], l['--card']) >= 3, c + ' on card(ボタン・枠の非テキスト要素)')
  );
  assert.ok(
    ratio(l['--ok'], l['--track']) >= 3 && ratio(l['--ng'], l['--track']) >= 3,
    '進捗バー・HPバーの塗りと下地'
  );
  assert.ok(ratio(l['--focus'], l['--card']) >= 1, 'フォーカスは枠線の太さ(4px)でも示す');
  // 変えていない配色(今回の修正と無関係な値)は、現行のまま
  const kept = {
    '--bg': '#e8f0ff',
    '--ink': '#1f2a4d',
    '--card': '#fff',
    '--pri': '#4c5bd4',
    '--sun': '#ffc94a',
    '--line': '#cfd9f5',
    '--surface': '#fff',
    '--pri-ink': '#fff',
    '--sun-ink': '#1f2a4d',
    '--badge-learning': '#d9e4ff',
    '--badge-review': '#ffd9de',
    '--badge-mastered': '#c9f2e0'
  };
  Object.keys(kept).forEach(k =>
    assert.equal(l[k], kept[k], 'ライトの ' + k + ' は今回の修正の対象外')
  );
});
// opacity で合成された「実際に表示される色」のコントラスト(前景を下地に不透明度 a で重ねる)
const rgb = h => {
  h = h.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map(c => c + c)
      .join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
const blend = (fg, bg, a) =>
  '#' +
  fg
    .map((v, i) =>
      Math.round(v * a + rgb(bg)[i] * (1 - a))
        .toString(16)
        .padStart(2, '0')
    )
    .join('');
const opacityDecls = () =>
  Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .map(m => ({ sel: m[1].trim(), body: m[2] }))
    .filter(r => /(^|;)\s*opacity\s*:/.test(r.body))
    .map(r => ({ sel: r.sel, v: r.body.match(/(?:^|;)\s*opacity\s*:\s*([^;]+)/)[1].trim() }));
test('CSS: 回答後の正解・不正解の選択肢は薄くしない(opacity なし)。ライト・ダークとも、表示される文字色で 4.5:1 以上', () => {
  assert.ok(
    !('--ans-opacity' in blocks.light) && !('--ans-opacity' in blocks.dark),
    '--ans-opacity は廃止(正解・不正解を薄くしない)'
  );
  assert.ok(!/ans-opacity/.test(css));
  assert.match(css, /\.choices \.btn\.ok\{background:var\(--ok\);color:var\(--ok-ink\)/);
  assert.match(css, /\.choices \.btn\.ng\{background:var\(--ng\);color:var\(--ng-ink\)/);
  ['light', 'dark'].forEach(t => {
    const d = blocks[t];
    assert.ok(ratio(d['--ok-ink'], d['--ok']) >= 4.5, t + ' 正解の選択肢');
    assert.ok(ratio(d['--ng-ink'], d['--ng']) >= 4.5, t + ' 不正解の選択肢');
    // 回答後の無効な選択肢(選ばなかったもの): 文字は --mute、背景は --surface
    assert.ok(
      ratio(d['--mute'], d['--surface']) >= 4.5,
      t + ' 選ばなかった選択肢(--mute on --surface)'
    );
  });
});
test('CSS: opacity による文字の薄表示を使わない(許可: フェードの #toast のみ)。無効なボタン・使用済みカードは専用色で、コントラスト 4.5:1 以上', () => {
  const found = opacityDecls();
  found.forEach(o =>
    assert.ok(
      o.sel === '#toast' || o.sel === '#toast.on' || o.sel === '.search::placeholder',
      '想定外の opacity: ' + o.sel + ' { ' + o.v + ' }'
    )
  );
  assert.deepEqual(
    found.filter(o => o.sel === '.search::placeholder').map(o => o.v),
    ['1'],
    'Firefox は placeholder を薄くするため、1 を明示する'
  );
  // 仮に opacity を使う場合の実効コントラスト計算が正しく働くこと(0.45
  // では文字と背景の差が不足する = 以前の不具合の再現)
  assert.ok(
    ratio(
      blend(rgb(blocks.light['--ink']), blocks.light['--surface'], 0.45),
      blend(rgb(blocks.light['--surface']), blocks.light['--card'], 0.45)
    ) < 4.5,
    '以前の .45 では不足していた'
  );
  ['light', 'dark'].forEach(t => {
    const d = blocks[t];
    assert.match(css, /\.btn:disabled\{background:var\(--dis-bg\);color:var\(--dis-ink\)/);
    assert.match(css, /\.pcard\.used\{[^}]*background:var\(--dis-bg\)[^}]*color:var\(--dis-ink\)/);
    assert.ok(
      ratio(d['--dis-ink'], d['--dis-bg']) >= 4.5,
      t + ' 無効なボタン・使用済みカード = ' + ratio(d['--dis-ink'], d['--dis-bg']).toFixed(2)
    );
    assert.ok(
      ratio(d['--dis-bg'], d['--bg']) > 1.05 && ratio(d['--dis-bg'], d['--bg']) !== 1,
      t + ' 無効なボタンの背景は、有効なボタンの色(--pri / --sun)とも違う'
    );
    assert.notEqual(d['--dis-bg'], d['--pri']);
    assert.notEqual(d['--dis-bg'], d['--sun']);
  });
  assert.match(
    css,
    /\.search::placeholder\{color:var\(--mute\);opacity:1\}/,
    '入力欄の案内文字は --mute(4.5:1 以上)で、薄くしない'
  );
  ['light', 'dark'].forEach(t =>
    ['bg', 'card', 'surface'].forEach(b =>
      assert.ok(
        ratio(blocks[t]['--mute'], blocks[t]['--' + b]) >= 4.5,
        t + ' placeholder / 補助文字 on ' + b
      )
    )
  );
});
test('CSS: 正解・不正解の選択肢には、色に加えて記号(✓ / ✗)が付く(色だけに頼らない)', () => {
  assert.match(css, /\.choices \.btn\.ok::before\{content:"✓ "\}/);
  assert.match(css, /\.choices \.btn\.ng::before\{content:"✗ "\}/);
});
test('CSS: 状態は色だけで表さない(正解・不正解・復習などの表示に、記号・文字が残っている)', () => {
  const g = bootP();
  g.click('learn');
  g.click('learnNext');
  g.click('battle');
  g.answer(true);
  assert.match(g.html(), /class="card fb good"[\s\S]*(✅|⭕|正解)/, '正解の表示に記号か文字');
  g.next();
  g.answer(false);
  assert.match(
    g.html(),
    /class="card fb bad"[\s\S]*(❌|✖|残念|おしい|ちがう|不正解)/,
    '不正解の表示に記号か文字'
  );
  assert.match(g.html(), /class="btn ok"[^>]*>/, '正解の選択肢は ok クラス');
});

/* ================= 起動(ちらつき防止) ================= */
test('index.html: 先読みスクリプトが、スタイルシートより前(<head> 内)で、保存されたテーマを data-theme に付ける。保存キーは app.js と同じ', () => {
  const head = indexHtml.slice(indexHtml.indexOf('<head>'), indexHtml.indexOf('</head>')),
    sIdx = head.indexOf('<script>'),
    linkIdx = head.indexOf('<link rel="stylesheet"');
  assert.ok(sIdx > 0 && linkIdx > sIdx, '先読みスクリプトは CSS の読み込みより前');
  assert.match(head, /<meta name="color-scheme" content="light dark">/);
  assert.match(head, /<meta name="theme-color" id="tc" content="#e8f0ff">/);
  const key = head.match(/getItem\('([^']+)'\)/)[1];
  assert.equal(key, THEME_KEY);
  assert.match(appJs, new RegExp("const THEME_KEY = '" + THEME_KEY + "'"));
  assert.notEqual(THEME_KEY, KEY);
  assert.ok(!THEME_KEY.startsWith(KEY), '記録のキー(とその退避キー)と衝突しない');
});
// index.html の先読みスクリプトだけを、偽の localStorage / matchMedia で実行する
function runPreload(o) {
  const script = indexHtml.match(/<script>([\s\S]*?)<\/script>/)[1],
    attrs = {},
    meta = {};
  const sb = {
    document: {
      documentElement: {
        setAttribute: (k, v) => {
          attrs[k] = v;
        }
      },
      getElementById: id =>
        id === 'tc'
          ? {
              setAttribute: (k, v) => {
                meta[k] = v;
              }
            }
          : null
    },
    window: {}
  };
  sb.localStorage = {
    getItem: k => {
      if (o.throws) throw new Error('denied');
      return k === THEME_KEY && 'saved' in o ? o.saved : null;
    }
  };
  if (o.mm !== undefined) {
    sb.matchMedia = q => ({ matches: /dark/.test(q) ? o.mm : false });
    sb.window.matchMedia = sb.matchMedia;
  }
  vm.runInNewContext(script, sb);
  return { attrs, meta };
}
test('先読みスクリプト: 保存済みの dark/light を描画前に付ける。未保存・不正・読み出し失敗では付けず(CSSがOSに従う)、エラーにならない', () => {
  let r = runPreload({ saved: 'dark', mm: false });
  assert.equal(r.attrs['data-theme'], 'dark', 'OSがライトでも保存したダーク');
  assert.equal(r.meta.content, '#0f1426');
  r = runPreload({ saved: 'light', mm: true });
  assert.equal(r.attrs['data-theme'], 'light', 'OSがダークでも保存したライト');
  assert.equal(r.meta.content, '#e8f0ff');
  r = runPreload({ mm: true });
  assert.ok(!('data-theme' in r.attrs), '未保存では付けない');
  assert.equal(r.meta.content, '#0f1426', 'OSがダークならアドレスバーの色もダーク');
  r = runPreload({ mm: false });
  assert.ok(!('data-theme' in r.attrs));
  assert.equal(r.meta.content, '#e8f0ff');
  ['blue', '', 'Dark', 'null'].forEach(bad => {
    r = runPreload({ saved: bad, mm: true });
    assert.ok(!('data-theme' in r.attrs), JSON.stringify(bad) + ' は付けない');
  });
  r = runPreload({ throws: true, mm: true });
  assert.ok(!('data-theme' in r.attrs), '読み出しに失敗しても落ちない');
  r = runPreload({ saved: 'dark' });
  assert.equal(r.attrs['data-theme'], 'dark', 'matchMedia が無い環境でも動く');
});
test('アドレスバーの色(theme-color)は CSS の背景色(--bg)と一致している(index.html・app.js・style.css)', () => {
  const m = appJs.match(
    /const THEME_COLOR = \{ light: '(#[0-9a-f]{6})', dark: '(#[0-9a-f]{6})' \}/
  );
  assert.ok(m, 'THEME_COLOR');
  assert.equal(m[1], blocks.light['--bg']);
  assert.equal(m[2], blocks.dark['--bg']);
  const s = indexHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(s.includes("'" + m[2] + "' : '" + m[1] + "'"), '先読みスクリプトの色');
  assert.ok(indexHtml.includes('id="tc" content="' + m[1] + '"'));
});
