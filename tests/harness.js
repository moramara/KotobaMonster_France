'use strict';
// 本物の data/words.js / src/lib/wordlib.js / src/app.js を、
// 最小限のDOMスタブ上で実行するテスト用ハーネス(外部ライブラリ不要)。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/**
 * css/style.css を「検査しやすい圧縮形」にして返す。
 * CSS ファイルは人が読みやすい整形(1行に1宣言・コメント入り)で書き、
 テストは圧縮形に対する正規表現で確認する。
 * 圧縮の内容: コメントの除去 / 空白の圧縮 / 記号の前後の空白の除去 / 最後の宣言の ; の除去 /
 *            数値の先頭の 0 の除去(0.5 → .5)。
 */
function readCss() {
  return read('css/style.css')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>:])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/(^|[^0-9a-zA-Z.])0\.(\d)/g, '$1.$2')
    .trim();
}

function boot(o) {
  o = o || {};
  const store = Object.assign({}, o.storage || {}),
    confirms = [];
  const els = {},
    handlers = {};
  const getEl = id =>
    els[id] ||
    (els[id] = {
      id,
      innerHTML: '',
      textContent: '',
      classList: { add() {}, remove() {} },
      dataset: {},
      attrs: {},
      setAttribute(k, v) {
        this.attrs[k] = String(v);
      },
      getAttribute(k) {
        return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
      },
      click() {},
      scrollIntoView() {}
    });
  // #app の innerHTML を設定したとき、図鑑の #zlist 部分も同期する(refreshZ が更新する要素のスタブ)
  // キーボード検証用の最小限の DOM: 現在の #app の <button>/<select> を、dataset・disabled・focus()
  // ・click() を持つ要素として返す。
  // 全画面の再描画(innerHTML の代入)で、フォーカス中の要素は失われる(本物の DOM と同じ)。
  // 属性の追加(setAttribute)は、同じ描画の間だけ保たれる
  let active = null,
    parsed = null;
  const unesc = x =>
    String(x)
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  function parseControls(html) {
    const out = [],
      re = /<(button|select)\b([^>]*)>/g;
    let m;
    while ((m = re.exec(html))) {
      const attrs = {};
      let a;
      const ar = /([a-zA-Z][a-zA-Z0-9-]*)(?:=\"([^\"]*)\")?/g;
      while ((a = ar.exec(m[2]))) attrs[a[1]] = a[2] === undefined ? '' : unesc(a[2]);
      const close = html.indexOf('</' + m[1] + '>', re.lastIndex),
        el = {
          tagName: m[1].toUpperCase(),
          attrs,
          dataset: {},
          text: close < 0 ? '' : html.slice(re.lastIndex, close).replace(/<[^>]*>/g, ''),
          get className() {
            return attrs.class || '';
          },
          get disabled() {
            return 'disabled' in attrs;
          },
          get id() {
            return attrs.id || '';
          },
          getAttribute(k) {
            return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
          },
          setAttribute(k, v) {
            attrs[k] = String(v);
            if (k.indexOf('data-') === 0)
              el.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
          },
          focus() {
            active = el;
          },
          click() {
            fire('click', { target: el });
          },
          closest(sel) {
            return /data-act/.test(String(sel)) && 'data-act' in attrs ? el : null;
          }
        };
      Object.keys(attrs).forEach(k => {
        if (k.indexOf('data-') === 0)
          el.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attrs[k];
      });
      out.push(el);
    }
    return out;
  }
  {
    const app = getEl('app');
    let h = '';
    app.querySelectorAll = () => parsed || (parsed = parseControls(h));
    Object.defineProperty(app, 'innerHTML', {
      get: () => h,
      set: v => {
        h = v;
        parsed = null;
        active = null;
        const m = v.match(
          /<div id="zlist">([\s\S]*)<\/div>\s*<button class="btn ghost" data-act="home">/
        );
        getEl('zlist').innerHTML = m ? m[1] : '';
      }
    });
  }
  // テーマ検証用: <html>(documentElement)の属性と、OS の配色設定(matchMedia)・storage
  // イベントの偽物。o.prefersDark で OS の初期状態を指定(既定はライト)
  const rootAttrs = {},
    mqListeners = [],
    winHandlers = {};
  let osDark = !!o.prefersDark;
  const documentElement = {
    attrs: rootAttrs,
    setAttribute(k, v) {
      rootAttrs[k] = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(rootAttrs, k) ? rootAttrs[k] : null;
    },
    removeAttribute(k) {
      delete rootAttrs[k];
    }
  };
  const matchMedia = q => ({
    media: q,
    get matches() {
      return /prefers-color-scheme:\s*dark/.test(q) ? osDark : false;
    },
    addEventListener(t, f) {
      if (t === 'change') mqListeners.push(f);
    },
    removeEventListener() {}
  });
  const sb = {
    console:
      o.silent === false
        ? console
        : {
            log() {},
            warn() {},
            error() {
              sb.__errors.push([].slice.call(arguments).join(' '));
            }
          },
    __errors: [],
    document: {
      documentElement,
      getElementById: getEl,
      get activeElement() {
        return active;
      },
      addEventListener: (t, f) => {
        (handlers[t] = handlers[t] || []).push(f);
      },
      createElement: () => ({ click() {}, remove() {} }),
      body: { appendChild() {} }
    },
    localStorage: {
      getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => {
        if (o.storageFails) throw new Error('quota');
        store[k] = String(v);
      },
      removeItem: k => {
        delete store[k];
      }
    },
    confirm: msg => {
      confirms.push(String(msg));
      return o.confirm !== false;
    },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON
  };
  sb.window = sb;
  sb.window.scrollTo = () => {};
  sb.matchMedia = matchMedia;
  sb.addEventListener = (t, f) => {
    (winHandlers[t] = winHandlers[t] || []).push(f);
  };
  vm.createContext(sb);
  vm.runInContext(o.wordsCode || read('tests/fixtures/words30.js'), sb, {
    filename: o.wordsCode ? 'words.js(custom)' : 'fixtures/words30.js'
  });
  if (o.extraCode) vm.runInContext(o.extraCode, sb, { filename: 'extra.js' });
  vm.runInContext(read('src/lib/wordlib.js'), sb, { filename: 'wordlib.js' });
  if (o.keymap !== false) vm.runInContext(read('src/lib/keymap.js'), sb, { filename: 'keymap.js' });
  vm.runInContext(read('src/lib/growth.js'), sb, { filename: 'growth.js' });
  vm.runInContext(read('src/lib/speech.js'), sb, { filename: 'speech.js' });
  vm.runInContext(o.appCode || read('src/app.js'), sb, { filename: 'app.js' });
  const k = sb.__kotoba;
  const fire = (type, e) => (handlers[type] || []).forEach(f => f(e));
  const api = {
    k,
    store,
    sb,
    root: documentElement,
    // <html> の data-theme(未選択なら null)
    theme: () => documentElement.getAttribute('data-theme'),
    // OS の配色設定を変える(変更イベントも通知)
    setOS(dark) {
      osDark = !!dark;
      mqListeners.forEach(f => f({ matches: osDark }));
    },
    // 他のタブで localStorage が変わったことの通知
    fireStorage(key) {
      (winHandlers.storage || []).forEach(f => f({ key }));
    },
    html: () => getEl('app').innerHTML,
    el: getEl,
    click(act, data) {
      const el = {
        dataset: Object.assign({ act }, data || {}),
        disabled: false,
        closest() {
          return this;
        }
      };
      fire('click', { target: el });
    },
    type(id, value) {
      getEl(id).value = value;
      fire('input', { target: { id, value } });
    },
    select(key, value) {
      fire('change', { target: { dataset: { sel: key }, value, id: '' } });
    },
    // 現在の問題に「正解 / 不正解」で答える
    answer(correct) {
      const i = k.view().q.opts.findIndex(x => x.ok === correct);
      api.click('ans', { i: String(i) });
    },
    next() {
      api.click('next');
    },
    hp() {
      const m = api.html().match(/class="bar hp"[^>]*><i style="width:([\d.]+)%/),
        n = api.html().match(/てきHP (\d+)\/(\d+)/);
      return {
        pct: m ? Number(m[1]) : null,
        left: n ? Number(n[1]) : null,
        base: n ? Number(n[2]) : null
      };
    },
    learn(n) {
      api.click('learn');
      for (let i = 0; i < n - 1; i++) api.click('learnNext');
    },
    // ---- キーボード ----
    // キーを押す。e には key / code / ctrlKey / metaKey / altKey / shiftKey / isComposing /
    // keyCode / repeat / target を指定できる。ブラウザの標準動作を止めたか(preventDefault)を返す
    key(k, e) {
      const ev = Object.assign(
        { key: k, target: api.activeEl() || { tagName: 'BODY' }, defaultPrevented: false },
        e || {}
      );
      ev.preventDefault = () => {
        ev.defaultPrevented = true;
        ev.prevented = true;
      };
      fire('keydown', ev);
      return !!ev.prevented;
    },
    buttons() {
      return getEl('app').querySelectorAll('button, select');
    },
    activeEl() {
      return active;
    },
    focusAct(act, data) {
      const b = api
        .buttons()
        .find(
          x =>
            x.dataset.act === act &&
            Object.keys(data || {}).every(d => x.dataset[d] === String(data[d]))
        );
      if (!b) throw new Error('ボタンが見つかりません: ' + act);
      b.focus();
      return b;
    },
    focused() {
      return active
        ? {
            act: active.dataset.act || null,
            data: Object.assign({}, active.dataset),
            disabled: active.disabled,
            text: active.text
          }
        : null;
    },
    confirms,
    hint: () => ({ text: getEl('kbhint').textContent, hidden: getEl('kbhint').hidden })
  };
  return api;
}
// n語の合成データ(検証を通る形)
function synthWords(n) {
  const ab = 'abcdefghijklmnopqrstuvwxyz',
    cats = ['動物', '食べ物', '自然'];
  const code = [
    'const W = (id, cat, art, g, fr, ja, emoji, kana, ex, exJa, extra) => Object.assign({ id, cat, art, g, fr, ja, emoji, kana, ex, exJa }, extra || {});',
    'const CATEGORIES = ' + JSON.stringify(cats) + ';',
    'const WORDS = [];'
  ];
  const rows = [];
  for (let i = 1; i <= n; i++) {
    // 10進の各桁を英字に置換(一意)
    const fr = 'mot' + String(i).replace(/[0-9]/g, d => ab[Number(d)]) + 'x';
    rows.push({
      id: 'z' + String(i).padStart(5, '0'),
      cat: cats[i % 3],
      art: i % 2 ? 'le' : 'la',
      g: i % 2 ? 'm' : 'f',
      fr,
      ja: '語' + i + '番',
      emoji: '🔷',
      kana: 'モ',
      ex: 'Voici ' + fr + '.',
      exJa: 'これは' + i + '番。',
      level: ['A1', 'A2', 'B1'][i % 3],
      pos: 'noun'
    });
  }
  code.push('WORDS.push(...' + JSON.stringify(rows) + ');');
  return code.join('\n');
}
// 固定フィクスチャ(既存30語)の WORDS / CATEGORIES
function fixtureWords() {
  const ctx = vm.createContext({});
  vm.runInContext(read('tests/fixtures/words30.js'), ctx);
  return { words: vm.runInContext('WORDS', ctx), categories: vm.runInContext('CATEGORIES', ctx) };
}
module.exports = {
  readCss,
  boot,
  synthWords,
  fixtureWords,
  read,
  ROOT
};
