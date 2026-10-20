/* keymap.js — キーボードショートカットの割り当て(画面から独立した、純粋なロジック)
   ブラウザでは window.KeyMap、Node では require('./keymap.js') で使えます。DOM・localStorage
   には触りません(保存は app.js が行う)。

   ■ 操作(ACTIONS)と初期設定
     select1〜select4 = 1〜4 / next = N / speak = R / pause = P / back = Esc
   ■ 割り当てられるキー: 英字(a〜z)・数字(0〜9)・Esc だけ。
     Tab / Enter / Space は、ボタンを押す・フォーカスを動かす標準の操作に使うため割り当てられない。
     F1〜F12・矢印・Backspace・Delete・Home/End・PageUp/PageDown などは、ブラウザや OS
     の操作(再読み込み・スクロール・戻る)と重なるため割り当てられない。
     Ctrl / Command(Meta) / Alt / Shift を押しながらのキーは、
     ショートカットとして扱わない(ブラウザの操作を妨げない)。
   ■ 割り当ては、すべての操作で重複しない(同じキーを2つの操作に割り当てられない)。
   ■ 保存形式: { v: 1, keys: { select1: '1', ..., back: 'Escape' } }。キーは 'a'〜'z' / '0'〜'9' /
   'Escape'(小文字)。 */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.KeyMap = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 学習記録(kotoba-monster-v1)・テーマ(kotoba-monster-theme)とは別のキー
  const STORAGE_KEY = 'kotoba-monster-keymap';
  const VERSION = 1;
  const ACTIONS = [
    { id: 'select1', label: '選択肢 1 を選ぶ', short: '選択肢1', def: '1' },
    { id: 'select2', label: '選択肢 2 を選ぶ', short: '選択肢2', def: '2' },
    { id: 'select3', label: '選択肢 3 を選ぶ', short: '選択肢3', def: '3' },
    { id: 'select4', label: '選択肢 4 を選ぶ', short: '選択肢4', def: '4' },
    { id: 'next', label: '回答後に次へ進む', short: 'つぎへ', def: 'n' },
    { id: 'speak', label: '発音を再生する', short: '発音', def: 'r' },
    { id: 'pause', label: 'BOTの一時停止・再開', short: 'BOT一時停止', def: 'p' },
    { id: 'back', label: '戻る(出題中は中断の確認)', short: 'もどる', def: 'Escape' }
  ];
  const IDS = ACTIONS.map(a => a.id);
  const DEFAULTS = Object.freeze(
    IDS.reduce((o, id) => {
      o[id] = ACTIONS.find(a => a.id === id).def;
      return o;
    }, {})
  );
  const labelOf = id => {
    const a = ACTIONS.find(x => x.id === id);
    return a ? a.label : id;
  };

  // 押されたキーを正規化する。割り当てられる形('a'〜'z' / '0'〜'9' / 'Escape')なら、その文字列。
  // それ以外は null。
  // 数字は e.code(Digit1 / Numpad1)を優先する(AZERTY など、数字の段が記号になる配列でも 1〜4
  // を使えるように)
  function keyOf(e) {
    if (!e) return null;
    const code = typeof e.code === 'string' ? e.code : '',
      key = typeof e.key === 'string' ? e.key : '';
    let m = /^Digit([0-9])$/.exec(code);
    if (m) return m[1];
    m = /^Numpad([0-9])$/.exec(code);
    // NumLock が切れているテンキーは、数字ではなく矢印などとして届くので除く
    if (m && /^[0-9]$/.test(key)) return m[1];
    if (/^[0-9]$/.test(key)) return key;
    if (/^[a-zA-Z]$/.test(key)) return key.toLowerCase();
    if (key === 'Escape' || key === 'Esc') return 'Escape';
    return null;
  }
  const isAssignable = k => typeof k === 'string' && (/^[a-z0-9]$/.test(k) || k === 'Escape');
  // 画面の表示
  const show = k => (k === 'Escape' ? 'Esc' : /^[a-z]$/.test(k) ? k.toUpperCase() : String(k));
  // aria-keyshortcuts の値
  const aria = k => (k === 'Escape' ? 'Escape' : /^[a-z]$/.test(k) ? k.toUpperCase() : String(k));

  // 押されたキーが、割り当てできない理由(できるなら null)。名前のあるキーだけ、利用者に理由を示す
  function whyNot(e) {
    if (!e) return 'キーを読み取れませんでした';
    const key = typeof e.key === 'string' ? e.key : '';
    if (e.ctrlKey || e.metaKey || e.altKey)
      return 'Ctrl・Command・Alt を使う組み合わせは登録できません(ブラウザなどの操作と重なるため)';
    if (e.shiftKey && keyOf(e) !== null) return 'Shift を押しながらのキーは登録できません';
    if (key === 'Tab') return 'Tab はフォーカスを動かす標準の操作のため、登録できません';
    if (key === 'Enter' || key === ' ' || key === 'Spacebar')
      return 'Enter と Space はボタンを押す標準の操作のため、登録できません';
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key))
      return key + ' はブラウザの操作に使われるため、登録できません';
    if (keyOf(e) === null) return '登録できるのは、英字・数字・Esc のキーだけです';
    return null;
  }
  // 修飾キーだけが押された(これから組み合わせを押す途中かもしれない)・変換中などは、何もしない
  const IGNORED_KEYS = [
    'Shift',
    'Control',
    'Alt',
    'Meta',
    'AltGraph',
    'CapsLock',
    'NumLock',
    'ScrollLock',
    'Fn',
    'FnLock',
    'OS',
    'Dead',
    'Process',
    'Unidentified',
    'Hyper',
    'Super',
    'Tab'
  ];
  const isNoise = e => !e || IGNORED_KEYS.indexOf(e.key) >= 0;

  // map の action を key に変えられるか。{ ok, reason, map }。ok のときだけ、新しい map(元の map
  // は変更しない)
  function assign(map, action, key) {
    if (IDS.indexOf(action) < 0) return { ok: false, reason: '不明な操作です' };
    if (!isAssignable(key))
      return { ok: false, reason: '登録できるのは、英字・数字・Esc のキーだけです' };
    const clash = IDS.find(id => id !== action && map[id] === key);
    if (clash)
      return {
        ok: false,
        reason:
          'キー「' +
          show(key) +
          '」は「' +
          labelOf(clash) +
          '」で使っています。別のキーを押してください(重複した割り当てはできません)',
        clash
      };
    const next = Object.assign({}, map);
    next[action] = key;
    return { ok: true, map: next };
  }
  // map 全体が有効か(すべての操作に、割り当て可能なキーが1つずつあり、重複がない)
  function isValid(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
    const seen = {};
    return IDS.every(id => {
      const k = map[id];
      if (!isAssignable(k) || seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }
  // 保存された文字列(JSON)から map を作る。壊れている・不完全・重複がある場合は、
  // 初期設定にもどす(一部だけ採用すると重複しうるため)
  function parse(text) {
    if (typeof text !== 'string' || !text) return Object.assign({}, DEFAULTS);
    let o;
    try {
      o = JSON.parse(text);
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
    const keys = o && typeof o === 'object' && o.v === VERSION ? o.keys : null;
    return isValid(keys)
      ? IDS.reduce((m, id) => {
          m[id] = keys[id];
          return m;
        }, {})
      : Object.assign({}, DEFAULTS);
  }
  const serialize = map =>
    JSON.stringify({
      v: VERSION,
      keys: IDS.reduce((m, id) => {
        m[id] = map[id];
        return m;
      }, {})
    });
  const actionFor = (map, key) => (key ? IDS.find(id => map[id] === key) || null : null);
  const isDefault = map => IDS.every(id => map[id] === DEFAULTS[id]);

  // 文字入力中の場所か(入力欄・セレクトボックス・テキストエリア・contenteditable)。
  // ここではショートカットを発動しない
  function isTypingTarget(t) {
    if (!t) return false;
    const tag = String(t.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
    if (t.isContentEditable === true) return true;
    try {
      if (
        typeof t.closest === 'function' &&
        t.closest(
          '[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]'
        )
      )
        return true;
    } catch (e) {
      /* 何もしない */
    }
    return false;
  }
  // 変換中(IME)か
  const isComposing = e => !!(e && (e.isComposing || e.keyCode === 229));
  // Ctrl / Command / Alt / Shift のどれかが押されているか(押されていたらショートカットにしない)
  const hasModifier = e => !!(e && (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey));

  return {
    STORAGE_KEY,
    VERSION,
    ACTIONS,
    IDS,
    DEFAULTS,
    labelOf,
    keyOf,
    isAssignable,
    show,
    aria,
    whyNot,
    isNoise,
    assign,
    isValid,
    parse,
    serialize,
    actionFor,
    isDefault,
    isTypingTarget,
    isComposing,
    hasModifier
  };
});
