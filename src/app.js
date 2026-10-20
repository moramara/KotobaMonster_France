/* ==============================================================================
 * ことばモンスター ― アプリ本体(画面・操作・学習記録)
 *
 * 読み込み順(index.html):
 *   data/words.js → src/lib/wordlib.js → src/lib/keymap.js → src/lib/growth.js → src/lib/speech.js
 *   → data/phrases.js → src/lib/phraselib.js → src/app.js(このファイル)
 *
 * ■ 読み方のヒント
 *   ・状態は2つ。state = 学習記録(localStorage に保存する)/ view = いまの画面(保存しない)。
 *   ・画面を出す流れ: go(mode) → render() → screenHtml(mode) → v〜() が HTML 文字列を返す。
 *   ・ボタンは data-act 属性を持ち、クリックでも、キーボードのショートカットでも、handleAct()
 が処理する。
 *   ・学習記録を書き換えるのは、バトル・復習の回答(answer)、構文の回答(answerPhrase)、
 *     学習画面の通過(markIntro)、記録の読み込み・リセットだけ。
 BOT・キー設定・テーマは記録に触れない。
 *   ・名前の付け方: v〜 = 画面の HTML / 〜Html = HTML の部品 / p〜 = 構文トレーニング /
 *                   bot〜 = BOTおまかせ復習 / kb〜・key〜 = キーボード / km〜 = キー設定の保存
 *
 * ■ なぜ1ファイルか
 *   画面・状態・操作が同じ状態(state / view)を共有しているため、1つの即時関数にまとめている。
 *   ロジックのうち画面と無関係なもの(検証・問題生成・採点・キー割り当て・進化段階と称号・読み上げ)は
 *   src/lib/ に分けてあり、単体でテストできる。state / view / DOM に触る処理(BOT・キーボード・
 *   保存と移行・各画面)は、共有する状態を直接読み書きするため、ここに残している。
 *
 * ■ 目次(各章は、下の見出しから探せる)
 *    1. 基本                          10. 画面の描画 ― 単語
 *    2. 表示テーマ                    11. 構文トレーニング
 *    3. 教材データの読み込みと検証    12. 描画の入口(screenHtml / render)
 *    4. 育成の定数と、全体の状態      13. BOTおまかせ復習
 *    5. 学習記録の保存と読み込み      14. ボタン操作の入口(handleAct)
 *    6. 単語の状態と復習リスト        15. 学習記録の書き出し・読み込み
 *    7. 音声とお知らせ                16. キーボードショートカット
 *    8. 出題(問題の作り方)           17. テスト用の公開と起動
 *    9. バトル・復習の進行
 *
 * ■ 書式
 *   Prettier(printWidth 100・シングルクォート・末尾カンマなし)で整形している。
 *   HTML のテンプレート文字列だけは、出力の空白を変えないため、長い行のままにしている。
 * ============================================================================== */
