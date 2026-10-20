'use strict';
// HTMLの安全性: 単語データ・検索語に特殊文字(" ' < > & `)があっても、
// HTMLが壊れたり別のHTMLとして解釈されたりしない
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, read } = require('./harness.js');

// 読み上げ(Web Speech API)のスタブ。読み上げ文字列は「生の文字列」(HTMLエスケープ前)
// でなければならない
const SPEECH =
  "globalThis.__spoken = []; globalThis.speechSynthesis = { getVoices() { return [{ lang: 'fr-FR' }]; }, cancel() {}, speak(u) { globalThis.__spoken.push(u.text); }, addEventListener() {} }; globalThis.SpeechSynthesisUtterance = function (t) { this.text = t; };";

// 属性を壊す文字(" ' `)だけを含む → 単語の検証を通る(< > & は検証で拒否される)
const QUOTE = '" onmouseover="alert(1)\'`';
// 本文・属性の両方を壊そうとする文字列(検証を通らないので、起動後に直接差し込む=二重防御の確認)
const EVIL = '"><img src=x onerror=alert(1)><script>alert(2)</script>&amp;\'';

// ---- 簡易HTMLチェッカー: 正しく閉じた属性だけのタグを取り除き、<> が残らず、未知の属性(onxxx
// など)がないことを確認する ----
const TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[a-zA-Z][a-zA-Z0-9-]*(?:="[^"<>]*")?)*\s*\/?>/g;
const ATTR_OK =
  /^(class|id|style|title|type|value|placeholder|autocomplete|autocapitalize|spellcheck|aria-label|aria-pressed|disabled|selected|hidden|accept|data-[a-z]+)$/;
