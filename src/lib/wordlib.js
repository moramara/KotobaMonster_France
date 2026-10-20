/* wordlib.js — 単語データの検証・正規化・出題生成・検索(ゲーム画面から独立したロジック)
   ブラウザでは window.WordLib、Node では require('./wordlib.js') で使えます。DOM・localStorage
   には触りません。 */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.WordLib = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 定数 ---------- */
  const POS = {
    noun: '名詞',
    verb: '動詞',
    adjective: '形容詞',
    adverb: '副詞',
    pronoun: '代名詞',
    preposition: '前置詞',
    conjunction: '接続詞',
    interjection: '間投詞',
    expression: '定型表現',
    article: '冠詞',
    numeral: '数詞'
  };
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  // 冠詞 → 期待される性('' はどちらでも可)
  const ARTICLES = { le: 'm', la: 'f', "l'": '', un: 'm', une: 'f', les: '', des: '' };
  const KNOWN_FIELDS = [
    'id',
    'cat',
    'art',
    'g',
    'fr',
    'ja',
    'emoji',
    'kana',
    'ex',
    'exJa',
    'pos',
    'level',
    'alt',
    'syn',
    'forms',
    'note',
    'ipa',
    'img',
    'noImage'
  ];
  const CHOICES = 4; // 1問あたりの選択肢数(正解1+誤答3)
  const RE_JP = /[\u3040-\u30ff\u3400-\u9fff]/;
  const RE_KANA = /^[\u30A0-\u30FF\u3000\s・\-ー']+$/;
  const RE_BADCHAR = /[<>&\u0000-\u001f]/;

  /* ---------- 表示・小物 ---------- */
  const display = w =>
    w.art ? (w.art.slice(-1) === "'" ? w.art + w.fr : w.art + ' ' + w.fr) : w.fr;
  const jaSet = x => [x.ja].concat(Array.isArray(x.alt) ? x.alt : []);
  const isStr = v => typeof v === 'string';
  const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  // 絵を使う出題(絵→仏)ができる単語: 絵文字があり、名詞(または img:true)で、noImage でない
  const canShowImage = w => !!(w.emoji && !w.noImage && (w.pos === 'noun' || w.img === true));
  function shuffle(a, rng) {
    rng = rng || Math.random;
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
  // 母音字で始まるか。y は含めない(le yaourt / le yoga のように子音扱いの語と、l'ytterbium
  // のように母音扱いの語が混在し、綴りだけでは決められない)
  const startsWithVowel = s => /^[aeiouàâäéèêëîïôöùûüœæ]/i.test(s);

  /* ---------- 冠詞の省略(エリジオン)判定 ----------
     le / la は、母音・無音のh で始まる語の前で l' になる。有音のh・一部の外来語/数詞(yaourt, onze
     など)は省略しない。
     h と y は綴りだけでは判定できないため、確実に分かっている語だけ下の小さな辞書に載せ、
     辞書にない h/y 始まりの語は「判定できない」として、正誤を断定しない(誤警告を出さない)。
     辞書にない語を足したいときは、確実な語だけを足すこと(迷う語は載せない=判定しない方が安全)。 */
  // 無音のh: l'homme のように省略する
  const H_MUET = new Set([
    'homme',
    'heure',
    'hôtel',
    'hôpital',
    'histoire',
    'herbe',
    'hiver',
    'huile',
    'humour',
    'habitude',
    'habit',
    'horloge',
    'hirondelle',
    'hippopotame',
    'hélicoptère',
    'hôte',
    'hôtesse',
    'hypothèse',
    'hygiène',
    'hémisphère',
    'horizon',
    'hymne',
    'harmonie',
    'haleine',
    'hameçon',
    'huître',
    'humanité',
    'hélice',
    'hectare',
    'héroïne',
    'héritage',
    'hexagone',
    'hélium',
    'horreur',
    'hospitalité',
    'hormone',
    'huissier',
    'hydrogène',
    'humeur',
    'horaire'
  ]);
  // 有音のh: le héros のように省略しない(l'héros とは書けない)
  const H_ASPIRE = new Set([
    'haricot',
    'héros',
    'hibou',
    'homard',
    'honte',
    'hache',
    'hasard',
    'hamster',
    'hangar',
    'hauteur',
    'haine',
    'hérisson',
    'hockey',
    'huit',
    'harpe',
    'hall',
    'handicap',
    'héron',
    'hanche',
    'hareng',
    'hêtre',
    'hotte',
    'hublot',
    'hurlement',
    'housse',
    'houx',
    'hutte',
    'haut',
    'hamac',
    'hobby',
    'hâte',
    'halte',
    'hamburger',
    'hot-dog',
    'harem'
  ]);
  // 母音字・y で始まるのに省略しない語(le onze / le oui / la une / le yacht / le yoga など)
  const NO_ELISION = new Set([
    'onze',
    'onzième',
    'oui',
    'uhlan',
    'une',
    'yacht',
    'yoga',
    'yen',
    'yoyo',
    'yourte',
    'yéti',
    'yak',
    'yankee'
  ]);
  // 両方の形が通用する語(le yaourt / l'yaourt など)。どちらも誤りとは言えないので判定しない
  const ELISION_BOTH = new Set(['yaourt', 'yogourt', 'yoghourt', 'ouate', 'ouistiti']);
  const foldKey = s => String(s).trim().toLowerCase().normalize('NFC').replace(/[’‘]/g, "'");
  /* 語頭の省略可否を返す。{ allow: 'elide'(l' が必要) | 'noelide'(le/la のまま) |
     'both'(どちらも可) | 'unknown'(判定不能), basis: 'dict'|'rule' } */
  function elisionOf(fr) {
    const k = foldKey(fr),
      first = k.split(/[\s\-']/)[0];
    for (const key of [k, first]) {
      if (!key) continue;
      if (ELISION_BOTH.has(key)) return { allow: 'both', basis: 'dict' };
      if (H_MUET.has(key)) return { allow: 'elide', basis: 'dict' };
      if (H_ASPIRE.has(key) || NO_ELISION.has(key)) return { allow: 'noelide', basis: 'dict' };
    }
    if (!k) return { allow: 'unknown', basis: 'rule' };
    // 辞書にない h / y 始まりは断定しない
    if (/^[hy]/.test(k)) return { allow: 'unknown', basis: 'rule' };
    return { allow: startsWithVowel(k) ? 'elide' : 'noelide', basis: 'rule' };
  }
  /* 冠詞 art と単語 fr の組み合わせを確認する。返り値: { level: 'ok'|'warn'|'error'|'unknown',
     message }
     error は「子音で始まる普通の語に l'」のように確実に誤りと言える場合だけ。辞書にもとづく指摘は
     warn(単語は除外されない)。
     un/une/les/des は省略しないので、どんな語でも ok。 */
  function checkArticle(art, fr) {
    if (!isStr(art) || !isStr(fr) || !fr.trim())
      return { level: 'unknown', message: '判定に必要な情報がありません' };
    if (art !== 'le' && art !== 'la' && art !== "l'") return { level: 'ok', message: '' };
    const e = elisionOf(fr),
      elided = art === "l'";
    if (e.allow === 'unknown')
      return {
        level: 'unknown',
        message: 'h/y で始まる語は、辞書にないため冠詞の省略を判定できません: ' + fr
      };
    if (e.allow === 'both') return { level: 'ok', message: '' };
    if (e.allow === 'elide' && !elided)
      return {
        level: 'warn',
        message: '母音・無音のhで始まる語に "' + art + '" が付いています(l\' では?): ' + fr
      };
    if (e.allow === 'noelide' && elided) {
      return e.basis === 'rule'
        ? { level: 'error', message: "子音で始まる語に l' は付けられません: " + fr }
        : {
            level: 'warn',
            message: "有音のh(または省略しない語)に l' が付いています(le/la では?): " + fr
          };
    }
    return { level: 'ok', message: '' };
  }

  /* ---------- 検索用の正規化(大文字小文字・アクセント・全半角・カタカナ/ひらがなを区別しない)
     ---------- */
  function fold(s) {
    s = String(s == null ? '' : s)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[’‘`´]/g, "'")
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae');
    s = s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC');
    return s
      .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/\s+/g, ' ')
      .trim();
  }
  function searchKey(w) {
    return fold(
      [w.fr, display(w), w.ja].concat(w.alt || [], w.syn || [], [w.ex, w.exJa, w.kana]).join('\n')
    );
  }
  function search(words, query) {
    const toks = fold(query).split(' ').filter(Boolean);
    if (!toks.length) return words;
    return words.filter(w => {
      const k = w._s || searchKey(w);
      return toks.every(t => k.indexOf(t) >= 0);
    });
  }
  function paginate(arr, page, size) {
    const pages = Math.max(1, Math.ceil(arr.length / size));
    const p = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
    return { items: arr.slice(p * size, p * size + size), page: p, pages, total: arr.length };
  }
  // 図鑑の絞り込み候補。データに実際に存在する値だけを返す
  function facets(words, categories) {
    const present = [],
      seen = new Set();
    words.forEach(w => {
      if (!seen.has(w.cat)) {
        seen.add(w.cat);
        present.push(w.cat);
      }
    });
    const cats = (categories ? categories.filter(c => seen.has(c)) : []).concat(
      present.filter(c => !categories || categories.indexOf(c) < 0)
    );
    const pos = Object.keys(POS).filter(k => words.some(w => w.pos === k));
    return {
      cats,
      pos,
      levels: LEVELS.filter(l => words.some(w => w.level === l)),
      hasNoPos: words.some(w => !w.pos),
      hasNoLevel: words.some(w => !w.level)
    };
  }

  /* ---------- 正規化: 登録データ → ゲームが使う形(省略項目は既定値で補う。元データは変更しない)
     ---------- */
  function normalize(r) {
    const w = {
      id: r.id,
      cat: r.cat,
      art: r.art || '',
      g: r.g || '',
      fr: r.fr,
      ja: r.ja,
      emoji: r.emoji || '',
      kana: r.kana || '',
      ex: r.ex || '',
      exJa: r.exJa || '',
      pos: r.pos || (r.art || r.g ? 'noun' : ''),
      level: r.level || '',
      alt: Array.isArray(r.alt) ? r.alt.slice() : [],
      syn: Array.isArray(r.syn) ? r.syn.slice() : [],
      forms: isPlain(r.forms) ? r.forms : null,
      note: r.note || '',
      ipa: r.ipa || '',
      img: r.img === true,
      noImage: r.noImage === true
    };
    w._s = searchKey(w);
    return w;
  }

  /* ---------- 出題生成 ----------
     誤答の優先順位は rank(正解語, 候補語, ctx) の小さい順(同順位はランダム)。
     差し替えれば難易度別の出題にできる。 */
  const RANKERS = {
    // 既定: 学習済み > 同カテゴリ > 同品詞 の順に優先。足りなければ未学習語も使う
    learnedFirst: (w, x, ctx) =>
      (ctx.isLearned(x) ? 0 : 4) + (x.cat === w.cat ? 0 : 2) + (x.pos === w.pos ? 0 : 1),
    sameCategory: (w, x) => (x.cat === w.cat ? 0 : 1),
    random: () => 0
  };
  /* mode: 'toFr'(日本語→フランス語の選択肢) | 'toJa'(フランス語→日本語の選択肢)
     o: { count=4, isLearned(w), rank, rng }
     返り値: { w, mode, opts:[{t, ok, id}] }。誤答を1つも作れないとき null。
     保証: 正解が1つだけ含まれる / 選択肢の文字列が重複しない / 日本語訳が同じ(別訳を含む)
     語は誤答にしない */
  function makeQuestion(word, mode, pool, o) {
    o = o || {};
    const count = o.count || CHOICES,
      rng = o.rng || Math.random,
      toFr = mode === 'toFr';
    const text = x => (toFr ? display(x) : x.ja);
    const ctx = { isLearned: o.isLearned || (() => true) },
      rank = o.rank || RANKERS.learnedFirst;
    const correct = text(word),
      wJa = jaSet(word),
      wDisp = display(word);
    const buckets = new Map();
    for (const x of pool) {
      if (x === word || x.id === word.id) continue;
      const r = rank(word, x, ctx);
      let b = buckets.get(r);
      if (!b) {
        b = [];
        buckets.set(r, b);
      }
      b.push(x);
    }
    const seen = new Set([correct]),
      picks = [];
    for (const r of Array.from(buckets.keys()).sort((a, b) => a - b)) {
      const arr = buckets.get(r);
      while (arr.length && picks.length < count - 1) {
        const i = Math.floor(rng() * arr.length),
          x = arr[i];
        arr[i] = arr[arr.length - 1];
        arr.pop();
        const t = text(x);
        if (seen.has(t) || display(x) === wDisp || jaSet(x).some(j => wJa.indexOf(j) >= 0))
          continue;
        seen.add(t);
        picks.push({ t, ok: false, id: x.id });
      }
      if (picks.length >= count - 1) break;
    }
    if (!picks.length) return null;
    return {
      w: word,
      mode,
      opts: shuffle(picks.concat([{ t: correct, ok: true, id: word.id }]), rng)
    };
  }
  // 出題として成立しているか確認し、問題点の文字列配列を返す(空なら正常)
  function checkQuestion(q, count) {
    const p = [];
    if (!q) return ['選択肢を作れません'];
    if (q.opts.length !== (count || CHOICES))
      p.push('選択肢が' + q.opts.length + '個(必要: ' + (count || CHOICES) + ')');
    const ts = q.opts.map(o => o.t);
    if (new Set(ts).size !== ts.length) p.push('選択肢が重複しています: ' + ts.join(' / '));
    const oks = q.opts.filter(o => o.ok);
    if (oks.length !== 1) p.push('正解が' + oks.length + '個です');
    else if (oks[0].t !== (q.mode === 'toFr' ? display(q.w) : q.w.ja))
      p.push('正解の内容が単語と一致しません');
    return p;
  }

  /* ---------- 検証 ---------- */
  function validate(words, opts) {
    opts = opts || {};
    const issues = [],
      bad = new Set();
    const add = (level, i, id, field, message) => {
      issues.push({ level, index: i, id: id, field, message });
      if (level === 'error') bad.add(i);
    };
    if (!Array.isArray(words)) {
      add('error', -1, '(全体)', 'WORDS', '単語データが配列ではありません');
      return { errors: issues, warnings: [], badIndexes: bad };
    }
    const firstOf = new Map(),
      frKey = new Map(),
      jaKey = new Map();

    words.forEach((r, i) => {
      const idLabel = r && isStr(r.id) && r.id ? r.id : '#' + (i + 1) + '番目';
      const E = (field, msg) => add('error', i, idLabel, field, msg);
      const Wn = (field, msg) => add('warn', i, idLabel, field, msg);
      if (!isPlain(r)) {
        E('(レコード)', 'オブジェクトではありません');
        return;
      }

      // id
      if (!isStr(r.id) || !r.id) E('id', '必須です(文字列)');
      else {
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(r.id))
          E(
            'id',
            '形式が不正です(英字で始まり、英数字・_・- のみ、32文字以内): ' + JSON.stringify(r.id)
          );
        else if (r.id in {}) E('id', '予約語のため使えません: ' + r.id);
        if (firstOf.has(r.id))
          E(
            'id',
            'IDが重複しています(' + (firstOf.get(r.id) + 1) + '番目と' + (i + 1) + '番目): ' + r.id
          );
        else firstOf.set(r.id, i);
      }
      // 文字列フィールド
      const text = (f, required) => {
        const v = r[f];
        if (v === undefined || v === null || v === '') {
          if (required) E(f, '必須項目が空です');
          return false;
        }
        if (!isStr(v)) {
          E(f, '文字列である必要があります(実際: ' + (Array.isArray(v) ? '配列' : typeof v) + ')');
          return false;
        }
        if (v !== v.trim()) E(f, '前後に空白があります: ' + JSON.stringify(v));
        if (RE_BADCHAR.test(v))
          E(f, '使えない文字(< > & 改行・制御文字)が含まれています: ' + JSON.stringify(v));
        if (/\s{2,}/.test(v)) Wn(f, '連続した空白があります: ' + JSON.stringify(v));
        return true;
      };
      const hasFr = text('fr', true),
        hasJa = text('ja', true),
        hasCat = text('cat', true);
      const hasArt = text('art', false),
        hasG = text('g', false);
      text('emoji');
      text('kana');
      const hasEx = text('ex'),
        hasExJa = text('exJa');
      text('note');
      text('ipa');
      // カテゴリ
      if (hasCat && opts.categories && opts.categories.indexOf(r.cat) < 0)
        E(
          'cat',
          '未登録のカテゴリです: ' +
            JSON.stringify(r.cat) +
            '(words.js の CATEGORIES に追加するか、表記を確認してください)'
        );
      // 日本語/フランス語の取り違え
      if (hasFr && RE_JP.test(r.fr)) E('fr', '日本語が含まれています(frとjaが逆?): ' + r.fr);
      if (hasJa && !RE_JP.test(r.ja)) Wn('ja', '日本語(かな・漢字)が含まれていません: ' + r.ja);
      if (hasEx && RE_JP.test(r.ex)) E('ex', '日本語が含まれています(exとexJaが逆?): ' + r.ex);
      if (hasExJa && !RE_JP.test(r.exJa))
        Wn('exJa', '日本語(かな・漢字)が含まれていません: ' + r.exJa);
      if (isStr(r.kana) && r.kana && !RE_KANA.test(r.kana))
        Wn('kana', 'カタカナ以外の文字が含まれています: ' + r.kana);
      // 例文と訳はセット
      if (hasEx !== hasExJa)
        E(hasEx ? 'exJa' : 'ex', '例文(ex)と例文訳(exJa)は両方そろえてください');
      // 品詞・レベル
      if (
        r.pos !== undefined &&
        r.pos !== '' &&
        !(isStr(r.pos) && Object.prototype.hasOwnProperty.call(POS, r.pos))
      )
        E(
          'pos',
          '不正な値です: ' +
            JSON.stringify(r.pos) +
            '(使える値: ' +
            Object.keys(POS).join(', ') +
            ')'
        );
      if (r.level !== undefined && r.level !== '' && LEVELS.indexOf(r.level) < 0)
        E(
          'level',
          '不正な値です: ' + JSON.stringify(r.level) + '(使える値: ' + LEVELS.join(', ') + ')'
        );
      if (r.img !== undefined && typeof r.img !== 'boolean')
        E('img', 'true/false である必要があります');
      if (r.noImage !== undefined && typeof r.noImage !== 'boolean')
        E('noImage', 'true/false である必要があります');
      // 配列・オブジェクト
      ['alt', 'syn'].forEach(f => {
        if (r[f] === undefined) return;
        if (!Array.isArray(r[f])) {
          E(f, '文字列の配列である必要があります');
          return;
        }
        r[f].forEach((v, k) => {
          if (!isStr(v) || !v.trim() || v !== v.trim() || RE_BADCHAR.test(v))
            E(f, k + '番目が空・非文字列・前後空白・使えない文字です: ' + JSON.stringify(v));
        });
      });
      if (Array.isArray(r.alt) && hasJa && r.alt.indexOf(r.ja) >= 0)
        Wn('alt', '別訳が日本語訳(ja)と同じです: ' + r.ja);
      if (r.forms !== undefined) {
        if (!isPlain(r.forms)) E('forms', 'オブジェクトである必要があります');
        else
          Object.keys(r.forms).forEach(k => {
            const v = r.forms[k],
              okS = x => isStr(x) && x.trim() && !RE_BADCHAR.test(x);
            const ok =
              okS(v) ||
              (Array.isArray(v) && v.length && v.every(okS)) ||
              (isPlain(v) && Object.keys(v).length && Object.keys(v).every(kk => okS(v[kk])));
            if (!ok)
              E(
                'forms.' + k,
                '文字列・文字列の配列・{名前: 文字列} のいずれかである必要があります'
              );
          });
      }
      Object.keys(r).forEach(k => {
        if (KNOWN_FIELDS.indexOf(k) < 0) Wn(k, '未知のフィールドです(綴りミス?)');
      });

      // 品詞ごとの文法チェック
      const pos = isStr(r.pos) && r.pos ? r.pos : r.art || r.g ? 'noun' : '';
      if (!r.pos && !pos) Wn('pos', '品詞(pos)が未指定です(名詞以外は指定してください)');
      if (!r.level) Wn('level', '学習レベル(level)が未指定です(A1〜C2)');
      if (pos === 'noun') {
        if (r.g !== 'm' && r.g !== 'f')
          E('g', '名詞には性(m か f)が必要です: ' + JSON.stringify(r.g));
        if (!hasArt) E('art', "名詞には冠詞(le/la/l'/un/une/les/des)が必要です");
        else if (!Object.prototype.hasOwnProperty.call(ARTICLES, r.art))
          E(
            'art',
            '不正な冠詞です: ' +
              JSON.stringify(r.art) +
              '(使える値: ' +
              Object.keys(ARTICLES).join(', ') +
              ')'
          );
        else {
          const exp = ARTICLES[r.art];
          if (exp && (r.g === 'm' || r.g === 'f') && r.g !== exp)
            E(
              'g',
              '冠詞 "' +
                r.art +
                '" と性 "' +
                r.g +
                '" が矛盾しています(' +
                r.art +
                ' は ' +
                exp +
                ' 用)'
            );
          // 冠詞の省略(l')の確認。判定できない語('unknown')は正誤を断定せず、何も出さない
          if (hasFr) {
            const c = checkArticle(r.art, r.fr);
            if (c.level === 'error') E('art', c.message);
            else if (c.level === 'warn') Wn('art', c.message);
          }
        }
      } else {
        if (hasArt) E('art', '名詞以外には冠詞を付けられません(品詞: ' + (pos || '未指定') + ')');
        if (hasG) Wn('g', '名詞以外に性が指定されています(品詞: ' + (pos || '未指定') + ')');
      }
      if (pos === 'verb' && hasFr && !/(er|ir|re|oir)$/.test(r.fr))
        Wn('fr', '動詞は不定詞(-er/-ir/-re/-oir)で登録するのが基本です: ' + r.fr);
      // 例文に単語が含まれているか(動詞・形容詞は活用・一致で変わるので対象外)
      if (hasFr && hasEx && pos !== 'verb' && pos !== 'adjective') {
        const k = fold(r.ex),
          cands = [r.fr].concat(
            isPlain(r.forms)
              ? Object.keys(r.forms)
                  .reduce((a, f) => a.concat(r.forms[f]), [])
                  .filter(isStr)
              : []
          );
        if (!cands.some(c => k.indexOf(fold(c)) >= 0))
          Wn('ex', '例文に単語(' + r.fr + ')が見つかりません');
      }
      // 重複しやすい組み合わせ
      if (hasFr && hasJa && isStr(r.id)) {
        const fk = fold(display({ art: isStr(r.art) ? r.art : '', fr: r.fr })),
          jk = fold(r.ja);
        if (frKey.has(fk))
          Wn(
            'fr',
            'フランス語表記が ' +
              frKey.get(fk) +
              ' と同じです: ' +
              display({ art: r.art || '', fr: r.fr })
          );
        else frKey.set(fk, r.id);
        if (jaKey.has(jk))
          Wn('ja', '日本語訳が ' + jaKey.get(jk) + ' と同じです(出題が曖昧になる可能性): ' + r.ja);
        else jaKey.set(jk, r.id);
      }
    });

    // 出題テスト: 正常なレコードすべてについて、両方向で4択を作れるか
    if (opts.quizCheck !== false) {
      const ok = words.filter((r, i) => !bad.has(i)).map(normalize);
      const idx = new Map();
      words.forEach((r, i) => {
        if (r && r.id) idx.set(r.id, i);
      });
      if (ok.length < CHOICES)
        add(
          'error',
          -1,
          '(全体)',
          'WORDS',
          '出題には最低' + CHOICES + '語が必要です(現在 ' + ok.length + '語)'
        );
      else
        ok.forEach(w =>
          ['toFr', 'toJa'].forEach(mode => {
            checkQuestion(makeQuestion(w, mode, ok)).forEach(p =>
              add(
                'error',
                idx.get(w.id),
                w.id,
                'quiz(' + (mode === 'toFr' ? '日→仏' : '仏→日') + ')',
                p
              )
            );
          })
        );
    }
    return {
      errors: issues.filter(x => x.level === 'error'),
      warnings: issues.filter(x => x.level === 'warn'),
      badIndexes: bad
    };
  }
  const formatIssue = x => '[' + x.id + '] ' + x.field + ': ' + x.message;

  // ゲーム用: 検証し、エラーのあるレコードを除外して正規化済みの配列を返す(起動を止めない)
  function prepare(words, opts) {
    const rep = validate(words, Object.assign({ quizCheck: false }, opts || {}));
    const list = Array.isArray(words)
      ? words.filter((r, i) => !rep.badIndexes.has(i)).map(normalize)
      : [];
    return {
      words: list,
      errors: rep.errors,
      warnings: rep.warnings,
      excluded: Array.isArray(words) ? words.length - list.length : 0
    };
  }

  return {
    POS,
    LEVELS,
    ARTICLES,
    CHOICES,
    checkArticle,
    elisionOf,
    RANKERS,
    display,
    jaSet,
    canShowImage,
    shuffle,
    fold,
    search,
    paginate,
    facets,
    normalize,
    makeQuestion,
    checkQuestion,
    validate,
    formatIssue,
    prepare
  };
});