(function () {
  'use strict';
  // 学習記録の localStorage キー(形式 v4)。テーマ・キー設定は、別のキーに保存する
  /* ==========================================================================
   * 1. 基本
   * ========================================================================== */
  const KEY = 'kotoba-monster-v1';
  /* ==========================================================================
   * 2. 表示テーマ(ライト / ダーク)
   * ・保存値は 'light' か 'dark'(キー: THEME_KEY)。学習記録(KEY)とは別のキーなので、
   *   記録のリセット・読み込み・書き出しの影響を受けない。
   * ・未保存(または不正な値)のときは OS の設定(prefers-color-scheme)に従う。
   *   利用者が選んだ値は、OS の設定より優先する。
   * ・実際の配色は css/style.css の CSS 変数で決まる。ここでは <html> の data-theme
   を付け外しするだけ。
   * ・画面の再描画(#app の書き換え)ではテーマは変わらない。
   * ・index.html の先読みスクリプトも同じ規則で、描画前に data-theme を付ける(ちらつき防止)。
   * ========================================================================== */
  const THEME_KEY = 'kotoba-monster-theme';
  // style.css の --bg と同じ値(アドレスバーの色)。tests/theme.test.js で一致を確認
  const THEME_COLOR = { light: '#e8f0ff', dark: '#0f1426' };
  // このページでの最新の選択('light' | 'dark' | 'auto')。保存・読み出しに失敗する環境(localStorage
  // が使えない・満杯)でも、ページを開いている間は選択を保つ。他のタブの変更(storage イベント)
  // では破棄して保存値を読み直す
  let themeMem = null;
  // 選ばれているテーマ 'light' | 'dark'。未選択・不正な値は null。読むだけで、何も書き換えない
  function savedTheme() {
    if (themeMem !== null) return themeMem === 'auto' ? null : themeMem;
    let v = null;
    try {
      v = localStorage.getItem(THEME_KEY);
    } catch (e) {
      v = null;
    }
    return v === 'light' || v === 'dark' ? v : null;
  }
  // OS の配色設定がダークか(判定できない環境では false)
  const osDark = () => {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) {
      return false;
    }
  };
  // 実際に表示されているテーマ
  const themeNow = () => savedTheme() || (osDark() ? 'dark' : 'light');
  // html の data-theme に反映(未選択なら属性を外して、CSS に OS の設定を任せる)
  // とアドレスバーの色の更新
  function applyTheme() {
    const t = savedTheme(),
      de = document.documentElement;
    if (de && de.setAttribute) {
      if (t) de.setAttribute('data-theme', t);
      else de.removeAttribute('data-theme');
    }
    const m = document.getElementById('tc');
    if (m && m.setAttribute) m.setAttribute('content', THEME_COLOR[themeNow()]);
  }
  // v: 'light' | 'dark' | 'auto'(選択を消して OS に従う)。触るのは THEME_KEY だけ
  function setTheme(v) {
    if (v !== 'light' && v !== 'dark' && v !== 'auto') return;
    themeMem = v;
    try {
      if (v === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, v);
    } catch (e) {
      /* 保存できなくても、themeMem で保つ */
    }
    applyTheme();
  }
  // 起動時に1回だけ: 不正な保存値は、このキーだけを消して安全な初期状態(OSに従う)に戻す
  (function cleanTheme() {
    let v = null;
    try {
      v = localStorage.getItem(THEME_KEY);
    } catch (e) {
      return;
    }
    if (v !== null && v !== 'light' && v !== 'dark') {
      try {
        localStorage.removeItem(THEME_KEY);
      } catch (e) {
        /* 何もしない */
      }
    }
  })();
  // OS の設定の変化・他のタブでの変更。ホームだけ表示(現在のテーマ名)を更新する
  function onThemeEnv() {
    applyTheme();
    if (view.mode === 'home') render();
  }
  try {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onThemeEnv);
      else if (mq.addListener) mq.addListener(onThemeEnv);
    }
  } catch (e) {
    /* 何もしない */
  }
  if (typeof window.addEventListener === 'function')
    window.addEventListener('storage', e => {
      if (e && e.key === THEME_KEY) {
        themeMem = null;
        onThemeEnv();
      }
    });
  // ホームの切り替え。選択中は色だけでなく「✓」と aria-pressed でも示す
  function themeHtml() {
    const sel = savedTheme() || 'auto',
      now = themeNow();
    const b = (v, label) =>
      `<button class="chip ${sel === v ? 'on' : ''}" data-act="theme" data-v="${v}" aria-pressed="${sel === v ? 'true' : 'false'}">${sel === v ? '✓ ' : ''}${label}</button>`;
    return `<fieldset class="theme"><legend class="small">表示テーマ(現在: ${now === 'dark' ? 'ダーク' : 'ライト'}${sel === 'auto' ? '・OSの設定に従っています' : ''})</legend><div class="chips">${b('auto', '🖥️ 自動')}${b('light', '☀️ ライト')}${b('dark', '🌙 ダーク')}</div></fieldset>`;
  }
  /* ==========================================================================
   * 3. 教材データの読み込みと検証
   * ・単語(data/words.js)と構文(data/phrases.js)を、src/lib のロジックで検証・正規化する。
   * ・エラーのある単語・構文は除外して、起動は止めない(理由はコンソールに出す)。
   * ・構文のファイル(phrases.js / phraselib.js)が無い環境では、構文機能を出さない(PL が null
   になる)。
   * ========================================================================== */
  const DATA = WordLib.prepare(WORDS, {
    categories: typeof CATEGORIES !== 'undefined' ? CATEGORIES : null
  });
  // 検証済みの単語の一覧(エラーのある単語は除外済み)
  const VOCAB = DATA.words;
  // 単語ID → 単語 の索引
  const VMAP = new Map(VOCAB.map(w => [w.id, w]));
  if (DATA.errors.length) {
    console.error('単語データにエラーがあります(該当語は除外):');
    DATA.errors.forEach(x => console.error('  ' + WordLib.formatIssue(x)));
  }
  // 図鑑の絞り込み候補(カテゴリ・品詞・レベル)
  const FACETS = WordLib.facets(VOCAB, typeof CATEGORIES !== 'undefined' ? CATEGORIES : null);
  // 品詞の日本語名(noun → 名詞 など)
  const POS_JA = WordLib.POS;
  // ---- 構文データ(data/phrases.js)----
  const PL = typeof PhraseLib !== 'undefined' && typeof PHRASES !== 'undefined' ? PhraseLib : null;
  // 構文の「場面」の名前の一覧(あいさつ・買い物 など)
  const SCENES = typeof PHRASE_SCENES !== 'undefined' ? PHRASE_SCENES : {};
  // 検証済みの構文データ(構文機能が無い環境では空)
  const PDATA = PL
    ? PL.prepare(PHRASES, {
        wordIds: (Array.isArray(WORDS) ? WORDS : []).map(w => w && w.id),
        scenes: SCENES
      })
    : { phrases: [], errors: [], warnings: [], excluded: 0 };
  // 検証済みの構文の一覧
  const PHRASE_LIST = PDATA.phrases;
  // 構文ID → 構文 の索引
  const PMAP = new Map(PHRASE_LIST.map(p => [p.id, p]));
  if (PDATA.errors.length) {
    console.error('構文データにエラーがあります(該当の構文は除外):');
    PDATA.errors.forEach(x => console.error('  ' + PL.formatIssue(x)));
  }
  /* ==========================================================================
   * 4. 育成の定数と、アプリ全体の状態
   * モンスターの進化段階・称号・敵の絵文字・間隔(INT)と、画面を描く場所・状態変数(state / view)。
   * ========================================================================== */
  // 進化段階(STAGES)と称号(TITLES)は src/lib/growth.js。単語を増やしたときの編集もそこで行う
  const GR = Growth;
  const ZPAGE = 30; // 図鑑の1ページの表示数
  // バトルに出てくる敵の絵文字(毎回ランダムに選ぶ)
  const ENEMIES = ['👾', '👻', '🧟', '🕷️', '🦠'];
  // 方向ごとの出題形式。p = 日本語→フランス語系、r = フランス語→日本語系
  const DIRT = { p: ['ja2fr', 'img2fr'], r: ['fr2ja', 'aud2ja'] };
  // 出題形式 → 方向(p / r)
  const DIR_OF = { ja2fr: 'p', img2fr: 'p', fr2ja: 'r', aud2ja: 'r' };
  // 画面を描く場所(<main id="app">)。render() が中身を作り直す
  const $app = document.getElementById('app');
  // お知らせ(トースト)の表示場所
  const $toast = document.getElementById('toast');
  // 記録を保存できない環境(localStorage が使えない)のとき true。ページを閉じると記録が消えるので、
  // ホームで知らせる
  let memOnly = false;
  let state;
  // 【画面の状態】いまの画面(mode)と、その画面の途中経過。render() は view を見て描く。
  // 画面を移るときは go() で作り直す
  let view = { mode: 'home' };
  // 出題形式を順番に選ぶためのカウンタ(初期値はランダム)
  let tc = Math.floor(Math.random() * 4);

  /* ==========================================================================
   * 5. 学習記録の保存と読み込み(形式 v4)
   * state = { v: 4, xp, best, w: {単語の記録}, ph: {構文の記録}, pbest, pd: { d: 日付, xp:
   その日に構文で得た経験値 } }
   *   xp = 経験値 / best = 習得済みになった最大の単語数(進化・称号の基準) / pbest =
   習得した構文の最大数
   * ・単語の記録 w[id] = { intro: 0|1, d: { p: 方向データ, r: 方向データ }, t: 形式別の履歴 }
   *     p = 日本語→フランス語(絵→仏を含む) / r = フランス語→日本語(音声→意味を含む)
   *     方向データ = { lv: 習熟段階0〜4, n: 回答数, ok / ng: 正解数 / 誤答数, st: 連続正解,
   *                   last: 直近の結果(1 正解 / 0 誤答 / null), due: 次回の復習時刻(ms) }
   *     t = 出題形式(ja2fr / img2fr / fr2ja / aud2ja)ごとの { n, ok, ng, last }。
   *         記録のみで、習熟の判定は方向データで行う。
   * ・構文の記録 ph は単語の記録とは完全に別(形式は src/lib/phraselib.js の「学習記録」を参照)。
   * ・旧形式(v1 / v2 / v3)は読み込み時に変換し、元の記録は KEY-backup-v<旧バージョン> に残す
   *   (新形式で保存したあとでも、そこから復元できる)。
   * ========================================================================== */
  const MIN = 60000,
    DAY = 86400000,
    INT = [0, 5 * MIN, DAY, 3 * DAY, 7 * DAY];
  // 現在時刻(ms)。テストでは差し替えて、時間の経過を再現する
  let clock = () => Date.now();
  // 0以上の有限な数ならその値、そうでなければ既定値 d(壊れた保存データを安全な値に直す)
  const num = (x, d) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : d);
  // 1方向分の学習データの初期値
  const newDir = () => ({ lv: 0, n: 0, ok: 0, ng: 0, st: 0, last: null, due: 0 });
  // 1方向分の学習データを、安全な値に直す(壊れた値は初期値に)
  function cleanDir(d) {
    const o = newDir();
    if (!d || typeof d !== 'object') return o;
    o.lv = Math.min(4, Math.floor(num(d.lv, 0)));
    o.n = num(d.n, 0);
    o.ok = num(d.ok, 0);
    o.ng = num(d.ng, 0);
    o.st = num(d.st, 0);
    o.last = d.last === 1 ? 1 : d.last === 0 ? 0 : null;
    o.due = num(d.due, 0);
    return o;
  }
  // 出題形式の一覧(日→仏 / 絵→仏 / 仏→日 / 音→日)
  const QTYPES = ['ja2fr', 'img2fr', 'fr2ja', 'aud2ja'];
  // 形式別の正答履歴(記録用)。旧データには存在しないので0から始める(複製しない)
  function cleanTypes(t) {
    const o = {};
    QTYPES.forEach(k => {
      const x = t && typeof t === 'object' && t[k] && typeof t[k] === 'object' ? t[k] : {};
      o[k] = {
        n: num(x.n, 0),
        ok: num(x.ok, 0),
        ng: num(x.ng, 0),
        last: x.last === 1 ? 1 : x.last === 0 ? 0 : null
      };
    });
    return o;
  }
  // 1語分の記録を v4 の形に直す(v1 形式も変換。null なら新しい記録)
  function migrateWord(p) {
    const o = {
      intro: p && p.intro ? 1 : 0,
      d: { p: newDir(), r: newDir() },
      t: cleanTypes(p && p.t)
    };
    if (!p || typeof p !== 'object') return o;
    if (p.d && typeof p.d === 'object') {
      o.d.p = cleanDir(p.d.p);
      o.d.r = cleanDir(p.d.r);
      return o;
    }
    [
      ['p', p.a],
      ['r', p.b]
    ].forEach(([k, c]) => {
      c = Math.min(3, Math.floor(num(c, 0)));
      // v1の習得条件(各方向1回正解)を維持
      if (c >= 1) Object.assign(o.d[k], { lv: 2, n: c, ok: c, st: c, last: 1, due: clock() + DAY });
      else if (num(p.miss, 0) > 0) Object.assign(o.d[k], { n: 1, ng: 1, last: 0 });
    });
    return o;
  }
  // 習得済みか: 学習画面を通過し、両方向とも習熟段階2以上
  const isMastered = p =>
    !!(p && p.intro && p.d.p.lv >= 2 && p.d.r.lv >= 2 && p.d.p.last !== 0 && p.d.r.last !== 0);
  // 保存データ全体を v4 に変換する(旧形式は読み込み時に変換)
  function migrate(d) {
    const s = { v: 4, xp: num(d.xp, 0), best: 0, w: {}, ph: {}, pbest: 0, pd: { d: '', xp: 0 } };
    const src = d.w && typeof d.w === 'object' ? d.w : {};
    Object.keys(src).forEach(id => {
      if (id !== '__proto__') s.w[id] = migrateWord(src[id]);
    });
    s.best = Math.max(Math.floor(num(d.best, 0)), VOCAB.filter(w => isMastered(s.w[w.id])).length);
    // 構文の記録: 欠けていれば空、不正な値は安全な初期値にする。教材に無い構文IDの記録も捨てない(教
    // 材を一時的に外しても履歴が残る)
    s.ph = PL
      ? PL.cleanState(d.ph)
      : d.ph && typeof d.ph === 'object' && !Array.isArray(d.ph)
        ? d.ph
        : {};
    s.pd = PL ? PL.cleanDaily(d.pd) : { d: '', xp: 0 };
    s.pbest = Math.max(
      Math.floor(num(d.pbest, 0)),
      PL ? PL.masteredCount(PHRASE_LIST, s.ph, clock()) : 0
    );
    return s;
  }
  // 新しい(空の)学習記録
  const fresh = () => ({ v: 4, xp: 0, best: 0, w: {}, ph: {}, pbest: 0, pd: { d: '', xp: 0 } });
  // 学習記録を読み込む。壊れたデータは KEY-corrupt に退避して新しい記録で始め、旧形式は
  // KEY-backup-v<旧バージョン> に残して変換する
  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('bad data');
      if (num(d.v, 1) < 4) {
        try {
          localStorage.setItem(KEY + '-backup-v' + num(d.v, 1), raw);
        } catch (e) {
          // バックアップを残せなくても、読み込みは続ける
        }
      }
      return migrate(d);
    } catch (e) {
      if (raw) {
        try {
          localStorage.setItem(KEY + '-corrupt', raw);
        } catch (e2) {
          // 壊れたデータの退避に失敗しても、新しい記録で始める
        }
      } else memOnly = true;
      return fresh();
    }
  }
  // 学習記録を保存する。習得数の最大値(best / pbest)もここで更新。保存できない環境では memOnly を
  // true にして続ける
  function save() {
    try {
      state.best = Math.max(state.best, VOCAB.filter(w => isMastered(state.w[w.id])).length);
      if (PL) state.pbest = Math.max(state.pbest, PL.masteredCount(PHRASE_LIST, state.ph, clock()));
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      memOnly = true;
    }
  }

  /* ==========================================================================
   * 6. 単語の状態と復習リスト(ホーム・図鑑・復習ボタンで共通)
   * 未学習  : 学習画面で「つぎへ」を押していない(表示しただけでは変わらない)
   * 復習待ち: 直近の回答が誤答、またはいずれかの方向で復習時刻に達した
   *           (「復習する」の対象。回答済みの方向のみ判定)
   * 習得済み: 両方向とも習熟段階2以上(間隔を空けて2回連続正解)で、復習待ちでない
   * 学習中  : 上記以外(学習画面を通過済み)
   * ========================================================================== */
  const STL = { new: '未学習', learning: '学習中', review: '復習待ち', mastered: '習得済み' };
  // 単語ID → 単語
  const byId = id => VMAP.get(id);
  // 単語の学習記録を取り出す(なければ作る)。記録を変更するのは、バトル・復習の回答処理だけ
  function P(id) {
    return state.w[id] || (state.w[id] = migrateWord(null));
  }
  // 方向データ d が復習時刻に達しているか(回答済みの方向だけ)
  const dueDir = d => d.n > 0 && d.due <= clock();
  // 単語の状態 new / learning / review / mastered を返す(定義は、この章の先頭を参照)
  function status(w) {
    const p = state.w[w.id];
    if (!p || !p.intro) return 'new';
    if (p.d.p.last === 0 || p.d.r.last === 0 || dueDir(p.d.p) || dueDir(p.d.r)) return 'review';
    return isMastered(p) ? 'mastered' : 'learning';
  }
  // 状態 s の単語の数
  const count = s => VOCAB.filter(w => status(w) === s).length;
  // 表示用のフランス語(冠詞つき。l' など)
  const disp = WordLib.display;
  // 絵文字(なければ 🔤)を HTML 用に変換する
  const em = w => esc(w.emoji || '🔤');
  /* HTMLに埋め込む動的な文字列は、本文でも属性値(data-id・value など)でも必ず esc() を通す。
     disp() は読み上げ(speak)用の生の文字列、dispH() は HTML に埋め込む用 */
  const ESC_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
  };
  // HTML の特殊文字をエスケープする(動的な文字列は必ずこれを通す)
  const esc = t => String(t == null ? '' : t).replace(/[&<>"'`]/g, c => ESC_MAP[c]);
  // 表示用のフランス語を、HTML 用にエスケープして返す
  const dispH = w => esc(disp(w));
  // 男性名詞 / 女性名詞(名詞以外は空)
  const genderLabel = w => (w.g === 'm' ? '男性名詞' : w.g === 'f' ? '女性名詞' : '');
  // 発音の目安(カタカナ)の1行。なければ空
  const kanaLine = w => (w.kana ? `<div class="small">発音の目安:${esc(w.kana)}</div>` : '');
  // 品詞・性・レベル・カテゴリを「 ・ 」でつないだ説明行
  const metaLine = w =>
    [genderLabel(w) || (w.pos && w.pos !== 'noun' ? POS_JA[w.pos] : ''), w.level, w.cat]
      .filter(Boolean)
      .map(esc)
      .join(' ・ ');
  // モンスターの進化段階(習得した最大語数 n から決まる)
  const stageOf = GR.stageOf;
  // 次の進化段階(単語数が足りない段階は除く。最終段階ならなし)
  const nextStage = n => GR.nextStage(n, VOCAB.length);
  // 習得数 n に応じた称号(なければ null)
  const titleOf = GR.titleOf;
  // 配列をシャッフルした新しい配列を返す
  const shuffle = a => WordLib.shuffle(a);
  /* 復習対象: 学習画面を通過した単語のうち、どちらかの方向が復習時刻に達したもの。
     優先順: ①直近に誤答がある ②習熟段階が低い ③期限が古い */
  function reviewList() {
    return VOCAB.filter(w => status(w) === 'review')
      .map(w => {
        const p = state.w[w.id],
          ds0 = [p.d.p, p.d.r].filter(dueDir),
          ds = ds0.length ? ds0 : [p.d.p, p.d.r];
        return {
          w,
          k: [
            p.d.p.last === 0 || p.d.r.last === 0 ? 0 : 1,
            Math.min(...ds.map(d => d.lv)),
            Math.min(...ds.map(d => d.due))
          ]
        };
      })
      .sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.k[2] - y.k[2])
      .map(x => x.w);
  }
  // 回答済みの方向のうち、復習時刻が最も早いものの順
  function nextDueList() {
    return VOCAB.filter(w => state.w[w.id] && state.w[w.id].intro)
      .map(w => {
        const ds = [state.w[w.id].d.p, state.w[w.id].d.r].filter(d => d.n > 0);
        return ds.length ? { w, t: Math.min(...ds.map(d => d.due)) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t)
      .slice(0, 4);
  }
  // 時刻 t が「いまから何分後・何時間後・何日後」かを文字で返す(過ぎていれば「いま」)
  function when(t) {
    const d = t - clock();
    if (d <= 0) return 'いま';
    if (d < 60 * MIN) return Math.ceil(d / MIN) + '分後';
    if (d < DAY) return Math.ceil(d / (60 * MIN)) + '時間後';
    return Math.ceil(d / DAY) + '日後';
  }

  state = load(); // 上の定義がすべて揃ってから読み込む

  /* ==========================================================================
   * 7. 音声(読み上げ)とお知らせ(トースト)
   * ========================================================================== */
  // 読み上げは src/lib/speech.js。お知らせ(toast)だけ、ここから渡す
  const speech = Speech.createSpeech({ win: window, notify: msg => toast(msg) });
  // フランス語の読み上げが使えるか
  const speechOK = speech.speechOK;
  // opt.onend: 読み上げが終わった(または失敗・中断した)ときに呼ぶ。BOTおまかせ復習が、
  // 読み上げの終了を待つために使う
  const speak = speech.speak;
  let toastTimer;
  // 画面下にお知らせを一時表示する(約2.4秒。role=status なのでスクリーンリーダーにも伝わる)
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('on'), 2400);
  }

  /* ==========================================================================
   * 8. 出題(問題の作り方)
   * ========================================================================== */
  function pickDir(p, onlyDue) {
    // 復習時期が早い方向、同じなら習熟段階が低い方向
    const a = p.d.p,
      b = p.d.r;
    if (onlyDue && dueDir(a) !== dueDir(b)) return dueDir(a) ? 'p' : 'r';
    if (a.due !== b.due) return a.due < b.due ? 'p' : 'r';
    if (a.lv !== b.lv) return a.lv < b.lv ? 'p' : 'r';
    return Math.random() < 0.5 ? 'p' : 'r';
  }
  // その単語で使える出題形式(イラストが無ければ「絵→仏」、読み上げが使えなければ「音→日」を除く)
  function allowedTypes(w) {
    return QTYPES.filter(
      t => !(t === 'img2fr' && !WordLib.canShowImage(w)) && !(t === 'aud2ja' && !speechOK())
    );
  }
  // このセッションでまだ使っていない形式を優先。使い切ったら使用回数が最少の形式。
  // strict=再挑戦(同じ方向を保つ)
  function pickType(w, dir, used, strict) {
    const all = allowedTypes(w),
      cnt = t => used.filter(u => u === t).length;
    const pool = strict ? all.filter(t => DIR_OF[t] === dir) : all;
    const min = Math.min(...pool.map(cnt));
    let c = pool.filter(t => cnt(t) === min);
    const pref = c.filter(t => DIR_OF[t] === dir);
    if (pref.length) c = pref;
    tc++;
    return c[tc % c.length];
  }
  /* 選択肢の生成は wordlib.js の makeQuestion(重複なし・正解を必ず含む・同訳語を誤答にしない)。
     誤答は「学習済み > 同カテゴリ > 同品詞」を優先し、足りなければ未学習語で補う。
     難易度別にしたいときは rank を差し替える */
  const isLearned = x => {
    const p = state.w[x.id];
    return !!(p && p.intro);
  };
  // 単語 w の、形式 type の問題を作る(選択肢つき)。作れなければ null
  function makeQ(w, type) {
    const q = WordLib.makeQuestion(
      w,
      type === 'ja2fr' || type === 'img2fr' ? 'toFr' : 'toJa',
      VOCAB,
      { isLearned }
    );
    return q ? { w, type, opts: q.opts } : null;
  }
  // バトル用: 状態の重み(復習4/学習中3/習得1)、復習時期なら2倍
  function pickWords(n) {
    const t = clock();
    let pool = VOCAB.filter(w => status(w) !== 'new').map(w => {
      const p = state.w[w.id],
        due = dueDir(p.d.p) || dueDir(p.d.r);
      return { w, wt: { review: 4, learning: 3, mastered: 1 }[status(w)] * (due ? 2 : 1) };
    });
    const out = [];
    while (out.length < n && pool.length) {
      let r = Math.random() * pool.reduce((a, x) => a + x.wt, 0),
        i = 0;
      while (i < pool.length - 1 && r >= pool[i].wt) {
        r -= pool[i].wt;
        i++;
      }
      out.push(pool[i].w);
      pool.splice(i, 1);
    }
    return out;
  }

  /* ==========================================================================
   * 9. バトル・復習の進行(開始 → 出題 → 回答 → 終了)
   * ========================================================================== */
  function go(mode, extra) {
    view = Object.assign({ mode }, extra || {});
    render();
    window.scrollTo(0, 0);
  }
  // 「つぎへ」を押した単語だけ既習にする
  function markIntro(w) {
    if (w) {
      P(w.id).intro = 1;
      save();
    }
  }
  // 学習を始める: まだ学んでいない単語を先頭から最大3語、学習画面に出す
  function startLearn() {
    const list = VOCAB.filter(w => status(w) === 'new').slice(0, 3);
    if (!list.length) {
      toast('すべての単語を学びました!');
      return;
    }
    go('learn', { list, i: 0 });
  }
  // バトル・復習を始める。queue は出題する { w: 単語, dir?: 方向 } の列。view
  // をバトル用に作り直して最初の問題を出す
  function begin(kind, queue) {
    view = {
      mode: 'battle',
      kind,
      queue,
      i: 0,
      base: queue.length,
      right: 0,
      answered: 0,
      right1: 0,
      num: 0,
      used: {},
      retried: {},
      missed: [],
      log: [],
      enemy: ENEMIES[Math.floor(Math.random() * ENEMIES.length)],
      stageBefore: stageOf(state.best).n,
      done: false
    };
    nextQ(true);
    render();
    window.scrollTo(0, 0);
  }
  // バトルを始める: 学習済みの単語から、状態の重みで5語を選んで出題する
  function startBattle() {
    const ws = pickWords(5);
    if (!ws.length) {
      toast('まず新しい単語を学ぼう');
      return;
    }
    const queue = [];
    // 学習済みが5語未満なら同じ単語を別形式で出題
    for (let i = 0; i < 5; i++) queue.push({ w: ws[i % ws.length] });
    begin('battle', queue);
  }
  // 復習を始める: 復習待ちの単語を、優先順に最大8語出題する(なければ「復習待ちなし」画面)
  function startReview() {
    const list = reviewList().slice(0, 8);
    if (!list.length) {
      go('noreview');
      return;
    }
    begin(
      'review',
      list.map(w => ({ w, dir: pickDir(P(w.id), true) }))
    );
  }
  // 次の問題を作って view にセットする(first = 最初の問題)。キューが尽きたら finish()
  function nextQ(first) {
    if (!first) view.i++;
    if (view.i >= view.queue.length) {
      finish();
      return;
    }
    const it = view.queue[view.i],
      dir = it.dir || pickDir(P(it.w.id), view.kind === 'review');
    const used = view.used[it.w.id] || (view.used[it.w.id] = []);
    const q = makeQ(it.w, pickType(it.w, dir, used, !!it.retry));
    if (!q) {
      toast('問題を作れませんでした(単語データを確認してください)');
      go('home');
      return;
    }
    view.q = q;
    used.push(q.type);
    view.cur = it;
    if (!it.retry) view.num++;
    view.done = false;
    view.pick = -1;
    view.last = null;
    if (!first) {
      render();
      window.scrollTo(0, 0);
    }
  }
  // 選択肢 idx で回答する(バトル・復習の回答処理。学習記録を更新するのはここだけ)。
  // 正解: 経験値+10、時期が来ていれば習熟段階アップ。誤答: 経験値+2、
  // 段階0に戻してすぐ復習対象にし、同じ単語・方向を1回だけ再出題する
  function answer(idx) {
    if (view.done) return;
    const q = view.q,
      o = q.opts[idx],
      dir = DIR_OF[q.type],
      d = P(q.w.id).d[dir],
      t = clock();
    view.done = true;
    view.pick = idx;
    view.last = o.ok;
    view.answered++;
    d.n++;
    const tr = P(q.w.id).t[q.type];
    tr.n++;
    tr.last = o.ok ? 1 : 0;
    if (o.ok) tr.ok++;
    else tr.ng++;
    view.log.push({ id: q.w.id, dir, ok: o.ok });
    if (!view.cur.retry && o.ok) view.right1++;
    if (o.ok) {
      view.right++;
      state.xp += 10;
      d.ok++;
      d.st++;
      d.last = 1;
      // 時期が来ていれば段階アップ、間隔が延びる
      if (t >= d.due) {
        d.lv = Math.min(4, d.lv + 1);
        d.due = t + INT[d.lv];
      }
    } else {
      // 誤答: 段階0に戻り、すぐ復習対象に
      state.xp += 2;
      d.ng++;
      d.st = 0;
      d.last = 0;
      d.lv = 0;
      d.due = t;
      if (view.missed.indexOf(q.w.id) < 0) view.missed.push(q.w.id);
      const key = q.w.id + dir;
      if (!view.retried[key]) {
        // 同じ単語・方向の再出題はセッション中1回だけ
        view.retried[key] = 1;
        view.queue.splice(Math.min(view.i + 3, view.queue.length), 0, { w: q.w, dir, retry: true });
      }
    }
    save();
    render();
  }
  // バトル・復習を終えて、結果画面へ移る(進化したかも判定する)
  function finish() {
    const st = stageOf(state.best);
    go('result', {
      kind: view.kind,
      right1: view.right1,
      right: view.right,
      base: view.base,
      retries: view.answered - view.base,
      answered: view.answered,
      missed: view.missed,
      log: view.log,
      evolved: st.n > view.stageBefore,
      stage: st
    });
  }

  /* ==========================================================================
   * 10. 画面の描画 ― 単語(ホーム・図鑑・学習・バトル・結果)
   * v〜 の関数は「画面の HTML 文字列」を返す。動的な文字列は必ず esc() を通す(HTML の安全性)。
   * HTML のテンプレートは、出力の空白が変わらないよう、1つの要素を1行に書いている(整形ツールでも崩
   さない)。
   * ========================================================================== */
  function monsterBlock(cls) {
    const m = state.best,
      s = stageOf(m);
    const nx = nextStage(m),
      ti = titleOf(m);
    const pct = nx ? Math.round(((m - s.n) / (nx.n - s.n)) * 100) : 100;
    return `<div class="card center"><div class="mon ${cls || ''}">${s.e}</div>
      <div class="name">${s.name}</div>${ti ? `<div class="small">称号: ${ti.name}</div>` : ''}
      <div class="bar" title="進化まで"><i style="width:${pct}%"></i></div>
      <div class="small">${nx ? `あと${nx.n - m}語おぼえると進化!` : '最終進化!すべての力を手に入れた'}</div></div>`;
  }
  // 「状態の見かた」(未学習・学習中・復習待ち・習得済みの説明)の HTML
  const defsHtml = () => `<details class="defs"><summary>状態の見かた</summary><ul class="small">
    <li><b>未学習</b>: まだ学習画面で確認していない</li><li><b>学習中</b>: 確認済みで、習得の条件に届いていない</li>
    <li><b>復習待ち</b>: 直近で間違えた、または復習の時期が来た。「復習する」の対象はこの単語だけ(語数も同じ)</li>
    <li><b>習得済み</b>: 両方向とも間隔を空けて2回連続で正解し、復習の時期ではない</li>
    <li>モンスターの進化は、これまでに習得済みになった最大の語数で決まります</li></ul></details>`;
  // 称号とカテゴリ別の実績の HTML(習得数に応じて 🏅 / 🔒)
  function achHtml() {
    const m = state.best,
      per = {};
    VOCAB.forEach(w => {
      const c = per[w.cat] || (per[w.cat] = { n: 0, k: 0 });
      c.n++;
      if (status(w) === 'mastered') c.k++;
    });
    const t = GR.visibleTitles(m, VOCAB.length).map(
      x =>
        `<li>${m >= x.n ? '🏅' : '🔒'} <b>${x.name}</b> <span class="small">習得${x.n}語${m >= x.n ? '' : '(あと' + (x.n - m) + '語)'}</span></li>`
    );
    const c = FACETS.cats
      .filter(k => per[k] && per[k].n >= 3)
      .map(
        k =>
          `<li>${per[k].k === per[k].n ? '🏆' : '▫️'} <b>${esc(k)}</b> <span class="small">${per[k].k}/${per[k].n}語 習得${per[k].k === per[k].n ? '・制覇!' : ''}</span></li>`
      );
    return `<details class="defs"><summary>🏅 称号とカテゴリ実績</summary><ul class="rv">${t.join('')}</ul>${c.length ? '<b class="small">カテゴリ別の習得</b><ul class="rv">' + c.join('') + '</ul>' : ''}</details>`;
  }
  // 追加情報の値(文字列・配列・オブジェクト)を、表示用の文字列にする
  const fval = v =>
    typeof v === 'string'
      ? v
      : Array.isArray(v)
        ? v.join('、')
        : Object.keys(v)
            .map(k => k + ': ' + v[k])
            .join(' / ');
  // 追加情報(forms)の項目名の日本語表示(plural → 複数形 など)
  const FLAB = {
    plural: '複数形',
    fem: '女性形',
    fp: '女性複数形',
    mp: '男性複数形',
    present: '現在形',
    past: '過去(複合過去)',
    future: '未来形'
  };
  // 別の訳と学習メモの HTML(あるものだけ)
  const altNote = w =>
    (w.alt.length ? `<div class="small">別の訳: ${esc(w.alt.join('、'))}</div>` : '') +
    (w.note ? `<div class="small">📝 ${esc(w.note)}</div>` : '');
  // 追加情報があるときだけ表示(なければ空)
  function extrasHtml(w) {
    const r = [];
    if (w.ipa) r.push('IPA: ' + esc(w.ipa));
    if (w.alt.length) r.push('別の訳: ' + esc(w.alt.join('、')));
    if (w.syn.length) r.push('同義語: ' + esc(w.syn.join('、')));
    if (w.forms)
      Object.keys(w.forms).forEach(k => r.push((FLAB[k] || esc(k)) + ': ' + esc(fval(w.forms[k]))));
    if (w.note) r.push('📝 ' + esc(w.note));
    return r.length
      ? `<div class="ex">${r.map(x => `<div class="small">${x}</div>`).join('')}</div>`
      : '';
  }
  // 例文(フランス語と日本語訳)の HTML。例文がなければ空
  const exBlock = w =>
    w.ex
      ? `<div class="ex"><div class="big fr" style="font-size:1.1rem">${esc(w.ex)}</div><div class="small">${esc(w.exJa)}</div></div>`
      : '';
  // ホーム画面: モンスターの育ち具合・今日の学習ボタン・図鑑・BOT・キー設定・テーマ・記録の書き出し
  function vHome() {
    const hasNew = count('new') > 0,
      hasIntro = count('new') < VOCAB.length,
      due = reviewList().length;
    let notes = '';
    if (memOnly)
      notes +=
        '<p class="small">⚠ この環境では保存できません。ページを閉じると記録が消えます。</p>';
    if (!speech.supported)
      notes += '<p class="small">🔇 この端末では音声が使えません(ゲームは遊べます)。</p>';
    if (DATA.excluded)
      notes += `<p class="small">⚠ 単語データに誤りがあるため${DATA.excluded}語を除外しています(開発者向け: コンソール/validate_words.js を確認)。</p>`;
    return (
      monsterBlock() +
      `<div class="card"><div class="stats">
      <div><b>${count('mastered')}/${VOCAB.length}</b><span>習得済み</span></div>
      <div><b>${count('learning')}</b><span>学習中</span></div>
      <div><b>${count('review')}</b><span>復習待ち</span></div>
      <div><b>${state.xp}</b><span>経験値</span></div></div></div>${defsHtml()}${achHtml()}
      <button class="btn sun" data-act="learn" ${hasNew ? '' : 'disabled'}>📖 新しい単語を学ぶ</button>
      <button class="btn" data-act="battle" ${hasIntro ? '' : 'disabled'}>⚔️ バトルに挑戦(5問)</button>
      <button class="btn" data-act="review">🔁 復習する${due ? `(復習待ち ${due}語)` : ''}</button>
      <button class="btn ghost" data-act="zukan">📚 単語図鑑</button>
      ${PL && PHRASE_LIST.length ? `<button class="btn" data-act="pmenu">🗣️ 構文トレーニング${pDue().length ? '(復習待ち ' + pDue().length + ')' : ''}</button>` : ''}
      <button class="btn ghost" data-act="botmenu">🤖 BOTおまかせ復習</button>
      ${KM ? '<button class="btn ghost" data-act="keys">⌨️ キー設定</button>' : ''}
      ${hasIntro ? '' : '<p class="small center">まず新しい単語を学ぶとバトルと復習ができるよ</p>'}${notes}
      ${themeHtml()}
      <div class="center"><button class="link" data-act="export">記録を書き出す</button><button class="link" data-act="import">記録を読み込む</button><button class="link" data-act="reset">記録を消してはじめから</button></div>
      <input type="file" id="imp" accept=".json,application/json" hidden>`
    );
  }
  // 出題形式の短い名前(日→仏 など)
  const TL = { ja2fr: '日→仏', img2fr: '絵→仏', fr2ja: '仏→日', aud2ja: '音→日' };
  // 単語図鑑の画面(一覧・検索・絞り込み・ページ送り・単語の詳細)
  function vZukan() {
    if (view.sel) {
      const w = byId(view.sel);
      if (!w) {
        view.sel = null;
        return vZukan();
      }
      const p = state.w[w.id] || migrateWord(null),
        st = status(w);
      const dots = d => '●'.repeat(d.lv) + '○'.repeat(4 - d.lv);
      const row = (lab, d) =>
        `<div class="small">${lab} ${dots(d)} 正解${d.ok}/${d.n}回${d.n ? ' ・ 次の復習:' + when(d.due) : ''}</div>`;
      return `<div class="card center"><div class="pic">${em(w)}</div>
        <div class="big fr">${dispH(w)}</div><div class="big" style="font-size:1.5rem">${esc(w.ja)}</div>
        <span class="badge ${st}">${STL[st]}</span>
        <div class="small">${metaLine(w)}</div>${kanaLine(w)}
        <button class="spk" data-act="speak" data-id="${esc(w.id)}">🔊 発音を聞く</button>
        ${exBlock(w)}${extrasHtml(w)}${usedInPhrases(w)}
        <div class="ex">${row('日→仏', p.d.p)}${row('仏→日', p.d.r)}</div>
        <div class="ex"><div class="small">形式別の記録(参考): ${QTYPES.map(k => TL[k] + ' ' + p.t[k].ok + '/' + p.t[k].n).join(' ・ ')}</div></div></div>
        <button class="btn ghost" data-act="zback">◀ 一覧にもどる</button>`;
    }
    const chips = (list, cur, act, lab) =>
      `<div class="chips">${list
        .map(
          v =>
            `<button class="chip ${v === cur ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(lab(v))}</button>`
        )
        .join('')}</div>`;
    const sel = (key, label, opts) =>
      `<label class="sel"><span>${label}</span><select data-sel="${key}">${opts
        .map(
          o =>
            `<option value="${esc(o[0])}" ${view[key] === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`
        )
        .join('')}</select></label>`;
    const catOpts = [['all', 'すべて']].concat(FACETS.cats.map(c => [c, c]));
    const posOpts = [['all', 'すべて']].concat(
      FACETS.pos.map(k => [k, POS_JA[k]]),
      FACETS.hasNoPos ? [['none', '未設定']] : []
    );
    const lvOpts = [['all', 'すべて']].concat(
      FACETS.levels.map(l => [l, l]),
      FACETS.hasNoLevel ? [['none', '未設定']] : []
    );
    return `<h2 style="margin:4px 0 8px">📚 単語図鑑</h2>${defsHtml()}
      <input id="zq" class="search" type="search" value="${esc(view.q)}" placeholder="🔍 フランス語・日本語・例文で検索" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="単語を検索">
      <div class="fsel">${sel('cat', 'カテゴリ', catOpts)}${sel('pos', '品詞', posOpts)}${sel('lv', 'レベル', lvOpts)}</div>
      ${chips(['all', 'new', 'learning', 'review', 'mastered'], view.st, 'fst', v => (v === 'all' ? 'すべて' : STL[v]))}
      <div id="zlist">${zlistHtml()}</div>
      <button class="btn ghost" data-act="home">ホームにもどる</button>`;
  }
  // 図鑑の絞り込み(検索・カテゴリ・品詞・レベル・習熟状態)。安い条件から順に適用する
  function zFilter() {
    const f = view;
    return WordLib.search(VOCAB, f.q)
      .filter(
        w =>
          (f.cat === 'all' || w.cat === f.cat) &&
          (f.pos === 'all' || (f.pos === 'none' ? !w.pos : w.pos === f.pos)) &&
          (f.lv === 'all' || (f.lv === 'none' ? !w.level : w.level === f.lv))
      )
      .filter(w => f.st === 'all' || status(w) === f.st);
  }
  // 図鑑の一覧部分(絞り込み後の、現在のページの単語カード)の HTML
  function zlistHtml() {
    const pg = WordLib.paginate(zFilter(), view.page, ZPAGE);
    view.page = pg.page;
    const card = w => {
      const st = status(w);
      return `<button class="zc" data-act="pick" data-id="${esc(w.id)}"><span class="ze">${em(w)}</span><b>${dispH(w)}</b><span>${esc(w.ja)}</span><span class="badge ${st}">${STL[st]}</span></button>`;
    };
    const pager =
      pg.pages > 1
        ? `<div class="pager"><button class="btn ghost" data-act="zpage" data-v="-1" ${pg.page > 0 ? '' : 'disabled'}>◀ 前へ</button><span class="small">${pg.page + 1} / ${pg.pages}</span><button class="btn ghost" data-act="zpage" data-v="1" ${pg.page < pg.pages - 1 ? '' : 'disabled'}>次へ ▶</button></div>`
        : '';
    return `<p class="small">${pg.total}語${pg.pages > 1 ? ' ・ ' + (pg.page * ZPAGE + 1) + '〜' + (pg.page * ZPAGE + pg.items.length) + '語目' : ''}(タップで詳細)</p>
      <div class="zgrid">${pg.items.map(card).join('') || '<p class="small">該当する単語はありません</p>'}</div>${pager}`;
  }
  // 検索欄の入力を保ったまま一覧だけ更新する
  function refreshZ(scroll) {
    const el = document.getElementById('zlist');
    if (!el) {
      render();
      return;
    }
    el.innerHTML = zlistHtml();
    if (scroll && el.scrollIntoView) el.scrollIntoView();
  }
  // 「いま復習待ちの単語はありません」の画面(次の復習の目安を表示)
  function vNoReview() {
    const nx = nextDueList(),
      hasIntro = count('new') < VOCAB.length;
    return `<div class="card center"><div class="pic">🌱</div><h2 style="margin:0">いま復習待ちの単語はありません</h2>
      <p class="small">${nx.length ? '次の復習は ' + when(nx[0].t) + ' です。' : 'まだ学んだ単語がありません。'}</p></div>
      <button class="btn sun" data-act="learn" ${count('new') ? '' : 'disabled'}>📖 新しい単語を学ぶ</button>
      <button class="btn" data-act="battle" ${hasIntro ? '' : 'disabled'}>⚔️ バトルに挑戦</button>
      <button class="btn ghost" data-act="home">ホームにもどる</button>`;
  }
  // 学習画面: 新しい単語を1語ずつ見せる(意味・発音・例文)。最後の語で「バトルへ」
  function vLearn() {
    const w = view.list[view.i],
      last = view.i === view.list.length - 1;
    return `<p class="small">単語 ${view.i + 1} / ${view.list.length}</p>
      <div class="card center"><div class="pic">${em(w)}</div>
      <div class="big fr">${dispH(w)}</div><div class="big" style="font-size:1.5rem">${esc(w.ja)}</div>
      <div class="small">${metaLine(w)}</div>${kanaLine(w)}
      <button class="spk" data-act="speak" data-id="${esc(w.id)}">🔊 発音を聞く</button>
      ${exBlock(w)}${extrasHtml(w)}</div>
      <button class="btn" data-act="${last ? 'battle' : 'learnNext'}">${last ? '⚔️ バトルへ' : 'つぎの単語 ▶'}</button>
      <button class="btn ghost" data-act="home">ホームにもどる</button>`;
  }
  // 単語の問題文(バトルとBOTおまかせ復習で共用)。live=false のときは、
  // 押せる🔊ボタンを出さない(BOTは自動で読み上げる)
  function wordQBody(q, live) {
    const w = q.w,
      spk = label =>
        live ? `<button class="spk" data-act="speak" data-id="${esc(w.id)}">${label}</button>` : '';
    if (q.type === 'ja2fr')
      return `<p class="ask">この意味のフランス語は?</p><div class="big">${esc(w.ja)}</div>`;
    if (q.type === 'fr2ja')
      return `<p class="ask">どんな意味?</p><div class="big fr">${dispH(w)}</div>${spk('🔊')}`;
    if (q.type === 'img2fr')
      return `<p class="ask">この絵はフランス語で?</p><div class="pic">${em(w)}</div>`;
    return `<p class="ask">音声を聞いて、意味を選ぼう</p>${live ? spk('🔊 もういちど聞く') : '<div class="big">🔊</div>'}`;
  }
  // 敵HP = 出題枠(base)のうち「正解で片づいた数」。初回正解も再挑戦での正解も同じ1回の攻撃として
  // 減らす(right1 は結果画面の「一度で正解」専用)
  function vBattle() {
    const q = view.q,
      w = q.w,
      cleared = Math.min(view.right, view.base),
      hp = 100 - (cleared / view.base) * 100;
    const body = wordQBody(q, true);
    const ch = q.opts
      .map((o, i) => {
        const c = view.done ? (o.ok ? 'ok' : i === view.pick ? 'ng' : '') : '';
        return `<button class="btn ${c}" data-act="ans" data-i="${i}" ${view.done ? 'disabled' : ''}>${esc(o.t)}</button>`;
      })
      .join('');
    let fb = '';
    if (view.done) {
      const isLast = view.i >= view.queue.length - 1;
      fb = `<div class="card fb ${view.last ? 'good' : 'bad'}"><h2>${view.last ? '正解!こうげき成功 ✨' : 'おしい!もう一度おぼえよう'}</h2>
        <div><b class="big fr" style="font-size:1.3rem">${em(w)} ${dispH(w)}</b> = ${esc(w.ja)}</div>
        <div class="small">${[genderLabel(w), w.kana ? '発音の目安:' + esc(w.kana) : ''].filter(Boolean).join(' ・ ')}</div>${altNote(w)}
        ${w.ex ? `<div class="ex"><span style="font-family:Georgia,serif">${esc(w.ex)}</span><div class="small">${esc(w.exJa)}</div></div>` : ''}
        ${view.last ? '' : '<div class="small">この単語はあとでまた出るよ。</div>'}
        <button class="spk" data-act="speak" data-id="${esc(w.id)}">🔊 聞く</button></div>
        <button class="btn sun" data-act="next">${isLast ? '結果を見る' : 'つぎへ ▶'}</button>`;
    }
    const s = stageOf(state.best);
    return `<p class="small">${view.cur.retry ? '🔁 まちがえた問題にもう一度チャレンジ' : 'もんだい ' + Math.min(view.num, view.base) + ' / ' + view.base}</p>
      <div class="bar"><i style="width:${((view.i + (view.done ? 1 : 0)) / view.queue.length) * 100}%"></i></div>
      <div class="card"><div class="arena"><span class="mon ${view.done && view.last ? 'atk' : ''}">${s.e}</span>
      <div class="center"><span class="enemy ${view.done && view.last ? 'hurt' : ''}">${view.enemy}</span>
      <div class="bar hp" style="width:90px"><i style="width:${hp}%"></i></div><div class="small hpn">てきHP ${view.base - cleared}/${view.base}</div></div></div></div>
      <div class="card center">${body}</div><div class="choices">${ch}</div>${fb}`;
  }
  // バトル・復習の結果画面(正解数・経験値・進化・まちがえた単語)
  function vResult() {
    const s = view.stage,
      isRv = view.kind === 'review';
    const missed = view.missed.map(byId);
    const pending = Array.from(new Set(view.log.map(l => l.id)))
      .map(byId)
      .filter(w => status(w) === 'review');
    const line = w =>
      `<li>${em(w)} <b>${dispH(w)}</b> = ${esc(w.ja)} ${status(w) === 'review' ? '<span class="badge review">復習待ち</span>' : '<span class="badge mastered">再挑戦で正解</span>'}</li>`;
    let extra = '';
    if (isRv) {
      const nx = nextDueList();
      extra = `<div class="card"><b>復習した単語</b><ul class="rv">${view.log
        .map(l => {
          const w = byId(l.id);
          return `<li>${l.ok ? '⭕' : '❌'} ${em(w)} <b>${dispH(w)}</b> = ${esc(w.ja)} <span class="small">(${l.dir === 'p' ? '日→仏' : '仏→日'})</span></li>`;
        })
        .join('')}</ul></div>
        <div class="card"><b>次に復習する単語</b><ul class="rv">${nx.map(x => `<li>${em(x.w)} <b>${dispH(x.w)}</b> <span class="small">${when(x.t)}</span></li>`).join('') || '<li class="small">なし</li>'}</ul></div>`;
    }
    return `<div class="card center"><h2 style="margin:0">${isRv ? 'ふくしゅう' : 'バトル'}しゅうりょう!</h2>
      <div class="big">${view.right1} / ${view.base} 正解</div>
      ${view.retries > 0 ? `<div class="small">(一度で正解した数。まちがえた問題の再挑戦 ${view.retries}問は別)</div>` : ''}
      <div class="small">${view.right >= view.base ? '🎉 てきをたおした!' : 'てきのHP: のこり ' + (view.base - view.right) + '/' + view.base}</div>
      <div class="mon ${view.evolved ? 'evo' : ''}">${s.e}</div><div class="name">${s.name}</div>
      ${view.evolved ? '<p><b>🎉 進化したよ!</b></p>' : ''}
      <div class="small">習得済み ${count('mastered')}/${VOCAB.length} 語 ・ 経験値 ${state.xp}</div></div>
      <div class="card"><b>今回まちがえた単語</b>${missed.length ? '<ul class="rv">' + missed.map(line).join('') + '</ul>' : '<p class="small">なし。ぜんぶ一度で正解!</p>'}</div>
      <div class="card"><b>いま復習待ちの単語</b>${pending.length ? '<ul class="rv">' + pending.map(w => `<li>${em(w)} <b>${dispH(w)}</b> = ${esc(w.ja)}</li>`).join('') + '</ul>' : '<p class="small">今回出た単語に復習待ちはありません。</p>'}
      <p class="small">全体の復習待ち: ${reviewList().length}語(ホームの「復習待ち」と同じ数)</p></div>${extra}
      <button class="btn" data-act="${isRv ? 'review' : 'battle'}">${isRv ? '🔁 もう一度復習' : '⚔️ もう一度バトル'}</button>
      <button class="btn sun" data-act="learn" ${count('new') ? '' : 'disabled'}>📖 新しい単語を学ぶ</button>
      <button class="btn ghost" data-act="home">ホームにもどる</button>`;
  }
  /* ==========================================================================
   * 11. 構文トレーニング
   * ・ロジック(問題生成・採点・記録・報酬)は src/lib/phraselib.js。ここは画面と、状態(state.ph)
   への反映だけ。
   * ・単語の記録(state.w)・習得数(best)・単語の称号には一切触れない。経験値(state.xp)
   だけを共有する。
   * ========================================================================== */
  const PR = id => state.ph[id] || (state.ph[id] = PL.newRec());
  // 構文の状態(new / learning / review / mastered)
  const pStatus = p => PL.status(state.ph[p.id], p, clock());
  // 状態 s の構文の数
  const pCount = s => PHRASE_LIST.filter(p => pStatus(p) === s).length;
  // 復習待ちの構文(優先順)
  const pDue = () => PL.reviewList(PHRASE_LIST, state.ph, clock());
  // 技能(意味・空欄・語順)の日本語名
  const skillJa = k => PL.SKILL_JA[k];
  // 今日、構文で得た経験値(日付が変わっていれば 0)
  const pToday = () => (state.pd.d === PL.dayKey(clock()) ? state.pd.xp : 0);
  // 場面の名前(未登録ならキーをそのまま)
  const sceneName = k => SCENES[k] || k;
  // 「状態の見かた(構文)」の HTML
  const pDefs = () => `<details class="defs"><summary>状態の見かた(構文)</summary><ul class="small">
    <li><b>未学習</b>: まだ一度も出題していない</li><li><b>学習中</b>: 出題済みで、習得の条件に届いていない</li>
    <li><b>復習待ち</b>: 直近で間違えた、または復習の時期が来た技能がある</li>
    <li><b>習得済み</b>: 意味・空欄・語順(その構文で出題される技能すべて)で、間隔を空けて2回連続で正解し、復習の時期ではない</li>
    <li>経験値は「復習の時期が来た技能への正解」でもらえます。時期前の練習では増えません(1日の上限あり)</li></ul></details>`;
  // 構文の称号の1行(まだなければ空)
  function pTitleLine() {
    const t = PL.titleOf(state.pbest);
    return t ? `<div class="small">構文の称号: ${esc(t.name)}</div>` : '';
  }

  // ---- 単語と構文の連携(単語の記録は読むだけで、変更しない)----
  const wordMastered = id => !!(state.w[id] && isMastered(state.w[id]));
  // 単語を学習画面で確認済みか(読むだけ)
  const wordSeen = id => !!(state.w[id] && state.w[id].intro);
  // 新しい構文を選ぶときの優先度: 習得済みの単語を含む構文を先に(0)。含まない構文(1)
  // はデータの並び順
  const pPriority = p => (PL.wordsOf(p).some(wordMastered) ? 0 : 1);
  // 単語図鑑の詳細: この単語が出てくる構文(最大3つ)
  function usedInPhrases(w) {
    if (!PL) return '';
    const used = PHRASE_LIST.filter(p => PL.wordsOf(p).indexOf(w.id) >= 0);
    if (!used.length) return '';
    return `<div class="ex"><div class="small"><b>この単語を使う構文</b>(${used.length})</div>${used
      .slice(0, 3)
      .map(p => `<div class="small"><span class="fr">${esc(p.fr)}</span><br>${esc(p.ja)}</div>`)
      .join('')}</div>`;
  }

  // ---- 出題セッション ----
  function startPhrases(kind) {
    // 復習は全場面が対象(構文メニューの「復習待ち」の件数と同じ範囲)。学習は選んだ場面だけ
    const keep = view.scene || 'all',
      scene = kind === 'review' ? 'all' : keep;
    const queue = PL.buildQueue(PHRASE_LIST, state.ph, {
      kind,
      scene,
      now: clock(),
      priority: pPriority
    });
    if (!queue.length) {
      toast(
        kind === 'review'
          ? 'いま、全場面で復習待ちの構文はありません'
          : 'この場面の構文がありません'
      );
      return;
    }
    if (kind === 'learn') {
      // まだ単語学習で習っていない単語があれば、意味を確認してから構文へ進む
      const need = [];
      queue.forEach(it => {
        const p = PMAP.get(it.pid);
        if (p)
          p.wordIds.forEach(id => {
            if (!wordSeen(id) && VMAP.has(id) && need.indexOf(id) < 0) need.push(id);
          });
      });
      if (need.length) {
        go('pwords', { scene: keep, queue, list: need.slice(0, 8) });
        return;
      }
    }
    beginPhrases(kind, keep, queue);
  }
  // 構文のセッションを始める。keepScene = 場面を保つ(復習後も同じ場面に戻る)、queue =
  // 出題する構文の列
  function beginPhrases(kind, keepScene, queue) {
    view = {
      mode: 'pquiz',
      kind,
      scene: keepScene,
      queue,
      i: 0,
      base: queue.length,
      num: 0,
      answered: 0,
      right: 0,
      right1: 0,
      retried: {},
      missedKeys: {},
      missed: [],
      log: [],
      xp: 0,
      earned: 0,
      lastXp: 0,
      bonusPaid: false,
      done: false,
      finished: false
    };
    nextPQ(true);
    render();
    window.scrollTo(0, 0);
  }
  // 構文を始める前に、その構文で使う単語のうち、まだ学習していないものを確認する画面(単語の記録は変
  // えない)
  function vPWords() {
    const ps = Array.from(new Set(view.queue.map(x => x.pid)))
      .map(id => PMAP.get(id))
      .filter(Boolean);
    return `<h2 style="margin:4px 0 8px">📖 先に単語を確認しよう</h2>
      <div class="card"><p class="small">これから学ぶ構文で使う単語のうち、単語学習でまだ習っていないものです。意味を確認してから構文に進みましょう(単語の記録は変わりません)。</p>
      <ul class="rv">${view.list
        .map(id => {
          const w = byId(id);
          return `<li><b class="fr">${dispH(w)}</b> ${esc(w.ja)} <span class="small">(${esc(POS_JA[w.pos] || '')})</span>${kanaLine(w)}</li>`;
        })
        .join('')}</ul></div>
      <div class="card"><b>今回の構文</b>${ps.map(p => `<div class="small"><span class="fr">${esc(p.fr)}</span><br>${esc(p.ja)}</div>`).join('')}</div>
      <button class="btn sun" data-act="pgo">▶ 構文トレーニングをはじめる</button>
      <button class="btn ghost" data-act="pmenu">もどる</button>`;
  }
  // 構文の次の問題を作って view にセットする(first = 最初)。出題できない構文は飛ばし、尽きたら
  // finishPhrases()
  function nextPQ(first) {
    if (view.mode !== 'pquiz') return;
    if (!first) view.i++;
    while (view.i < view.queue.length) {
      const it = view.queue[view.i],
        p = PMAP.get(it.pid);
      const q = p ? PL.makeQuestion(p, PL.FORMAT_OF[it.skill], PHRASE_LIST) : null;
      if (q) {
        view.q = q;
        view.cur = it;
        if (!it.retry) view.num++;
        view.done = false;
        view.pick = -1;
        view.last = null;
        view.sel = [];
        view.lastXp = 0;
        if (!first) {
          render();
          window.scrollTo(0, 0);
        }
        return;
      }
      view.queue.splice(view.i, 1); // 作れない問題(教材の不備)は飛ばす
      if (!it.retry) view.base = Math.max(1, view.base - 1);
    }
    finishPhrases();
  }
  // 構文の回答処理。ok = 正解か、pick = 選んだ選択肢の番号(語順整序は null)。
  // 構文の学習記録(state.ph)を更新する
  function answerPhrase(ok, pick) {
    if (view.done) return;
    const q = view.q,
      p = q.p,
      sk = q.skill,
      rec = PR(p.id),
      t = clock(),
      key = p.id + sk;
    const firstMiss = !ok && !view.missedKeys[key];
    const reward = PL.rewardFor(rec.sk[sk], ok, t, firstMiss); // 記録する前の状態で判定する
    PL.recordAnswer(rec, sk, ok, t);
    const granted = reward ? PL.capDaily(state.pd, reward, t) : 0; // 1日の上限を適用
    state.xp += granted;
    view.xp += granted;
    view.lastXp = granted;
    if (reward > 0) view.earned += reward;
    view.done = true;
    view.pick = pick;
    view.last = ok;
    view.answered++;
    view.log.push({ id: p.id, skill: sk, ok });
    if (ok) {
      view.right++;
      if (!view.cur.retry) view.right1++;
    } else {
      view.missedKeys[key] = 1;
      if (view.missed.indexOf(p.id) < 0) view.missed.push(p.id);
      // 同じ構文・技能の再出題は1回だけ
      if (!view.retried[key]) {
        view.retried[key] = 1;
        view.queue.splice(Math.min(view.i + 3, view.queue.length), 0, {
          pid: p.id,
          skill: sk,
          retry: true
        });
      }
    }
    save();
    render();
  }
  // 同じセッションの結果は1回だけ計上する(結果画面など、セッション中でないときは何もしない)
  function finishPhrases() {
    if (view.mode !== 'pquiz' || view.finished) return;
    view.finished = true;
    let bonus = 0;
    // 実際に前進した(時期の来た技能に正解した)セッションだけ
    if (!view.bonusPaid && view.answered >= 3 && view.earned > 0) {
      bonus = PL.capDaily(state.pd, PL.REWARD.session, clock());
      state.xp += bonus;
      view.bonusPaid = true;
    }
    save();
    go('presult', {
      kind: view.kind,
      scene: view.scene,
      base: view.base,
      right1: view.right1,
      right: view.right,
      answered: view.answered,
      xp: view.xp,
      bonus,
      missed: view.missed,
      log: view.log,
      retries: view.answered - view.base
    });
  }

  // ---- 画面 ----
  function vPMenu() {
    const n = PHRASE_LIST.length,
      due = pDue().length,
      nx = PL.nextDueList(PHRASE_LIST, state.ph, 1);
    const keys = ['all'].concat(
      Object.keys(SCENES).filter(k => PHRASE_LIST.some(p => p.scene === k))
    );
    const inScene =
      view.scene === 'all' ? PHRASE_LIST : PHRASE_LIST.filter(p => p.scene === view.scene);
    const newN = inScene.filter(p => pStatus(p) === 'new').length;
    const chips = `<div class="chips">${keys.map(k => `<button class="chip ${k === view.scene ? 'on' : ''}" data-act="pscene" data-v="${esc(k)}">${esc(k === 'all' ? 'すべて' : sceneName(k))}</button>`).join('')}</div>`;
    return `<h2 style="margin:4px 0 8px">🗣️ 構文トレーニング</h2>
      <div class="card"><div class="stats">
        <div><b>${pCount('mastered')}/${n}</b><span>習得済み</span></div><div><b>${pCount('learning')}</b><span>学習中</span></div>
        <div><b>${pCount('review')}</b><span>復習待ち</span></div><div><b>${state.xp}</b><span>経験値</span></div></div>
        ${pTitleLine()}<div class="small">今日、構文で得た経験値: ${pToday()}/${PL.REWARD.dailyCap}</div></div>${pDefs()}
      <p class="small" style="margin:4px 0">学ぶ場面をえらぶ</p>${chips}
      <button class="btn sun" data-act="plearn">${newN ? '📘 新しい構文を学ぶ(未学習 ' + newN + ')' : '📘 この場面の構文を練習する'}</button>
      <button class="btn" data-act="previewS">🔁 構文を復習する${due ? '(復習待ち ' + due + ')' : ''}</button>
      ${due ? `<p class="small center">復習は全場面の復習待ちが対象です${due > 6 ? '(1回に最大6つ。残りは次の復習で)' : ''}。</p>` : `<p class="small center">全場面で復習待ちの構文はありません。${nx.length ? '次の復習は ' + when(nx[0].t) + ' です。' : 'まだ学んだ構文がありません。'}</p>`}
      <button class="btn ghost" data-act="pzukan">📖 構文図鑑</button>
      <button class="btn ghost" data-act="home">ホームにもどる</button>`;
  }
  // 構文の問題文(構文トレーニングとBOTおまかせ復習で共用)
  const pQBody = q =>
    q.kind === 'choice'
      ? `<p class="ask">この意味のフランス語の文は?</p><div class="big" style="font-size:1.5rem">${esc(q.prompt)}</div>`
      : q.kind === 'cloze'
        ? `<p class="ask">空欄に入る語句は?</p><div class="big fr" style="font-size:1.5rem">${esc(q.sentence)}</div><div class="small">${esc(q.prompt)}</div>`
        : `<p class="ask">語句をならべて、文をつくろう</p><div class="big" style="font-size:1.3rem">${esc(q.prompt)}</div>`;
  // 構文の問題画面(意味の選択・空欄の選択・語順整序)
  function vPQuiz() {
    const q = view.q,
      p = q.p,
      sk = q.skill,
      last = view.i >= view.queue.length - 1;
    const head = `<p class="small">${view.cur.retry ? '🔁 まちがえた問題にもう一度チャレンジ' : 'もんだい ' + Math.min(view.num, view.base) + ' / ' + view.base} ・ ${esc(sceneName(p.scene))} ・ <b>${skillJa(sk)}</b>の問題</p>
      <div class="bar"><i style="width:${((view.i + (view.done ? 1 : 0)) / view.queue.length) * 100}%"></i></div>`;
    let ch = '',
      ctl = '';
    const body = pQBody(q);
    if (q.kind !== 'ordering') {
      ch = `<div class="choices fr">${q.opts
        .map((o, i) => {
          const c = view.done ? (o.ok ? 'ok' : i === view.pick ? 'ng' : '') : '';
          return `<button class="btn ${c}" data-act="pans" data-i="${i}" ${view.done ? 'disabled' : ''}>${esc(o.t)}</button>`;
        })
        .join('')}</div>`;
    } else {
      const placed = view.sel.map(cid => q.cards.find(c => c.cid === cid)).filter(Boolean);
      const tray = placed.length
        ? placed
            .map(
              c =>
                `<button class="pcard in" data-act="pdel" data-c="${esc(c.cid)}" ${view.done ? 'disabled' : ''} aria-label="${esc(c.t)}を取り消す">${esc(c.t)}</button>`
            )
            .join('')
        : '<span class="small">ここに語句をならべる</span>';
      const pool = q.cards
        .map(c => {
          const used = view.sel.indexOf(c.cid) >= 0;
          return `<button class="pcard ${used ? 'used' : ''}" data-act="padd" data-c="${esc(c.cid)}" ${used || view.done ? 'disabled' : ''}>${esc(c.t)}</button>`;
        })
        .join('');
      ch = `<div class="card"><div class="small">こたえ(タップで取り消し)</div><div class="tray ${view.done ? (view.last ? 'ok' : 'ng') : ''}">${tray}</div>
        <div class="small" style="margin-top:8px">語句カード</div><div class="tray pool">${pool}</div></div>`;
      if (!view.done)
        ctl = `<button class="btn sun" data-act="pcheck" ${view.sel.length === q.cards.length ? '' : 'disabled'}>✅ こたえ合わせ</button>
        <button class="btn ghost" data-act="preset" ${view.sel.length ? '' : 'disabled'}>↩ ぜんぶもどす</button>`;
    }
    let fb = '';
    if (view.done) {
      // 空欄は選んだ語そのものを示す(n' や L' を文に入れると連結して不自然になるため)
      const mine =
        q.kind === 'ordering'
          ? PL.orderingText(q, view.sel)
          : q.kind === 'cloze' && view.pick >= 0
            ? '「' + q.opts[view.pick].t + '」'
            : '';
      fb = `<div class="card fb ${view.last ? 'good' : 'bad'}"><h2>${view.last ? '正解!' : 'おしい!正しい文を確認しよう'}${view.lastXp ? ' <span class="small">+' + view.lastXp + ' XP</span>' : ''}</h2>
        <div class="big fr" style="font-size:1.25rem">${esc(p.fr)}</div><div>${esc(p.ja)}</div>
        ${!view.last && mine ? `<div class="small">あなたの答え: ${esc(mine)}</div>` : ''}
        <div class="ex"><div class="small">型: <b>${esc(p.pattern)}</b></div><div class="small">📝 ${esc(p.grammarNote)}</div>
        ${view.last ? '' : `<div class="small">${p.chunks.map(c => esc(c.t) + ' = ' + esc(c.ja)).join(' / ')}</div><div class="small">この構文はあとでまた出るよ。</div>`}</div>
        <button class="spk" data-act="pspeak" data-pid="${esc(p.id)}">🔊 聞く</button></div>
        <button class="btn sun" data-act="pnext">${last ? '結果を見る' : 'つぎへ ▶'}</button>`;
    }
    return `${head}<div class="card center">${body}</div>${ch}${ctl}${fb}
      ${view.done ? '' : '<button class="link" data-act="pmenu">構文トレーニングにもどる(ここまでの記録は保存されます)</button>'}`;
  }
  // 構文セッションの結果画面
  function vPResult() {
    const ids = Array.from(new Set(view.log.map(l => l.id))),
      total = view.xp + view.bonus;
    const row = id => {
      const p = PMAP.get(id);
      if (!p) return '';
      const oks = view.log.filter(l => l.id === id);
      return `<li>${oks.every(l => l.ok) ? '⭕' : '❌'} <b class="fr">${esc(p.fr)}</b><div class="small">${esc(p.ja)}(${oks.map(l => skillJa(l.skill) + (l.ok ? '○' : '×')).join(' ')})</div>
        <details><summary class="small">型と解説を見る</summary><div class="small">型: <b>${esc(p.pattern)}</b></div><div class="small">📝 ${esc(p.grammarNote)}</div></details></li>`;
    };
    const capped = pToday() >= PL.REWARD.dailyCap;
    return `<div class="card center"><h2 style="margin:0">構文トレーニング しゅうりょう!</h2>
      <div class="big">${view.right1} / ${view.base} 正解</div>
      ${view.retries > 0 ? `<div class="small">(一度で正解した数。まちがえた問題の再挑戦 ${view.retries}問は別)</div>` : ''}
      <div class="big" style="font-size:1.4rem">経験値 +${total}</div>
      <div class="small">${view.bonus ? '完走ボーナス +' + view.bonus + ' を含む。' : ''}${total === 0 ? '復習の時期が来ていない問題では経験値は増えません。' : ''}${capped ? '今日の構文の経験値は上限に達しました。' : ''}</div>
      <div class="small">今回の構文 ${ids.length}つ ・ 習得済み ${pCount('mastered')}/${PHRASE_LIST.length}</div></div>
      <div class="card"><b>今回の構文</b><ul class="rv">${ids.map(row).join('')}</ul></div>
      <div class="card"><b>いま復習待ちの構文</b><p class="small">${pDue().length}つ(構文メニューの「復習待ち」と同じ数)</p></div>
      <button class="btn" data-act="${view.kind === 'review' ? 'previewS' : 'plearn'}">${view.kind === 'review' ? '🔁 もう一度復習' : '📘 つづけて学ぶ'}</button>
      <button class="btn ghost" data-act="pzukan">📖 構文図鑑</button>
      <button class="btn ghost" data-act="pmenu">構文トレーニングにもどる</button>
      <button class="btn ghost" data-act="home">ホームにもどる</button>`;
  }
  // ---- 構文図鑑(単語図鑑とは別の画面・別のデータ)----
  function pFilter() {
    return PL.search(PHRASE_LIST, view.pq, SCENES).filter(
      p =>
        (view.psc === 'all' || p.scene === view.psc) &&
        (view.plv === 'all' || p.level === view.plv) &&
        (view.pst === 'all' || pStatus(p) === view.pst)
    );
  }
  // 構文図鑑の一覧部分(絞り込み後の、現在のページ)の HTML
  function pzlistHtml() {
    const pg = WordLib.paginate(pFilter(), view.page, ZPAGE);
    view.page = pg.page;
    const card = p => {
      const st = pStatus(p);
      return `<button class="pc" data-act="ppick" data-pid="${esc(p.id)}"><b class="fr">${esc(p.fr)}</b><span>${esc(p.ja)}</span><span class="small">${esc(sceneName(p.scene))} ・ ${esc(p.pattern)}</span><span class="badge ${st}">${STL[st]}</span></button>`;
    };
    const pager =
      pg.pages > 1
        ? `<div class="pager"><button class="btn ghost" data-act="pzpage" data-v="-1" ${pg.page > 0 ? '' : 'disabled'}>◀ 前へ</button><span class="small">${pg.page + 1} / ${pg.pages}</span><button class="btn ghost" data-act="pzpage" data-v="1" ${pg.page < pg.pages - 1 ? '' : 'disabled'}>次へ ▶</button></div>`
        : '';
    return `<p class="small">${pg.total}構文(タップで詳細)</p><div class="plist">${pg.items.map(card).join('') || '<p class="small">該当する構文はありません</p>'}</div>${pager}`;
  }
  // 構文図鑑の一覧だけを更新する(検索欄の入力・フォーカスを保つ)。一覧が無ければ全体を描き直す
  function refreshPZ(scroll) {
    const el = document.getElementById('pzlist');
    if (!el) {
      render();
      return;
    }
    el.innerHTML = pzlistHtml();
    if (scroll && el.scrollIntoView) el.scrollIntoView();
  }
  // 構文図鑑の画面(一覧・検索・絞り込み・詳細)
  function vPZukan() {
    if (view.sel) {
      const p = PMAP.get(view.sel);
      if (!p) {
        view.sel = null;
        return vPZukan();
      }
      const rec = state.ph[p.id] || PL.newRec(),
        st = pStatus(p),
        ks = PL.skillsOf(p);
      const dots = d => '●'.repeat(d.lv) + '○'.repeat(4 - d.lv);
      const rows = PL.SKILLS.map(k => {
        if (ks.indexOf(k) < 0)
          return `<div class="small">${skillJa(k)}: この構文では出題しません</div>`;
        const d = rec.sk[k];
        return `<div class="small">${skillJa(k)} ${dots(d)} 正解${d.ok}/${d.n}回${d.n ? ' ・ 次の復習:' + when(d.due) : ''}</div>`;
      }).join('');
      const slots = p.slots
        .map(
          s =>
            `<div class="small"><b>${esc(s.label)}</b>を入れかえる: ${s.options.map(o => `<span class="fr">${esc(PL.variantOf(p, s, o))}</span>(${esc(o.ja)})`).join(' / ')}</div>`
        )
        .join('');
      const words = p.wordIds
        .map(byId)
        .filter(Boolean)
        .map(w => esc(disp(w)) + '(' + esc(w.ja) + ')')
        .join('、');
      return `<div class="card"><span class="badge ${st}">${STL[st]}</span> <span class="small">${esc(p.level)} ・ ${esc(sceneName(p.scene))}</span>
        <div class="big fr" style="font-size:1.5rem">${esc(p.fr)}</div><div class="big" style="font-size:1.2rem">${esc(p.ja)}</div>
        <button class="spk" data-act="pspeak" data-pid="${esc(p.id)}">🔊 発音を聞く</button>
        <div class="ex"><div class="small">型: <b>${esc(p.pattern)}</b></div><div class="small">📝 ${esc(p.grammarNote)}</div></div>
        <div class="ex"><div class="small"><b>語句のまとまり</b></div>${p.chunks.map(c => `<div class="small"><span class="fr">${esc(c.t)}</span> = ${esc(c.ja)}</div>`).join('')}</div>
        ${slots ? `<div class="ex"><div class="small"><b>応用</b></div>${slots}</div>` : ''}
        ${words ? `<div class="ex"><div class="small">関連する単語: ${words}</div></div>` : ''}
        <div class="ex"><div class="small"><b>習熟(技能ごと)</b></div>${rows}</div></div>
        <button class="btn ghost" data-act="pzback">◀ 一覧にもどる</button>`;
    }
    const sel = (key, label, opts) =>
      `<label class="sel"><span>${label}</span><select data-sel="${key}">${opts.map(o => `<option value="${esc(o[0])}" ${view[key] === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
    const sceneOpts = [['all', 'すべて']].concat(
      Object.keys(SCENES)
        .filter(k => PHRASE_LIST.some(p => p.scene === k))
        .map(k => [k, sceneName(k)])
    );
    const chips = `<div class="chips">${['all', 'new', 'learning', 'review', 'mastered'].map(v => `<button class="chip ${v === view.pst ? 'on' : ''}" data-act="pfst" data-v="${v}">${v === 'all' ? 'すべて' : STL[v]}</button>`).join('')}</div>`;
    return `<h2 style="margin:4px 0 8px">📖 構文図鑑</h2>${pDefs()}
      <input id="pzq" class="search" type="search" value="${esc(view.pq)}" placeholder="🔍 フランス語・日本語・型で検索" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="構文を検索">
      <div class="fsel" style="grid-template-columns:1fr 1fr">${sel('psc', '場面', sceneOpts)}${sel('plv', 'レベル', [['all', 'すべて']].concat(PL.LEVELS.filter(l => PHRASE_LIST.some(p => p.level === l)).map(l => [l, l])))}</div>${chips}
      <div id="pzlist">${pzlistHtml()}</div>
      <button class="btn ghost" data-act="pmenu">構文トレーニングにもどる</button>`;
  }

  /* ==========================================================================
   * 12. 描画の入口(screenHtml / render)
   * 画面を出すとき: go(mode) → render() → screenHtml(mode) → v〜() が HTML を返す。
   * ========================================================================== */
  // 画面名(view.mode)から、その画面の HTML を作る関数を選ぶ。未知の画面名はホーム。
  // 構文トレーニング(PL)とキー設定(KM)の画面は、その機能が読み込まれているときだけ使える。
  function screenHtml(mode) {
    const screens = {
      home: vHome,
      learn: vLearn,
      battle: vBattle,
      result: vResult,
      noreview: vNoReview,
      zukan: vZukan,
      botmenu: vBotMenu,
      bot: vBot
    };
    if (PL)
      Object.assign(screens, {
        pmenu: vPMenu,
        pwords: vPWords,
        pquiz: vPQuiz,
        presult: vPResult,
        pzukan: vPZukan
      });
    if (KM) screens.keys = vKeys;
    return (Object.prototype.hasOwnProperty.call(screens, mode) ? screens[mode] : vHome)();
  }
  // 全画面を描き直す。view(画面の状態)を見て #app の中身を作り直し、最後にフォーカスを整える。
  function render() {
    // BOTの画面を離れたら(どの経路でも)タイマーと読み上げを解除する
    if (view.mode !== 'bot' && (botT.phase != null || botT.speech != null || botSpoke))
      botStopAll();
    // 全画面を描き直すと、フォーカス中のボタンも作り直されて失われる。描画のあとで、
    // 同じ(または次の)ボタンにフォーカスを戻す
    const snap = kbSnap();
    try {
      const m = view.mode;
      $app.innerHTML = screenHtml(m);
      if (m === 'battle' && !view.done && view.q.type === 'aud2ja') speak(disp(view.q.w));
    } catch (e) {
      console.error(e);
      $app.innerHTML =
        '<div class="card">エラーが起きました。<button class="btn" data-act="home">ホームにもどる</button></div>';
    }
    kbAfterRender(snap);
  }

  /* ==========================================================================
   * 13. BOTおまかせ復習(観戦・高速復習専用)
   * BOT が問題を出し、一定時間後に正解と解説を見せて、次の問題へ自動で進む(動画のような自動再生)。
   * ・学習記録は「読むだけ」。state / localStorage を変更しない
   *   (save()・P()・PR()・answer()・answerPhrase()・markIntro() を呼ばない)。
   *   再生の状態は view(画面の状態)と botPrefs(メモリ上の設定。保存しない)だけが持つ。
   * ・問題は既存の生成関数(makeQ / allowedTypes / PL.makeQuestion)、
   *   正解の判定は既存の判定(o.ok / PL.checkChoice / PL.checkCloze / PL.orderingCheck)を使う。
   * ・解説は教材データにあるもの(発音の目安・例文・メモ・型・文法解説・語句の意味)だけを表示する。
   * ・タイマーは「いまのフェーズの1本」と「読み上げの上限監視の1本」だけ(botT)。
   *   再生セッション番号(sid)で、古いタイマーや読み上げの終了通知を無効にする。
   * ========================================================================== */
  const BOT_SPEEDS = [
    [0.5, 'ゆっくり ×0.5'],
    [1, 'ふつう ×1'],
    [1.5, 'はやい ×1.5'],
    [2, 'とても速い ×2']
  ];
  // 速度1のときの、問題・答えの表示時間(ms)。実際は速度で割る
  const BOT_MS = { word: { q: 3500, a: 5500 }, phrase: { q: 5000, a: 8000 } };
  const BOT_COUNTS = [10, 30, 0]; // 1回に再生する数(0 = すべて)
  const BOT_SPEECH_MAX = 15000; // 読み上げの終了通知が来ない端末のための上限(ms)
  // 再生する対象の選択肢(すべて / 未学習 / 学習中 / 復習待ち / 習得済み)
  const BOT_TARGETS = [
    ['all', 'すべて'],
    ['new', '未学習'],
    ['learning', '学習中'],
    ['review', '復習待ち'],
    ['mastered', '習得済み']
  ];
  // BOTの設定(メモリ上のみ。保存しない): 種類・対象・速度・音声・再生数・順序
  const botPrefs = { kind: 'word', target: 'all', speed: 1, audio: true, count: 10, order: 'seq' };
  // BOTのタイマー: phase = いまのフェーズの表示時間、speech = 読み上げの上限監視
  const botT = { phase: null, speech: null };
  // BOTの読み上げの世代番号(古い読み上げの終了通知を無効にする) / botSid = 再生セッション番号 /
  // botSpoke = 読み上げを使ったか
  let botTok = 0,
    botSid = 0,
    botSpoke = false;
  // 構文を再生できるか
  const botHasPhrases = () => !!(PL && PHRASE_LIST.length);
  // いま再生する種類(word / phrase)。構文が無い環境では word
  const botKind = () => (botPrefs.kind === 'phrase' && botHasPhrases() ? 'phrase' : 'word');
  // 音声ありの設定で、かつ読み上げが使えるか
  const botAudioOn = audio => !!(audio && speechOK());
  // フェーズ ph(q = 問題 / a = 答え)の表示時間(ms)。速度で割る
  const botMs = (kind, ph) => Math.max(1, Math.round(BOT_MS[kind][ph] / (view.speed || 1)));
  // 再生の対象(すべて/未学習/学習中/復習待ち/習得済み)。判定は既存の status / pStatus、
  // 復習待ちの順は既存の reviewList / pDue
  function botList(kind, target, order) {
    let list;
    if (kind === 'phrase')
      list =
        target === 'review'
          ? pDue()
          : PHRASE_LIST.filter(p => target === 'all' || pStatus(p) === target);
    else
      list =
        target === 'review'
          ? reviewList()
          : VOCAB.filter(w => target === 'all' || status(w) === target);
    return order === 'rand' ? shuffle(list) : list.slice();
  }
  // 再生セッション sid がいまも有効で、一時停止中でないか
  const botLive = sid => view.mode === 'bot' && view.sid === sid && !view.paused;
  // BOTのタイマー(フェーズ・読み上げの上限監視)を止める
  function botClear() {
    ['phase', 'speech'].forEach(k => {
      if (botT[k] != null) {
        clearTimeout(botT[k]);
        botT[k] = null;
      }
    });
  }
  // 読み上げ中なら止め、古い読み上げの終了通知を無効にする
  function botHush() {
    botTok++;
    if (botSpoke) speech.cancel();
    botSpoke = false;
    if (view.mode === 'bot') view.speaking = false;
  }
  // BOTのタイマーと読み上げを、すべて止める
  const botStopAll = () => {
    botClear();
    botHush();
  };
  // 読み上げ。終わるまで(または上限まで)次へ進まない
  function botSay(text, sid) {
    const tok = ++botTok;
    view.speaking = true;
    botSpoke = true;
    const done = () => {
      if (tok !== botTok || !botLive(sid)) return;
      if (botT.speech != null) {
        clearTimeout(botT.speech);
        botT.speech = null;
      }
      botSpoke = false;
      view.speaking = false;
      botTryAdvance();
    };
    botT.speech = setTimeout(done, BOT_SPEECH_MAX);
    if (!speak(text, { onend: done })) {
      clearTimeout(botT.speech);
      botT.speech = null;
      view.speaking = false;
      botSpoke = false;
    }
  }
  // いまの問題で読み上げる文字(単語ならフランス語、構文ならその文)
  const botSpeakText = () => (view.kind === 'word' ? disp(view.q.w) : view.q.p.fr);
  // いまのフェーズ(q=問題 / a=答え)を最初から始める。一時停止中・終了後は何もしない
  function botBegin() {
    if (view.mode !== 'bot' || view.paused || view.phase === 'done') return;
    botStopAll();
    const sid = view.sid;
    view.timerDone = false;
    view.speaking = false;
    // 答えを読み上げる。音声問題だけは問題の提示でも読み上げる
    const audible =
      botAudioOn(view.audio) &&
      (view.phase === 'a' || (view.kind === 'word' && view.q.type === 'aud2ja'));
    if (audible) botSay(botSpeakText(), sid);
    botT.phase = setTimeout(
      () => {
        botT.phase = null;
        if (!botLive(sid)) return;
        view.timerDone = true;
        botTryAdvance();
      },
      botMs(view.kind, view.phase)
    );
  }
  // 表示時間が過ぎていて、読み上げも終わっているときだけ進む
  function botTryAdvance() {
    if (view.mode !== 'bot' || view.paused || !view.timerDone || view.speaking) return;
    if (view.phase === 'q') botReveal();
    else if (view.phase === 'a') botGo(view.i + 1);
  }
  // 答えを見せるフェーズ(a)へ進む
  function botReveal() {
    view.phase = 'a';
    render();
    botBegin();
  }
  // 再生を終えて、終了の表示にする
  function botFinish() {
    botStopAll();
    view.phase = 'done';
    view.paused = false;
    render();
    window.scrollTo(0, 0);
  }
  // i 番目の問題へ進む(最後まで来たら botFinish())
  function botGo(i) {
    botStopAll();
    if (i >= view.items.length) {
      botFinish();
      return;
    }
    view.i = i;
    view.phase = 'q';
    view.q = botMakeQ(view.items[i], i);
    view.timerDone = false;
    view.speaking = false;
    render();
    window.scrollTo(0, 0);
    botBegin();
  }
  /* 問題の作成と、BOTの解答(既存の生成関数・判定関数を使う)。作れない問題(選択肢を作れない教材)は、
     選択肢なしで答えだけ見せる */
  function botMakeQ(item, i) {
    if (view.kind === 'word') {
      const ts = allowedTypes(item).filter(t => t !== 'aud2ja' || botAudioOn(view.audio)),
        type = ts[i % ts.length];
      return makeQ(item, type) || { w: item, type, opts: [] };
    }
    const fs = PL.skillsOf(item).map(k => PL.FORMAT_OF[k]),
      fmt = fs[i % fs.length];
    const q = PL.makeQuestion(item, fmt, PHRASE_LIST) || {
      kind: 'choice',
      p: item,
      prompt: item.ja,
      opts: []
    };
    if (q.kind === 'choice') q.botAns = q.opts.findIndex((o, k) => PL.checkChoice(q, k));
    else if (q.kind === 'cloze') q.botAns = q.opts.findIndex((o, k) => PL.checkCloze(q, k));
    // 語順: 教材の語句の並びどおり
    else
      q.botAns = q.cards
        .slice()
        .sort((a, b) => a.i - b.i)
        .map(c => c.cid);
    return q;
  }
  // BOTの選択肢の HTML(表示専用)。答えのフェーズでは、正解に ok を付ける
  function botChoices(q, rev, isOk) {
    return q.opts.length
      ? `<div class="choices ${view.kind === 'phrase' ? 'fr' : ''}">${q.opts.map((o, i) => `<button class="btn ${rev && isOk(o, i) ? 'ok' : ''}" disabled>${esc(o.t)}</button>`).join('')}</div>`
      : '';
  }
  // BOTの「答え」フェーズの HTML(正解と解説)
  function botAnswerHtml() {
    if (view.kind === 'word') {
      const w = view.q.w;
      return `<div class="card center fb good"><h2>🤖 BOTの答え</h2><div class="pic">${em(w)}</div><div class="big fr">${dispH(w)}</div><div class="big" style="font-size:1.5rem">${esc(w.ja)}</div>
        <div class="small">${metaLine(w)}</div>${kanaLine(w)}${exBlock(w)}${extrasHtml(w)}</div>`;
    }
    const q = view.q,
      p = q.p;
    return `<div class="card fb good"><h2>🤖 BOTの答え</h2><div class="big fr" style="font-size:1.25rem">${esc(p.fr)}</div><div>${esc(p.ja)}</div>
      ${q.kind === 'cloze' ? `<div class="small">空欄の答え: 「${esc(p.cloze.answer)}」</div>` : ''}
      <div class="ex">${p.pattern ? `<div class="small">型: <b>${esc(p.pattern)}</b></div>` : ''}${p.grammarNote ? `<div class="small">📝 ${esc(p.grammarNote)}</div>` : ''}
      <div class="small">${p.chunks.map(c => esc(c.t) + ' = ' + esc(c.ja)).join(' / ')}</div></div></div>`;
  }
  // BOTの「問題」フェーズの HTML
  function botQuestionHtml() {
    const q = view.q,
      rev = view.phase === 'a';
    if (view.kind === 'word')
      return `<div class="card center">${wordQBody(q, false)}</div>${botChoices(q, rev, o => o.ok)}`;
    let ch;
    if (q.kind === 'ordering') {
      const cards = rev ? q.botAns.map(cid => q.cards.find(c => c.cid === cid)) : q.cards;
      ch = `<div class="card"><div class="small">${rev ? '正しい並び' : '語句カード(BOTがならべます)'}</div><div class="tray ${rev ? 'ok' : 'pool'}">${cards.map(c => `<button class="pcard ${rev ? 'in' : ''}" disabled>${esc(c.t)}</button>`).join('')}</div></div>`;
    } else ch = botChoices(q, rev, (o, i) => i === q.botAns);
    return `<div class="card center">${pQBody(q)}</div>${ch}`;
  }
  // BOTメニューの選択チップ(list の中から cur を選択中として表示)
  const botChips = (list, cur, act, lab) =>
    `<div class="chips">${list.map(v => `<button class="chip ${v === cur ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(lab(v))}</button>`).join('')}</div>`;
  // BOTの速度チップの HTML
  const botSpeedChips = cur =>
    botChips(
      BOT_SPEEDS.map(x => x[0]),
      cur,
      'botspeed',
      v => BOT_SPEEDS.find(x => x[0] === v)[1]
    );
  // BOTの音声(あり / なし)チップの HTML
  const botAudioChips = cur =>
    `<div class="chips"><button class="chip ${cur ? 'on' : ''}" data-act="botaudio" data-v="on" ${speechOK() ? '' : 'disabled'}>🔊 ON</button><button class="chip ${cur ? '' : 'on'}" data-act="botaudio" data-v="off">🔇 OFF</button></div>`;
  const botNote =
    '👀 観戦専用です。BOTの答えは、経験値・習熟度・正答率・復習時刻・バトルの記録に一切反映されません。';
  // BOTおまかせ復習のメニュー画面(種類・対象・速度・音声・再生数)
  function vBotMenu() {
    const kind = botKind(),
      tgt = botPrefs.target,
      total = botList(kind, tgt, 'seq').length,
      n = botPrefs.count > 0 ? Math.min(total, botPrefs.count) : total;
    const kinds = [['word', '📖 単語']].concat(botHasPhrases() ? [['phrase', '🗣️ 構文']] : []);
    return `<h2 style="margin:4px 0 8px">🤖 BOTおまかせ復習</h2>
      <div class="card"><p class="small" style="margin:0">BOTが問題を解いて、正解と解説を次々に見せます。見るだけで、何も操作しなくて大丈夫。</p><p class="small" style="margin:6px 0 0">${botNote}</p></div>
      <p class="small" style="margin:4px 0">教材</p><div class="chips">${kinds.map(k => `<button class="chip ${k[0] === kind ? 'on' : ''}" data-act="botkind" data-v="${k[0]}">${k[1]}</button>`).join('')}</div>
      <p class="small" style="margin:4px 0">復習する対象</p><div class="chips">${BOT_TARGETS.map(t => `<button class="chip ${t[0] === tgt ? 'on' : ''}" data-act="bottarget" data-v="${t[0]}">${t[1]}(${botList(kind, t[0], 'seq').length})</button>`).join('')}</div>
      <p class="small" style="margin:4px 0">再生する数</p>${botChips(BOT_COUNTS, botPrefs.count, 'botcount', v => (v ? v + '問' : 'すべて'))}
      <p class="small" style="margin:4px 0">順番</p>${botChips(['seq', 'rand'], botPrefs.order, 'botorder', v => (v === 'seq' ? 'じゅんばん' : 'ランダム'))}
      <p class="small" style="margin:4px 0">再生速度(問題と答えの表示時間)</p>${botSpeedChips(botPrefs.speed)}
      <p class="small" style="margin:4px 0">フランス語の音声</p>${botAudioChips(botAudioOn(botPrefs.audio))}${speechOK() ? '' : '<p class="small">🔇 この端末ではフランス語の音声が使えないため、音声なしで再生します。</p>'}
      <button class="btn sun" data-act="botstart" ${n ? '' : 'disabled'}>▶ はじめる${n ? '(' + n + '問)' : ''}</button>
      ${n ? '' : '<p class="small center">この条件の教材はありません。対象をかえてみよう。</p>'}
      <button class="btn ghost" data-act="home">ホームにもどる</button>`;
  }
  // BOTの再生画面(問題・答え・操作バー)
  function vBot() {
    if (view.phase === 'done') {
      return `<div class="card center"><h2 style="margin:0">🤖 再生おわり!</h2><div class="big">${view.items.length}問</div>
        <div class="small">${view.kind === 'word' ? '単語' : '構文'}を見終わりました。${botNote}</div></div>
        <button class="btn sun" data-act="botagain">🔁 もういちど再生</button><button class="btn ghost" data-act="botmenu">設定にもどる</button><button class="btn ghost" data-act="home">ホームにもどる</button>`;
    }
    const n = view.items.length,
      rev = view.phase === 'a';
    return `<div class="botq"><p class="small">🤖 BOTおまかせ ・ ${view.kind === 'word' ? '単語' : '構文'} ・ もんだい ${view.i + 1} / ${n} ・ <b>${view.paused ? '⏸ 一時停止中' : rev ? '✅ 答え' : '❓ 問題'}</b></p>
      <div class="bar"><i style="width:${((view.i + (rev ? 1 : 0)) / n) * 100}%"></i></div>
      ${botQuestionHtml()}${rev ? botAnswerHtml() : ''}
      <details class="defs"><summary>⚙ 速度と音声</summary>${botSpeedChips(view.speed)}${botAudioChips(botAudioOn(view.audio))}</details>
      <button class="link" data-act="home">ホームにもどる</button></div>
      <div class="botbar">${view.paused ? '<button class="btn sun" data-act="botresume">▶ 再開</button>' : '<button class="btn sun" data-act="botpause">⏸ 一時停止</button>'}<button class="btn" data-act="botnext">⏭ 次の問題</button><button class="btn ghost" data-act="botstop">⏹ 終了</button></div>`;
  }
  // BOTの再生を始める。条件に合う教材を集めて view を作り、最初の問題へ
  function botStart() {
    const kind = botKind(),
      all = botList(kind, botPrefs.target, botPrefs.order),
      items = botPrefs.count > 0 ? all.slice(0, botPrefs.count) : all;
    if (!items.length) {
      toast('この条件の教材がありません');
      return;
    }
    botStopAll();
    view = {
      mode: 'bot',
      sid: ++botSid,
      kind,
      target: botPrefs.target,
      items,
      i: 0,
      phase: 'q',
      paused: false,
      speed: botPrefs.speed,
      audio: botPrefs.audio,
      q: null,
      timerDone: false,
      speaking: false
    };
    botGo(0);
  }
  // BOTおまかせ復習の操作。処理したら true
  function botAction(a, el, v) {
    if (a.indexOf('bot') !== 0) return false;
    const menu = view.mode === 'botmenu',
      play = view.mode === 'bot' && view.phase !== 'done';
    if (a === 'botmenu') {
      go('botmenu');
    } else if (a === 'botkind') {
      if (menu && (v === 'word' || (v === 'phrase' && botHasPhrases()))) {
        botPrefs.kind = v;
        render();
      }
    } else if (a === 'bottarget') {
      if (menu && BOT_TARGETS.some(t => t[0] === v)) {
        botPrefs.target = v;
        render();
      }
    } else if (a === 'botcount') {
      if (menu && BOT_COUNTS.indexOf(Number(v)) >= 0) {
        botPrefs.count = Number(v);
        render();
      }
    } else if (a === 'botorder') {
      if (menu && (v === 'seq' || v === 'rand')) {
        botPrefs.order = v;
        render();
      }
    }
    // 再生中に変えたときは、次のフェーズから反映(いまの表示時間は変えない)
    else if (a === 'botspeed') {
      const sp = Number(v);
      if (BOT_SPEEDS.some(x => x[0] === sp) && (menu || view.mode === 'bot')) {
        botPrefs.speed = sp;
        if (view.mode === 'bot') view.speed = sp;
        render();
      }
    } else if (a === 'botaudio') {
      if (menu || view.mode === 'bot') {
        const on = v === 'on' && speechOK();
        botPrefs.audio = on;
        if (view.mode === 'bot') {
          view.audio = on;
          // 読み上げを止め、待っていた場合は先へ進める。音声問題は、音声なしで出せる形式に作り直す
          if (!on) {
            if (botT.speech != null) {
              clearTimeout(botT.speech);
              botT.speech = null;
            }
            botHush();
            if (view.phase === 'q' && view.kind === 'word' && view.q.type === 'aud2ja')
              view.q = botMakeQ(view.items[view.i], view.i);
          }
        }
        render();
        if (view.mode === 'bot' && !on) botTryAdvance();
      }
    } else if (a === 'botstart') {
      if (menu) botStart();
    } else if (a === 'botagain') {
      if (view.mode === 'bot' && view.phase === 'done') {
        botPrefs.kind = view.kind;
        botPrefs.target = view.target;
        botStart();
      }
    } else if (a === 'botpause') {
      if (play && !view.paused) {
        view.paused = true;
        botStopAll();
        render();
      }
    } else if (a === 'botresume') {
      if (play && view.paused) {
        view.paused = false;
        render();
        botBegin();
      }
    } else if (a === 'botnext') {
      if (play) botGo(view.i + 1);
    } else if (a === 'botstop') {
      if (view.mode === 'bot') {
        botStopAll();
        go('botmenu');
      }
    } else return false;
    return true;
  }

  /* ==========================================================================
   * 14. ボタン操作の入口(クリック → handleAct)
   * 画面のボタンは data-act 属性で操作名を持つ。クリック・タップも、キーボードのショートカットも、
   * 同じ handleAct を通る(処理の重複をなくすため)。
   * ========================================================================== */
  document.addEventListener('click', function (e) {
    handleAct(e.target.closest && e.target.closest('[data-act]'));
  });
  // ボタンの操作。クリック・タップと、キーボードのショートカット(ボタンの click() 経由)が、
  // 同じ処理を通る
  function handleAct(el) {
    if (!el || el.disabled) return;
    const a = el.dataset.act,
      v = el.dataset.v;
    try {
      if (a === 'home') go('home');
      else if (a === 'learn') startLearn();
      else if (a === 'learnNext') {
        if (view.mode === 'learn') markIntro(view.list[view.i]);
        view.i++;
        render();
        window.scrollTo(0, 0);
      } else if (a === 'battle') {
        if (view.mode === 'learn') markIntro(view.list[view.i]);
        startBattle();
      } else if (a === 'review') startReview();
      else if (a === 'zukan')
        go('zukan', { q: '', cat: 'all', pos: 'all', lv: 'all', st: 'all', page: 0, sel: null });
      else if (a === 'fst') {
        view.st = v;
        view.page = 0;
        render();
      } else if (a === 'zpage') {
        view.page += Number(v);
        refreshZ(true);
      } else if (a === 'export') exportData();
      else if (a === 'import') {
        const f = document.getElementById('imp');
        if (f) f.click();
      } else if (a === 'pick') {
        view.sel = el.dataset.id;
        render();
        window.scrollTo(0, 0);
      } else if (a === 'zback') {
        view.sel = null;
        render();
      } else if (a === 'ans') answer(Number(el.dataset.i));
      else if (a === 'next') nextQ(false);
      else if (a === 'speak') {
        const w = byId(el.dataset.id);
        if (w) speak(disp(w));
      } else if (a.indexOf('bot') === 0 && botAction(a, el, v)) {
        /* BOTおまかせ復習の操作 */
      } else if (PL && a.charAt(0) === 'p' && phraseAction(a, el, v)) {
        /* 構文トレーニングの操作 */
      } else if (a === 'theme') {
        setTheme(v);
        render();
      } else if (KM && a.indexOf('key') === 0) keyAction(a, v);
      else if (a === 'reset') {
        if (confirm('学習の記録をすべて消します。よろしいですか?')) {
          try {
            localStorage.setItem(KEY + '-before-reset', JSON.stringify(state));
          } catch (e2) {
            // 退避できなくても、リセットは続ける(確認ダイアログで同意済み)
          }
          state = fresh();
          save();
          go('home');
        }
      }
    } catch (err) {
      console.error(err);
      toast('エラーが起きました');
      go('home');
    }
  }
  // 構文トレーニングの操作。処理したら true
  function phraseAction(a, el, v) {
    const inQuiz = view.mode === 'pquiz' && !view.done;
    if (a === 'pmenu') go('pmenu', { scene: view.scene || 'all' });
    else if (a === 'pscene') {
      view.scene = v;
      render();
    } else if (a === 'plearn') startPhrases('learn');
    else if (a === 'previewS') startPhrases('review');
    else if (a === 'pgo') {
      if (view.mode === 'pwords') beginPhrases('learn', view.scene, view.queue);
    } else if (a === 'pzukan')
      go('pzukan', {
        pq: '',
        psc: 'all',
        plv: 'all',
        pst: 'all',
        page: 0,
        sel: null,
        scene: view.scene || 'all'
      });
    else if (a === 'pans') {
      if (inQuiz && view.q.kind !== 'ordering') {
        const i = Number(el.dataset.i);
        answerPhrase(
          view.q.kind === 'choice' ? PL.checkChoice(view.q, i) : PL.checkCloze(view.q, i),
          i
        );
      }
    } else if (a === 'padd') {
      if (inQuiz && view.q.kind === 'ordering') {
        view.sel = PL.orderingAdd(view.q, view.sel, el.dataset.c);
        render();
      }
    } else if (a === 'pdel') {
      if (inQuiz && view.q.kind === 'ordering') {
        view.sel = PL.orderingRemove(view.q, view.sel, el.dataset.c);
        render();
      }
    } else if (a === 'preset') {
      if (inQuiz && view.q.kind === 'ordering') {
        view.sel = PL.orderingReset();
        render();
      }
    } else if (a === 'pcheck') {
      if (inQuiz && view.q.kind === 'ordering' && view.sel.length === view.q.cards.length)
        answerPhrase(PL.orderingCheck(view.q, view.sel), -1);
    } else if (a === 'pnext') {
      if (view.mode === 'pquiz' && view.done) nextPQ(false);
    } else if (a === 'pspeak') {
      const p = PMAP.get(el.dataset.pid);
      if (p) speak(p.fr);
    } else if (a === 'pfst') {
      view.pst = v;
      view.page = 0;
      render();
    } else if (a === 'pzpage') {
      view.page += Number(v);
      refreshPZ(true);
    } else if (a === 'ppick') {
      view.sel = el.dataset.pid;
      render();
      window.scrollTo(0, 0);
    } else if (a === 'pzback') {
      view.sel = null;
      render();
    } else return false;
    return true;
  }
  /* ==========================================================================
   * 15. 学習記録の書き出し・読み込み(JSON)
   * 読み込み前に、いまの記録を別キー(KEY-before-import)へ退避する。
   * ========================================================================== */
  function exportData() {
    try {
      const d = new Date(clock()),
        ymd =
          d.getFullYear() +
          String(d.getMonth() + 1).padStart(2, '0') +
          String(d.getDate()).padStart(2, '0');
      const blob = new Blob(
        [
          JSON.stringify({
            app: 'kotoba-monster',
            format: 4,
            exportedAt: d.toISOString(),
            data: state
          })
        ],
        { type: 'application/json' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kotoba-monster-' + ymd + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('学習記録を書き出しました');
    } catch (e) {
      toast('書き出せませんでした');
    }
  }
  // 失敗時はエラー文を返す。成功(または取消)時は null
  function importText(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return 'ファイルを読み取れません(JSONではありません)';
    }
    const d = obj && obj.app === 'kotoba-monster' && obj.data ? obj.data : obj;
    if (
      !d ||
      typeof d !== 'object' ||
      Array.isArray(d) ||
      !d.w ||
      typeof d.w !== 'object' ||
      Array.isArray(d.w)
    )
      return 'この記録ファイルは読み込めません(学習データが見つかりません)';
    const s2 = migrate(d),
      n = VOCAB.filter(w => isMastered(s2.w[w.id])).length;
    // 構文の記録(ph)を持たない古い書き出しファイルを読み込んでも、いまの構文の学習記録は消さない
    const keepPh = !Object.prototype.hasOwnProperty.call(d, 'ph');
    if (keepPh) {
      s2.ph = state.ph;
      s2.pd = state.pd;
      s2.pbest = Math.max(s2.pbest, state.pbest);
    }
    if (
      !confirm(
        'この記録を読み込みます(習得済み ' +
          n +
          '語・経験値 ' +
          s2.xp +
          (PL && !keepPh ? '・構文の記録あり' : '') +
          ')。いまの記録は上書きされます(自動でバックアップを残します)。よろしいですか?'
      )
    )
      return null;
    try {
      localStorage.setItem(KEY + '-before-import', JSON.stringify(state));
    } catch (e) {
      // 退避できなくても、読み込みは続ける(確認ダイアログで同意済み)
    }
    state = s2;
    save();
    go('home');
    toast('学習記録を読み込みました');
    return null;
  }
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'zq' && view.mode === 'zukan') {
      view.q = e.target.value;
      view.page = 0;
      refreshZ(false);
    } else if (e.target && e.target.id === 'pzq' && view.mode === 'pzukan') {
      view.pq = e.target.value;
      view.page = 0;
      refreshPZ(false);
    }
  });
  document.addEventListener('change', function (e) {
    const t = e.target;
    if (t && t.dataset && t.dataset.sel && view.mode === 'zukan') {
      view[t.dataset.sel] = t.value;
      view.page = 0;
      render();
    } else if (t && t.dataset && t.dataset.sel && view.mode === 'pzukan') {
      view[t.dataset.sel] = t.value;
      view.page = 0;
      render();
    } else if (t && t.id === 'imp' && t.files && t.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        const err = importText(String(fr.result));
        if (err) toast(err);
      };
      fr.onerror = () => toast('ファイルを読み込めませんでした');
      fr.readAsText(t.files[0]);
      t.value = '';
    }
  });

  /* ==========================================================================
   * 16. キーボードショートカット
   * ・キーと操作の対応は src/lib/keymap.js。初期設定は 1〜4 = 選択肢 / N = つぎへ / R = 発音 /
   *   P = BOTの一時停止・再開 / Esc = もどる。利用者が「キー設定」で変更でき、
   *   kotoba-monster-keymap に保存する(学習記録・バックアップ・書き出し・読み込みには触らない)。
   * ・矢印キー(↑↓←→)は、選択肢(語順整序では語句カード)の間で選択中の項目(フォーカス)を動かす
   *   固定のキー。決定は Enter / Space(ボタンの標準の動作)。割り当ては変えられない(kbMove)。
   * ・押せるのは「いま画面に表示されていて、押せる状態のボタン」だけ。キーはそのボタンの click()
   を呼ぶので、
   *   回答・次へ・語順カード・BOTの操作は、マウスやタップと同じ既存の処理(handleAct)を通る。
   *   未回答のときは「つぎへ」のボタン自体がないので、勝手に進まない。
   * ・文字入力中、IME 変換中、Ctrl / Command / Alt / Shift を押しているとき、押しっぱなし(repeat)
   は何もしない。
   * ========================================================================== */
  // ---- 設定(keymap.js) ----
  // keymap.js が無い環境では KM が null になり、キーボード機能(キー設定の入口・ショートカット)
  // を出さない。
  // 設定は学習記録(KEY)・テーマ(THEME_KEY)とは別の localStorage キー(KM.STORAGE_KEY)に保存する。
  const KM = typeof KeyMap !== 'undefined' ? KeyMap : null;
  // 現在のキー割り当て { 操作ID: キー }。読み込み時に検証済み(重複・不正なキーは初期設定)
  let keys = KM ? kmRead() : {};
  // 保存された設定を読む(読むだけ。壊れた値・重複のある値は初期設定にもどして使うが、書き換えない)
  function kmRead() {
    let raw = null;
    try {
      raw = localStorage.getItem(KM.STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
    return KM.parse(raw);
  }
  let kbDriven = false; // キー操作で描き直したあと、フォーカスを整えるための印
  // 画面の中の、押せる部品(ボタンとセレクト)の一覧
  const kbList = () => {
    try {
      return Array.prototype.slice.call($app.querySelectorAll('button, select'));
    } catch (e) {
      return [];
    }
  };
  // 押せる状態の(disabled でない)ボタンのうち、操作名が acts のどれかで、test も満たす最初のもの
  const kbPick = (acts, test) =>
    kbList().find(b => !b.disabled && acts.indexOf(b.dataset.act) >= 0 && (!test || test(b))) ||
    null;
  // その操作が、いま押すボタン(画面にない・押せないときは null)
  function kbTarget(action) {
    const m = view.mode,
      sel = /^select([1-4])$/.exec(action);
    if (sel) {
      const n = Number(sel[1]) - 1;
      if (m === 'battle') return kbPick(['ans'], b => Number(b.dataset.i) === n);
      if (m === 'pquiz' && view.q && view.q.kind !== 'ordering')
        return kbPick(['pans'], b => Number(b.dataset.i) === n);
      // 語順整序: n 番目の語句カードを追加(5枚目以降は Tab・Enter・Space)
      if (m === 'pquiz' && view.q && view.q.kind === 'ordering') {
        const b = kbList().filter(x => x.dataset.act === 'padd')[n];
        return b && !b.disabled ? b : null;
      }
      return null;
    }
    if (action === 'next') {
      // BOT: 答えが出てから(問題の途中で飛ばさない)
      if (m === 'bot') return view.phase === 'a' ? kbPick(['botnext']) : null;
      return m === 'battle' || m === 'pquiz' || m === 'learn'
        ? kbPick(['next', 'pnext', 'learnNext'])
        : null;
    }
    if (action === 'speak') return m === 'bot' ? null : kbPick(['speak', 'pspeak']);
    if (action === 'pause') return m === 'bot' ? kbPick(['botpause', 'botresume']) : null;
    return null;
  }
  // Esc: 出題の途中は確認のうえ中断。それ以外は、画面の「もどる」ボタンと同じ
  function kbBack() {
    const m = view.mode,
      goBtn = act => {
        const b = kbPick([act]);
        if (b) b.click();
        else handleAct({ dataset: { act } });
        return true;
      };
    if (m === 'home') return false;
    if (m === 'battle') {
      if (!confirm('いまの出題をやめて、ホームにもどりますか?(ここまでの答えは保存されています)'))
        return true;
      speech.cancel();
      go('home');
      return true;
    }
    if (m === 'pquiz')
      return confirm(
        'いまの出題をやめて、構文トレーニングにもどりますか?(ここまでの答えは保存されています)'
      )
        ? goBtn('pmenu')
        : true;
    if (m === 'bot')
      return view.phase === 'done'
        ? goBtn('home')
        : confirm('BOTの再生を終わって、設定にもどりますか?(学習記録は変わりません)')
          ? goBtn('botstop')
          : true;
    if (m === 'zukan') return goBtn(view.sel ? 'zback' : 'home');
    if (m === 'pzukan') return goBtn(view.sel ? 'pzback' : 'pmenu');
    const to = {
      learn: 'home',
      noreview: 'home',
      botmenu: 'home',
      pmenu: 'home',
      pwords: 'pmenu',
      result: 'home',
      presult: 'pmenu',
      keys: 'home'
    }[m];
    return to ? goBtn(to) : false;
  }
  // 処理したら true(そのキーのブラウザ標準の動作を止める)
  function kbRun(action) {
    if (action === 'back') return kbBack();
    // BOTの読み上げには干渉しない。一時停止中だけ、いまの問題の発音を再生する
    if (action === 'speak' && view.mode === 'bot') {
      if (!view.paused || view.phase === 'done' || !speechOK()) return false;
      const it = view.items[view.i],
        text = it ? (view.kind === 'word' ? disp(it) : it.fr) : '';
      return text ? (speak(text), true) : false;
    }
    const b = kbTarget(action);
    if (!b) return false;
    b.click();
    return true;
  }
  // 矢印キー(↑ ← = 前へ / ↓ → = 次へ)で動かす向き。割り当ては変えられない固定のキー
  const ARROW_STEP = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
  // 矢印キー: 選択肢(語順整序では語句カード)の間で、フォーカス(選択中の項目)を動かす。
  // 決定は Enter / Space(フォーカス中のボタンの標準の動作 = 数字キーと同じ既存の回答処理)。
  // 端まで来たら反対側へつなぐ。フォーカスが選択肢の外にあるときは、↓ で最初、↑ で最後へ。
  // 動かす選択肢が画面にないとき(回答後・他の画面)は何もしない(false)ので、ページのスクロールは妨げない
  function kbMove(step) {
    const items = kbList().filter(
      b => !b.disabled && ['ans', 'pans', 'padd'].indexOf(b.dataset.act) >= 0
    );
    if (!items.length) return false;
    const cur = items.indexOf(document.activeElement),
      next =
        cur < 0 ? (step > 0 ? 0 : items.length - 1) : (cur + step + items.length) % items.length;
    items[next].focus();
    return true;
  }
  // キーが押されたときの入口。入力中・変換中・修飾キー・押しっぱなしでは何もしない
  function onKeydown(e) {
    if (!KM || !e || e.defaultPrevented || KM.isComposing(e) || KM.isTypingTarget(e.target)) return;
    try {
      // Enter を押しっぱなしにすると、ボタンを押すたびにフォーカスが次のボタンへ移り、
      // 連続して押されてしまう。押しっぱなしの繰り返しは、ボタンの標準の動作を止める
      if (e.repeat && e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.act) {
        e.preventDefault();
        return;
      }
      if (view.mode === 'keys' && view.listen) {
        kbCapture(e);
        return;
      }
      if (e.repeat || KM.hasModifier(e)) return;
      if (Object.prototype.hasOwnProperty.call(ARROW_STEP, e.key)) {
        if (kbMove(ARROW_STEP[e.key])) e.preventDefault();
        return;
      }
      const action = KM.actionFor(keys, KM.keyOf(e));
      if (!action) return;
      kbDriven = true;
      try {
        if (kbRun(action)) e.preventDefault();
      } finally {
        kbDriven = false;
      }
    } catch (err) {
      console.error(err);
    }
  }
  // ---- キー設定画面 ----
  // 理由の表示。画面を描き直さない(押されたキーが Enter/Space のとき、
  // フォーカス中のボタンの標準の動作を壊さないため)
  function kbSay(msg) {
    view.msg = msg;
    const el = document.getElementById('keymsg');
    if (el) el.textContent = msg;
    toast(msg);
  }
  // 再割り当て中に押されたキー
  function kbCapture(e) {
    if (e.repeat || KM.isNoise(e)) return;
    const t = e.target,
      onButton = t && String(t.tagName || '').toUpperCase() === 'BUTTON';
    // ボタンを押す操作(「キャンセル」など)
    if (onButton && (e.key === 'Enter' || e.key === ' ')) return;
    const why = KM.whyNot(e);
    if (why) {
      kbSay(why);
      return;
    } // 割り当てできないキー。ブラウザの操作(F5 など)は止めない
    e.preventDefault();
    const k = KM.keyOf(e),
      r = KM.assign(keys, view.listen, k);
    // 競合: 理由を示して確定しない(割り当て中のまま、別のキーを待つ)
    if (!r.ok) {
      kbSay(r.reason);
      return;
    }
    keys = r.map;
    try {
      localStorage.setItem(KM.STORAGE_KEY, KM.serialize(keys));
    } catch (err) {
      toast('設定を保存できませんでした(このページを開いている間だけ有効です)');
    }
    view.focusV = view.listen;
    view.msg = '「' + KM.labelOf(view.listen) + '」を ' + KM.show(k) + ' に変更しました';
    view.listen = null;
    render();
  }
  // キー設定画面の操作(keys = 開く / keyset = 再割り当てを始める / keycancel / keyreset)
  function keyAction(a, v) {
    if (a === 'keys') go('keys', { listen: null, msg: '' });
    else if (view.mode !== 'keys') return;
    else if (a === 'keyset') {
      if (KM.IDS.indexOf(v) >= 0) {
        view.listen = v;
        view.msg = '';
        render();
      }
    } else if (a === 'keycancel') {
      view.focusV = view.listen;
      view.listen = null;
      view.msg = '';
      render();
    } else if (a === 'keyreset') {
      keys = Object.assign({}, KM.DEFAULTS);
      try {
        localStorage.removeItem(KM.STORAGE_KEY);
      } catch (e) {
        /* 何もしない */
      }
      view.listen = null;
      view.msg = '初期設定にもどしました';
      render();
    }
  }
  // キー設定画面(各操作の現在のキー・変更・初期設定にもどす)
  function vKeys() {
    const rows = KM.ACTIONS.map(a => {
      const on = view.listen === a.id;
      return `<div class="keyrow"><div><b>${esc(a.label)}</b></div><span class="kbd ${on ? 'listen' : ''}">${on ? 'キーを押してください' : esc(KM.show(keys[a.id]))}</span>
        ${on ? '<button class="chip on" data-act="keycancel">キャンセル</button>' : `<button class="chip" data-act="keyset" data-v="${a.id}" aria-label="${esc(a.label)}のキーを変更">変更</button>`}</div>`;
    }).join('');
    return `<h2 style="margin:4px 0 8px">⌨️ キー設定</h2>
      <div class="card"><p class="small" style="margin:0">「変更」を押してから、割り当てたいキーを押します。${KM.isDefault(keys) ? 'いまは初期設定です。' : '初期設定から変更されています。'}</p>${rows}
        <p class="small keymsg" id="keymsg">${esc(view.msg || '')}</p></div>
      <div class="card"><p class="small" style="margin:0">・使えるキーは、英字・数字・Esc です。同じキーを2つの操作には割り当てられません。</p>
        <p class="small" style="margin:4px 0 0">・矢印キー(↑↓←→)は、選択肢(語順の語句カード)の間で選択を動かす固定のキーで、Enter / Space で決定します(割り当ては変えられません)。</p>
        <p class="small" style="margin:4px 0 0">・Tab・Enter・Space は、ボタンを押す・移動する標準の操作です(語順の問題も、Tab で語句に移動して Enter / Space で追加・取り消し・こたえ合わせができます)。</p>
        <p class="small" style="margin:4px 0 0">・文字を入力しているとき、変換中、Ctrl・Command・Alt を押しているときは、ショートカットは働きません。</p></div>
      <button class="btn ghost" data-act="keyreset" ${KM.isDefault(keys) ? 'disabled' : ''}>初期設定にもどす</button>
      <button class="btn ghost" data-act="home">ホームにもどる</button>`;
  }
  // ---- フォーカスの維持(全画面の再描画のあと)----
  function kbSnap() {
    // 描き直す前に、フォーカス中のボタン(セレクト)の目印を控える
    if (!KM) return null;
    try {
      const ae = document.activeElement;
      if (!ae || !ae.dataset || !(ae.dataset.act || ae.dataset.sel)) return { inApp: false };
      // data-key は、ショートカットの表示用に後から付けたもの(同じボタンかの判定には使わない)
      const data = Object.assign({}, ae.dataset);
      delete data.key;
      return { inApp: true, tag: String(ae.tagName || '').toUpperCase(), data };
    } catch (e) {
      return null;
    }
  }
  // 描き直す前後で「同じボタン」か(種類と data-* が同じで、押せる状態)。表示用の data-key
  // は比べない
  const kbSame = (el, tag, data) => {
    // 同じ種類・同じ data-*(data-key は除く)の、押せるボタン
    if (el.disabled || String(el.tagName || '').toUpperCase() !== tag) return false;
    const ks = Object.keys(el.dataset || {}).filter(k => k !== 'key');
    return ks.length === Object.keys(data).length && ks.every(k => el.dataset[k] === data[k]);
  };
  // 描画のあと: フォーカスを戻し(同じボタン → 対のボタン → 次に操作するボタン)、
  // キーの表示と案内を更新する
  function kbAfterRender(snap) {
    if (!KM) return;
    try {
      const list = kbList();
      let target = null;
      // キー設定: 変更を終えたら、その行の「変更」ボタンへ
      if (view.mode === 'keys' && view.focusV) {
        target =
          list.find(
            b => !b.disabled && b.dataset.act === 'keyset' && b.dataset.v === view.focusV
          ) || null;
        view.focusV = null;
        // 割り当て中は「キャンセル」へ(キーボードだけでやめられるように)
      } else if (view.mode === 'keys' && view.listen)
        target = list.find(b => b.dataset.act === 'keycancel') || null;
      // 同じボタン。なければ対になるボタン(取り消し⇄追加・一時停止⇄再開)
      if (!target && snap && snap.inApp) {
        const alt =
          snap.data.act === 'pdel'
            ? { act: 'padd', c: snap.data.c }
            : snap.data.act === 'botpause'
              ? { act: 'botresume' }
              : snap.data.act === 'botresume'
                ? { act: 'botpause' }
                : null;
        target =
          list.find(b => kbSame(b, snap.tag, snap.data)) ||
          (alt && list.find(b => kbSame(b, snap.tag, alt))) ||
          null;
      }
      // 見つからないとき(回答後・次の問題・画面の移動): 次に操作するボタン
      if (!target && (kbDriven || (snap && snap.inApp))) {
        const en = list.filter(b => !b.disabled);
        for (const acts of [
          ['next', 'pnext', 'learnNext'],
          ['pcheck'],
          ['ans', 'pans', 'padd'],
          ['botresume', 'botpause']
        ]) {
          target = en.find(b => acts.indexOf(b.dataset.act) >= 0) || null;
          if (target) break;
        }
        if (!target)
          target = en.find(b => /(^|\s)btn(\s|$)/.test(String(b.className || ''))) || null;
      }
      if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
    } catch (e) {
      /* フォーカスの調整に失敗しても、ゲームは続ける */
    }
    try {
      kbDecorate();
      kbHint();
    } catch (e) {
      /* 何もしない */
    }
  }
  // 画面のボタンに、ショートカットの表示(data-key: 見た目のバッジ)と aria-keyshortcuts を付ける
  function kbDecorate() {
    const mark = (b, id) => {
      if (b) {
        b.setAttribute('data-key', KM.show(keys[id]));
        b.setAttribute('aria-keyshortcuts', KM.aria(keys[id]));
      }
    };
    ['select1', 'select2', 'select3', 'select4', 'next', 'pause'].forEach(id =>
      mark(kbTarget(id), id)
    );
    if (view.mode !== 'bot')
      kbList()
        .filter(b => !b.disabled && (b.dataset.act === 'speak' || b.dataset.act === 'pspeak'))
        .forEach(b => b.setAttribute('aria-keyshortcuts', KM.aria(keys.speak)));
    if (view.mode === 'bot' && view.paused)
      kbList().forEach(b => {
        if (b.dataset.act === 'botresume') b.setAttribute('aria-keyshortcuts', KM.aria(keys.pause));
      });
  }
  // 画面下の「キーボード」の案内(いまの画面で使えるキー)
  function kbHintText() {
    const K = id => KM.show(keys[id]),
      m = view.mode,
      sel = [1, 2, 3, 4].map(n => K('select' + n)),
      range = sel.join('') === '1234' ? '1〜4' : sel.join(' / ');
    const hasSpeak = !!kbPick(['speak', 'pspeak']),
      parts = [];
    if (m === 'battle' || m === 'pquiz') {
      const ordering = m === 'pquiz' && view.q && view.q.kind === 'ordering';
      if (view.done) {
        parts.push(K('next') + ' でつぎへ');
        if (hasSpeak) parts.push(K('speak') + ' で発音');
      } else if (ordering) {
        parts.push(
          'Tab / ↑↓ で語句へ移動・Enter / Space で追加・取り消し・こたえ合わせ',
          range + ' で左から語句を追加'
        );
      } else {
        parts.push(range + ' で答えを選ぶ', '↑↓ で選択を移動・Enter で決定');
        if (hasSpeak) parts.push(K('speak') + ' で発音');
      }
      parts.push(K('back') + ' で中断');
    } else if (m === 'learn') {
      parts.push(K('next') + ' でつぎの単語', K('speak') + ' で発音', K('back') + ' でもどる');
    } else if (m === 'bot') {
      if (view.phase === 'done') parts.push(K('back') + ' でもどる');
      else
        parts.push(
          K('pause') + ' で一時停止・再開',
          K('next') + ' でつぎの問題(答えが出たら)',
          K('back') + ' で終了'
        );
    } else if (m !== 'home' && m !== 'keys') {
      if (hasSpeak) parts.push(K('speak') + ' で発音');
      parts.push(K('back') + ' でもどる');
    } else if (m === 'keys') parts.push(K('back') + ' でホームにもどる');
    return parts.length ? '⌨️ キーボード: ' + parts.join(' ・ ') : '';
  }
  // 画面下の「キーボード」案内を更新する(案内がない画面では隠す)
  function kbHint() {
    const el = document.getElementById('kbhint');
    if (!el) return;
    const t = kbHintText();
    el.textContent = t;
    el.hidden = !t;
  }
  if (KM) {
    document.addEventListener('keydown', onKeydown);
    // 他のタブで変えた設定を読み直す(読むだけ)
    if (typeof window.addEventListener === 'function')
      window.addEventListener('storage', e => {
        if (e && e.key === KM.STORAGE_KEY) {
          keys = kmRead();
          if (view.mode === 'keys') render();
        }
      });
  }
  /* ==========================================================================
   * 17. テスト用の公開と起動
   * window.__kotoba は自動テスト用の窓口(画面の操作には使わない)。最後に、
   テーマを適用して最初の画面を描く。
   * ========================================================================== */
  window.__kotoba = {
    keys: () => Object.assign({}, keys),
    state: () => state,
    view: () => view,
    setClock: f => {
      clock = f;
    },
    status,
    byId,
    reviewList,
    vocab: VOCAB,
    data: DATA,
    zukan: () => ({ list: zFilter(), html: zlistHtml() }),
    importText,
    esc,
    phrases: PHRASE_LIST,
    pdata: PDATA,
    pstatus: pStatus,
    pzukan: () => (PL ? { list: pFilter(), html: pzlistHtml() } : null),
    pdue: pDue
  };
  applyTheme();
  render();
})();