function lint(html, label) {
  // 1) 正しく閉じたタグ(属性値は " で囲まれ、値の中に < > " がない)だけを取り除く
  const tags = [];
  const rest = html.replace(TAG, tag => {
    tags.push(tag);
    return '';
  });
  assert.ok(
    !/[<>]/.test(rest),
    label +
      ': 閉じていない/不正なタグが残っています: ' +
      (rest.match(/.{0,30}[<>].{0,30}/) || [''])[0]
  );
  // 2) 各タグの属性名(値を除いたもの)が許可リストにあり、on* や src などが混入していない
  tags.forEach(tag => {
    const names = tag
      .replace(/="[^"]*"/g, '')
      .replace(/^<\/?[a-zA-Z0-9]+/, '')
      .replace(/\/?>$/, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    names.forEach(a => {
      assert.ok(ATTR_OK.test(a), label + ': 想定外の属性 "' + a + '" (' + tag.slice(0, 80) + ')');
      assert.ok(!/^on/i.test(a), label + ': イベントハンドラ属性');
    });
  });
  // 3) 危険なタグが1つも出力されていない(本文中の "&lt;img" のようなエスケープ済みの文字は対象外)
  tags.forEach(tag =>
    assert.ok(
      !/^<\/?(script|img|iframe|svg|style|link|object|embed)\b/i.test(tag),
      label + ': 危険なタグ ' + tag.slice(0, 40)
    )
  );
}

// 既存30語の全文字列項目に payload を付けた単語データ(検証は通る)
const hostileWords = payload =>
  "WORDS.forEach(w => { ['ja', 'kana', 'ex', 'exJa', 'emoji', 'fr'].forEach(f => { w[f] = w[f] + " +
  JSON.stringify(payload) +
  "; }); w.alt = [w.ja + 'x" +
  "']; w.note = " +
  JSON.stringify(payload) +
  '; w.cat = w.cat + ' +
  JSON.stringify(payload) +
  '; });\n' +
  'CATEGORIES.forEach((c, i) => { CATEGORIES[i] = c + ' +
  JSON.stringify(payload) +
  '; });';

// 全画面を巡回して lint する(ホーム・学習・バトル各形式・フィードバック・結果・復習結果・図鑑一覧/
// 詳細・復習なし)
function tourAll(g, label) {
  const seen = new Set(),
    shots = [];
  const snap = name => {
    shots.push(name);
    lint(g.html(), label + ' / ' + name);
  };
  snap('home');
  g.click('learn');
  snap('learn');
  g.click('learnNext');
  snap('learn2');
  g.click('learnNext');
  snap('learn3');
  // 最初の3語は間投詞(絵の問題にならない)
  g.click('battle');
  while (g.k.view().mode === 'battle') {
    g.answer(true);
    g.next();
  }
  // 名詞(w08〜)まで学習
  for (let i = 0; i < 2; i++) {
    g.click('home');
    g.click('learn');
    g.click('learnNext');
    g.click('learnNext');
    g.click('battle');
    while (g.k.view().mode === 'battle') {
      g.answer(true);
      g.next();
    }
  }
  g.click('home');
  g.click('battle');
  for (
    let round = 0;
    round < 40 &&
    !(seen.has('ja2fr') && seen.has('fr2ja') && seen.has('img2fr') && seen.has('aud2ja'));
    round++
  ) {
    if (g.k.view().mode !== 'battle') {
      g.click('home');
      g.click('battle');
    }
    while (g.k.view().mode === 'battle') {
      seen.add(g.k.view().q.type);
      snap('battle:' + g.k.view().q.type);
      g.answer(round % 2 === 0);
      snap('feedback');
      g.next();
    }
  }
  ['ja2fr', 'fr2ja', 'img2fr', 'aud2ja'].forEach(t =>
    assert.ok(seen.has(t), label + ': 出題形式 ' + t + ' を確認できませんでした')
  );
  snap('result');
  g.click('home');
  g.click('zukan');
  snap('zukan');
  g.click('pick', { id: g.k.vocab[0].id });
  snap('zukan-detail');
  g.click('zback');
  g.type('zq', 'a');
  snap('zukan-search');
  g.type('zq', '');
  g.k.setClock(() => Date.now() + 3 * 86400000);
  g.click('home');
  g.click('review');
  while (g.k.view().mode === 'battle') {
    g.answer(true);
    g.next();
  }
  snap('review-result');
  g.click('home');
  snap('home-after');
}

test('esc: 特殊文字(& < > " \' `)をすべて実体参照にし、null/数値でも落ちない', () => {
  const { esc } = boot().k;
  assert.equal(
    esc('<script>"a" & \'b\' `c`</script>'),
    '&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39; &#96;c&#96;&lt;/script&gt;'
  );
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
  assert.equal(esc('&amp;'), '&amp;amp;', '二重エスケープされる=入力は常に生の文字列として扱う');
  assert.equal(esc('日本語 café œuf'), '日本語 café œuf', '通常の文字は変えない');
});

test('HTML安全: 引用符を含む単語データ(検証を通る形)でも、全画面でタグ・属性が壊れない', () => {
  const g = boot({ extraCode: SPEECH + hostileWords(QUOTE) });
  assert.equal(
    g.k.data.excluded,
    0,
    'この payload は検証を通る(< > & は検証で拒否されるため含めていない)'
  );
  tourAll(g, 'quote');
  assert.equal(g.sb.__errors.length, 0, 'コンソールエラーなし');
});
test('HTML安全: 引用符を含む値は、見える文字としては正しく保たれる(エスケープされて表示される)', () => {
  const g = boot({ extraCode: SPEECH + hostileWords(QUOTE) });
  const w = g.k.vocab[0];
  g.click('zukan');
  assert.ok(g.el('zlist').innerHTML.includes('data-id="' + w.id + '"'), 'data-id は元のIDのまま');
  g.click('pick', { id: w.id });
  assert.ok(g.html().includes(g.k.esc(w.ja)), '日本語訳が(エスケープされて)表示される');
  assert.ok(g.html().includes(g.k.esc(w.ex)), '例文');
  assert.ok(!g.html().includes('" onmouseover="'), '属性を閉じる文字列が生のまま出ていない');
  assert.ok(g.html().includes('&quot; onmouseover=&quot;'));
});
test('HTML安全(二重防御): < > & を含むデータが検証をすり抜けて実行時に入っても、HTMLとして解釈されない', () => {
  const g = boot({ extraCode: SPEECH });
  g.k.vocab.forEach(w => {
    ['ja', 'kana', 'ex', 'exJa', 'emoji', 'fr', 'note', 'cat', 'level', 'ipa'].forEach(f => {
      w[f] = EVIL;
    });
    w.alt = [EVIL];
    w.syn = [EVIL];
    w.forms = { plural: EVIL, [EVIL]: EVIL };
  });
  g.click('zukan');
  lint(g.html(), 'evil zukan');
  g.click('pick', { id: g.k.vocab[0].id });
  lint(g.html(), 'evil detail');
  assert.ok(
    g.html().includes('&lt;img src=x onerror=alert(1)&gt;'),
    '危険な文字列は文字として表示される'
  );
  g.click('home');
  g.click('learn');
  lint(g.html(), 'evil learn');
  g.click('battle');
  while (g.k.view().mode === 'battle') {
    lint(g.html(), 'evil battle');
    g.answer(true);
    lint(g.html(), 'evil feedback');
    g.next();
  }
  lint(g.html(), 'evil result');
});
test('HTML安全(二重防御): IDに特殊文字が入っても data-id 属性を壊さない', () => {
  const g = boot({ extraCode: SPEECH });
  g.k.vocab.forEach((w, i) => {
    w.id = 'w' + i + EVIL;
  });
  g.click('zukan');
  lint(g.html(), 'evil id zukan');
  assert.ok(g.el('zlist').innerHTML.includes('data-id="w0&quot;&gt;&lt;img'));
  g.click('home');
  g.click('learn');
  lint(g.html(), 'evil id learn');
});
test('HTML安全: 検索欄の入力(特殊文字)が value 属性を壊さず、再描画しても保持される', () => {
  // 絞り込みで全体が再描画される
  const g = boot();
  g.click('zukan');
  g.type('zq', EVIL);
  g.select('cat', '動物');
  lint(g.html(), 'search');
  assert.ok(g.html().includes('value="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(g.k.zukan().list.length, 0);
  assert.match(g.el('zlist').innerHTML, /該当する単語はありません/);
});
test("HTML安全: 読み上げには、エスケープ前の生の文字列(s'il vous plaît)が渡される", () => {
  const g = boot({ extraCode: SPEECH });
  g.click('speak', { id: 'w05' });
  assert.equal(g.sb.__spoken[g.sb.__spoken.length - 1], "s'il vous plaît");
  g.click('speak', { id: 'w17' });
  assert.equal(g.sb.__spoken[g.sb.__spoken.length - 1], "l'eau");
  g.click('zukan');
  g.click('pick', { id: 'w05' });
  assert.match(g.html(), /s&#39;il vous plaît/, '画面上はエスケープされている');
});
test('HTML安全: 通常の単語データ(本番の words.js)の全画面でもタグ・属性が正しい', () => {
  const g = boot({ wordsCode: read('data/words.js'), extraCode: SPEECH });
  tourAll(g, 'real');
  assert.equal(g.sb.__errors.length, 0);
});
test('学習記録: 特殊文字を含むデータで遊んでも、保存される記録の形式・内容は従来どおり', () => {
  const g = boot({ extraCode: SPEECH + hostileWords(QUOTE) });
  g.learn(3);
  g.click('battle');
  while (g.k.view().mode === 'battle') {
    g.answer(true);
    g.next();
  }
  const saved = JSON.parse(g.store['kotoba-monster-v1']);
  assert.equal(saved.v, 4);
  assert.ok(saved.xp > 0);
  assert.ok(
    Object.keys(saved.w).every(id => /^w\d\d$/.test(id)),
    '記録のキーはIDのまま(エスケープされていない)'
  );
  assert.ok(
    !JSON.stringify(saved).includes('&quot;') && !JSON.stringify(saved).includes('&#39;'),
    '保存データにHTML実体参照が混ざらない'
  );
  const g2 = boot({ storage: g.store, extraCode: SPEECH + hostileWords(QUOTE) });
  assert.equal(g2.k.state().xp, saved.xp, '再読み込みで復元');
});
