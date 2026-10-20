/* phraselib.js — 構文トレーニングのロジック(画面から独立。DOM・localStorage には触りません)
   ブラウザでは window.PhraseLib、Node では require('./phraselib.js') で使えます。
   含むもの: 教材の検証 / 3形式の問題生成と採点 / 語順カードの操作 / 構文ごとの学習記録 /
   復習・出題の選び方 / 報酬ルール / 検索 / 保存データの整形 */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.PhraseLib = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 定数 ---------- */
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const FORMATS = ['choice', 'cloze', 'ordering']; // 問題形式
  // 学習技能(意味の理解 / 空欄補充 / 語順整序)。形式と1対1で、別々に集計する
  const SKILLS = ['meaning', 'cloze', 'ordering'];
  const SKILL_OF = { choice: 'meaning', cloze: 'cloze', ordering: 'ordering' };
  const FORMAT_OF = { meaning: 'choice', cloze: 'cloze', ordering: 'ordering' };
  const SKILL_JA = { meaning: '意味', cloze: '空欄', ordering: '語順' };
  // 復習間隔は単語(app.js)と同じ単位(ミリ秒・同じ段階表)。lv0=すぐ / 1=5分 / 2=1日 / 3=3日 / 4=7日
  const MIN = 60000,
    DAY = 86400000,
    INT = [0, 5 * MIN, DAY, 3 * DAY, 7 * DAY];
  /* 報酬(経験値)ルール: 練習し放題で無制限に稼げないよう、「復習の時期が来た(または初めての)
     技能に正解したときだけ」満額。
     時期前の正解は0。誤答の直後に正解しても満額にはならない(わざと間違えて稼ぐことを防ぐ)。
     1日の上限もある。 */
  const REWARD = { correct: 8, recover: 3, miss: 1, session: 10, dailyCap: 120 };
  const KNOWN_FIELDS = [
    'id',
    'level',
    'scene',
    'fr',
    'ja',
    'pattern',
    'chunks',
    'grammarNote',
    'slots',
    'wordIds',
    'cloze',
    'equiv',
    'formats'
  ];
  const MAX_CHUNKS = 8;
  const RE_ID = /^[a-z][a-z0-9_-]{0,31}$/;
  const RE_AFTER = /^ ?[,.;:!?…]+$/;
  const RE_BAD = /[<>&\u0000-\u001f]/;
  const isStr = v => typeof v === 'string';
  const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const num = (x, d) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : d);
  const nonEmpty = v => isStr(v) && v.trim().length > 0;
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

  /* ---------- 文の組み立て(chunks から。空白での単純分割はしない) ---------- */
  // 語句 t + 直後の句読点 after を並べ、語句の間は空白1つ(sp:false の語句の後ろは空白なし)。
  // 最後の語句の後ろに空白は入れない
  const renderList = list =>
    list
      .map((c, i) => c.t + (c.after || '') + (i < list.length - 1 && c.sp !== false ? ' ' : ''))
      .join('');
  const render = p => renderList(p.chunks);
  // chunks[idx] の t だけを text に差し替えた文(空欄文・応用例の生成に使う)
  const renderWith = (p, idx, text) =>
    renderList(p.chunks.map((c, i) => (i === idx ? Object.assign({}, c, { t: text }) : c)));
  // 技能の順(意味→空欄→語順)と同じ
  const defaultFormats = p =>
    ['choice'].concat(
      p.cloze ? ['cloze'] : [],
      p.chunks && p.chunks.length >= 2 ? ['ordering'] : []
    );
  const formatsOf = p =>
    Array.isArray(p.formats) && p.formats.length ? p.formats : defaultFormats(p);
  const skillsOf = p => formatsOf(p).map(f => SKILL_OF[f]);
  const variantOf = (p, slot, opt) => renderWith(p, slot.chunk, opt.t); // 応用例の完成文

  /* ---------- 検証 ---------- */
  function validate(list, opts) {
    opts = opts || {};
    const errors = [],
      warnings = [];
    const wordIds = opts.wordIds ? new Set(opts.wordIds) : null;
    const scenes = opts.scenes ? Object.keys(opts.scenes) : null;
    if (!Array.isArray(list))
      return {
        errors: [{ id: '(全体)', field: '-', message: 'PHRASES は配列にしてください' }],
        warnings
      };
    const seen = new Map(),
      frs = new Map(),
      jas = new Map(),
      ids = new Set();
    list.forEach((r, idx) => {
      if (isPlain(r) && isStr(r.id)) ids.add(r.id);
    });
    list.forEach((r, idx) => {
      const id = isPlain(r) && nonEmpty(r.id) ? r.id : '(#' + (idx + 1) + ')';
      const E = (f, m) => errors.push({ id, field: f, message: m }),
        Wn = (f, m) => warnings.push({ id, field: f, message: m });
      if (!isPlain(r)) {
        E('-', '構文データはオブジェクトにしてください');
        return;
      }
      // id
      if (!isStr(r.id) || !RE_ID.test(r.id))
        E('id', 'id は小文字英字で始まる英数字・_・- (32文字以内)にしてください');
      else if (seen.has(r.id))
        E('id', 'id が重複しています(' + (seen.get(r.id) + 1) + '番目と' + (idx + 1) + '番目)');
      else seen.set(r.id, idx);
      // 必須の文字列
      ['fr', 'ja', 'scene', 'pattern', 'grammarNote', 'level'].forEach(f => {
        if (!nonEmpty(r[f])) E(f, f + ' が未入力です');
        else if (RE_BAD.test(r[f])) E(f, f + ' に使えない文字(< > & や制御文字)が含まれています');
      });
      if (nonEmpty(r.level) && LEVELS.indexOf(r.level) < 0)
        E('level', 'level が不正です: ' + r.level + '(' + LEVELS.join('/') + ')');
      if (nonEmpty(r.scene) && scenes && scenes.indexOf(r.scene) < 0)
        E('scene', 'scene が PHRASE_SCENES にありません: ' + r.scene);
      if (isStr(r.grammarNote) && r.grammarNote.length > 140)
        Wn('grammarNote', '文法解説が長すぎます(140文字以内を推奨)');
      if (isStr(r.fr)) {
        if (frs.has(r.fr)) E('fr', '同じ完成文が重複しています(' + frs.get(r.fr) + ')');
        else frs.set(r.fr, id);
      }
      if (isStr(r.ja)) {
        if (jas.has(r.ja) && !(Array.isArray(r.equiv) && r.equiv.indexOf(jas.get(r.ja)) >= 0))
          Wn('ja', '同じ日本語訳の構文があります(' + jas.get(r.ja) + ')');
        else jas.set(r.ja, id);
      }
      // chunks
      let chunksOk = false;
      if (!Array.isArray(r.chunks) || !r.chunks.length) E('chunks', 'chunks(語句の配列)が必要です');
      else if (r.chunks.length > MAX_CHUNKS)
        E('chunks', 'chunks が多すぎます(' + MAX_CHUNKS + '個まで)');
      else {
        chunksOk = true;
        r.chunks.forEach((c, i) => {
          const at = 'chunks[' + i + ']';
          if (!isPlain(c)) {
            E(at, '語句はオブジェクトにしてください');
            chunksOk = false;
            return;
          }
          if (!nonEmpty(c.t)) {
            E(at + '.t', '語句(t)が空です');
            chunksOk = false;
          } else if (RE_BAD.test(c.t) || c.t !== c.t.trim()) {
            E(at + '.t', '語句(t)に使えない文字、または前後の空白があります');
            chunksOk = false;
          }
          if (!nonEmpty(c.ja)) E(at + '.ja', '語句の意味(ja)が空です');
          if (c.after !== undefined && (!isStr(c.after) || !RE_AFTER.test(c.after))) {
            E(at + '.after', 'after は句読点だけにしてください(例: "," "." " ?")');
            chunksOk = false;
          }
          if (c.sp !== undefined && typeof c.sp !== 'boolean')
            E(at + '.sp', 'sp は true/false にしてください');
        });
        if (chunksOk && isStr(r.fr) && render(r) !== r.fr)
          E(
            'chunks',
            'chunks を連結した文と fr が一致しません: 「' + render(r) + '」≠「' + r.fr + '」'
          );
      }
      // formats
      let fmts = null;
      if (r.formats !== undefined) {
        if (!Array.isArray(r.formats) || !r.formats.length)
          E('formats', 'formats は空でない配列にしてください');
        else {
          fmts = r.formats;
          r.formats.forEach(f => {
            if (FORMATS.indexOf(f) < 0) E('formats', '不正な問題形式です: ' + f);
          });
          if (fmts.indexOf('choice') < 0) E('formats', "formats には 'choice' を含めてください");
        }
      }
      const fl =
        fmts ||
        (isPlain(r)
          ? defaultFormats({ chunks: Array.isArray(r.chunks) ? r.chunks : [], cloze: r.cloze })
          : []);
      if (fl.indexOf('ordering') >= 0 && (!Array.isArray(r.chunks) || r.chunks.length < 2))
        E('formats', '語順整序には chunks が2つ以上必要です');
      if (fl.indexOf('cloze') >= 0 && !isPlain(r.cloze))
        E('cloze', "formats に 'cloze' がありますが cloze データがありません");
      // cloze
      if (r.cloze !== undefined) {
        const z = r.cloze;
        if (!isPlain(z)) E('cloze', 'cloze はオブジェクトにしてください');
        else {
          const ch = chunksOk && Number.isInteger(z.chunk) ? r.chunks[z.chunk] : null;
          if (
            !Number.isInteger(z.chunk) ||
            !Array.isArray(r.chunks) ||
            z.chunk < 0 ||
            z.chunk >= r.chunks.length
          )
            E('cloze.chunk', '空欄の位置(chunk)が範囲外です');
          ['pre', 'post'].forEach(f => {
            if (!isStr(z[f])) E('cloze.' + f, f + ' は文字列(空でもよい)にしてください');
          });
          if (!nonEmpty(z.answer)) E('cloze.answer', '正解(answer)が空です');
          if (
            ch &&
            isStr(z.pre) &&
            isStr(z.post) &&
            isStr(z.answer) &&
            z.pre + z.answer + z.post !== ch.t
          )
            E('cloze', 'pre + answer + post が chunks[' + z.chunk + '].t と一致しません');
          if (!Array.isArray(z.options)) E('cloze.options', '候補(options)が必要です');
          else {
            if (z.options.some(o => !nonEmpty(o))) E('cloze.options', '空の候補があります');
            const u = new Set(z.options);
            if (u.size !== z.options.length) E('cloze.options', '候補に重複があります');
            if (z.options.length < 3) E('cloze.options', '候補は3つ以上にしてください');
            const hit = z.options.filter(o => o === z.answer).length;
            if (hit !== 1)
              E('cloze.options', '正解(answer)が候補にちょうど1つ含まれていません(' + hit + '個)');
            if (ch && isStr(z.pre) && isStr(z.post))
              z.options
                .filter(o => isStr(o) && o !== z.answer)
                .forEach(o => {
                  if (renderWith(r, z.chunk, z.pre + o + z.post) === r.fr)
                    E('cloze.options', '誤答の候補「' + o + '」を入れても正解の文になります');
                });
          }
        }
      }
      // slots
      if (r.slots !== undefined) {
        if (!Array.isArray(r.slots)) E('slots', 'slots は配列にしてください');
        else
          r.slots.forEach((s, i) => {
            const at = 'slots[' + i + ']';
            if (!isPlain(s)) {
              E(at, 'slot はオブジェクトにしてください');
              return;
            }
            if (
              !Number.isInteger(s.chunk) ||
              !Array.isArray(r.chunks) ||
              s.chunk < 0 ||
              s.chunk >= r.chunks.length
            )
              E(at + '.chunk', '入れ替える語句の位置(chunk)が範囲外です');
            if (!nonEmpty(s.label)) E(at + '.label', 'label が空です');
            if (!Array.isArray(s.options) || !s.options.length)
              E(at + '.options', '入れ替え候補(options)が必要です');
            else
              s.options.forEach((o, j) => {
                if (!isPlain(o) || !nonEmpty(o.t) || !nonEmpty(o.ja)) {
                  E(at + '.options[' + j + ']', '候補には t と ja が必要です');
                  return;
                }
                if (RE_BAD.test(o.t) || RE_BAD.test(o.ja))
                  E(at + '.options[' + j + ']', '使えない文字が含まれています');
                if (o.wordId !== undefined && wordIds && !wordIds.has(o.wordId))
                  E(at + '.options[' + j + '].wordId', '存在しない単語IDです: ' + o.wordId);
                if (
                  chunksOk &&
                  Number.isInteger(s.chunk) &&
                  s.chunk >= 0 &&
                  s.chunk < r.chunks.length &&
                  renderWith(r, s.chunk, o.t) === r.fr
                )
                  Wn(at + '.options[' + j + ']', '元の文と同じ応用例です');
              });
          });
      }
      // wordIds / equiv
      if (r.wordIds !== undefined) {
        if (!Array.isArray(r.wordIds)) E('wordIds', 'wordIds は配列にしてください');
        else
          r.wordIds.forEach(w => {
            if (!isStr(w)) E('wordIds', '単語IDは文字列にしてください');
            else if (wordIds && !wordIds.has(w))
              E('wordIds', '存在しない単語IDを参照しています: ' + w);
          });
      }
      if (r.equiv !== undefined) {
        if (!Array.isArray(r.equiv)) E('equiv', 'equiv は配列にしてください');
        else
          r.equiv.forEach(q => {
            if (q === r.id) E('equiv', '自分自身は指定できません');
            else if (!ids.has(q)) E('equiv', '存在しない構文IDです: ' + q);
          });
      }
      Object.keys(r).forEach(k => {
        if (KNOWN_FIELDS.indexOf(k) < 0) Wn(k, '未知のフィールドです(無視されます)');
      });
    });
    // equiv は相互に指定する(片方だけだと、もう一方の選択問題で同義文が誤答に出る)
    const byId = new Map(list.filter(r => isPlain(r) && isStr(r.id)).map(r => [r.id, r]));
    list.forEach(r => {
      if (isPlain(r) && Array.isArray(r.equiv))
        r.equiv.forEach(q => {
          const o = byId.get(q);
          if (o && !(Array.isArray(o.equiv) && o.equiv.indexOf(r.id) >= 0))
            warnings.push({
              id: r.id,
              field: 'equiv',
              message: q + ' の equiv にも ' + r.id + ' を指定してください'
            });
        });
    });
    if (list.length < 4)
      warnings.push({
        id: '(全体)',
        field: '-',
        message: '構文が4つ未満です。完成文の選択問題の選択肢が少なくなります'
      });
    return { errors, warnings };
  }
  const formatIssue = x =>
    x.id + (x.field && x.field !== '-' ? '.' + x.field : '') + ': ' + x.message;
  // 既定値をそろえた構文データ(読み取り専用の扱い)
  function normalize(p) {
    return {
      id: p.id,
      level: p.level,
      scene: p.scene,
      fr: p.fr,
      ja: p.ja,
      pattern: p.pattern,
      grammarNote: p.grammarNote,
      chunks: p.chunks.map(c => ({ t: c.t, ja: c.ja, after: c.after || '', sp: c.sp !== false })),
      cloze: p.cloze
        ? {
            chunk: p.cloze.chunk,
            pre: p.cloze.pre,
            answer: p.cloze.answer,
            post: p.cloze.post,
            options: p.cloze.options.slice()
          }
        : null,
      slots: (p.slots || []).map(s => ({
        chunk: s.chunk,
        label: s.label,
        options: s.options.map(o => ({ t: o.t, ja: o.ja, wordId: o.wordId || null }))
      })),
      wordIds: (p.wordIds || []).slice(),
      equiv: (p.equiv || []).slice(),
      formats: formatsOf(p).slice()
    };
  }
  // 検証してエラーのある構文を除外し、正規化した一覧を返す(起動を止めない)
  function prepare(list, opts) {
    const rep = validate(list, opts),
      bad = new Set(rep.errors.map(e => e.id));
    const ok = Array.isArray(list)
      ? list.filter((r, i) => isPlain(r) && !bad.has(nonEmpty(r.id) ? r.id : '(#' + (i + 1) + ')'))
      : [];
    return {
      phrases: ok.map(normalize),
      errors: rep.errors,
      warnings: rep.warnings,
      excluded: Array.isArray(list) ? list.length - ok.length : 0
    };
  }

  /* ---------- 問題生成 ---------- */
  // 完成文の選択: 日本語訳 → フランス語の完成文。誤答は「同じ場面を優先」し、
  // 同じ文・同じ訳・言い換え(equiv)の構文は出さない
  function makeChoice(p, pool, o) {
    o = o || {};
    const rng = o.rng || Math.random;
    const eq = new Set(p.equiv || []);
    const cand = shuffle(
      pool.filter(
        x =>
          x.id !== p.id &&
          x.fr !== p.fr &&
          x.ja !== p.ja &&
          !eq.has(x.id) &&
          !(x.equiv || []).includes(p.id)
      ),
      rng
    );
    // 安定ソート: 同じ場面が先、各グループ内はランダム
    cand.sort((a, b) => (a.scene === p.scene ? 0 : 1) - (b.scene === p.scene ? 0 : 1));
    const seen = new Set([p.fr]),
      picks = [];
    for (const c of cand) {
      if (!seen.has(c.fr)) {
        seen.add(c.fr);
        picks.push(c);
        if (picks.length === 3) break;
      }
    }
    if (!picks.length) return null;
    return {
      kind: 'choice',
      format: 'choice',
      skill: 'meaning',
      p,
      scene: p.scene,
      prompt: p.ja,
      opts: shuffle(
        picks
          .map(x => ({ t: x.fr, ok: false, id: x.id }))
          .concat([{ t: p.fr, ok: true, id: p.id }]),
        rng
      )
    };
  }
  // 空欄補充: cloze データの位置を空欄にした文(___)と、候補。正誤は候補の値で判定する
  function makeCloze(p, o) {
    o = o || {};
    const rng = o.rng || Math.random,
      z = p.cloze;
    if (!z) return null;
    return {
      kind: 'cloze',
      format: 'cloze',
      skill: 'cloze',
      p,
      prompt: p.ja,
      sentence: renderWith(p, z.chunk, z.pre + '___' + z.post),
      opts: shuffle(
        z.options.map(t => ({ t, ok: t === z.answer })),
        rng
      )
    };
  }
  const clozeFilled = (p, text) => renderWith(p, p.cloze.chunk, p.cloze.pre + text + p.cloze.post);
  // 語順整序: 語句カード(cid は chunks の番号から一意に付ける。
  // 同じ文字列のカードが複数あっても別物)。最初から正解の並びにはしない
  function makeOrdering(p, o) {
    o = o || {};
    const rng = o.rng || Math.random;
    if (!p.chunks || p.chunks.length < 2) return null;
    const cards = p.chunks.map((c, i) => ({ cid: 'c' + i, i, t: c.t }));
    const same = a => a.every((c, i) => c.t === cards[i].t);
    let sh = shuffle(cards, rng);
    for (let n = 0; n < 30 && same(sh); n++) sh = shuffle(cards, rng);
    return { kind: 'ordering', format: 'ordering', skill: 'ordering', p, prompt: p.ja, cards: sh };
  }
  function makeQuestion(p, format, pool, o) {
    return format === 'choice'
      ? makeChoice(p, pool, o)
      : format === 'cloze'
        ? makeCloze(p, o)
        : format === 'ordering'
          ? makeOrdering(p, o)
          : null;
  }
  // 選択・空欄の採点(選択肢の番号)。問題データの ok を信頼せず、空欄は文を組み立て直して確かめる
  function checkChoice(q, i) {
    const o = q.opts[i];
    return !!(o && o.ok && o.id === q.p.id);
  }
  function checkCloze(q, i) {
    const o = q.opts[i];
    return !!(o && o.t === q.p.cloze.answer && clozeFilled(q.p, o.t) === q.p.fr);
  }
  // 語順カード(sel = 選んだ cid の配列。元の配列は変更せず新しい配列を返す)
  const orderingAdd = (q, sel, cid) =>
    q.cards.some(c => c.cid === cid) && sel.indexOf(cid) < 0 ? sel.concat([cid]) : sel.slice();
  const orderingRemove = (q, sel, cid) => sel.filter(x => x !== cid);
  const orderingReset = () => [];
  const cardOf = (q, cid) => q.cards.find(c => c.cid === cid);
  const orderingList = (q, sel) =>
    sel
      .map(cid => cardOf(q, cid))
      .filter(Boolean)
      .map(c => q.p.chunks[c.i]);
  const orderingText = (q, sel) => renderList(orderingList(q, sel)); // いま並べている文(句読点つき)
  // 正誤は「全カードを使い、できた文が教材の完成文と一致する」で判定。
  // 同じ語句のカードどうしの入れ替えは正解になる
  const orderingCheck = (q, sel) =>
    sel.length === q.cards.length &&
    new Set(sel).size === sel.length &&
    orderingText(q, sel) === q.p.fr;

  /* ---------- 学習記録(構文ごと。単語の記録 state.w とは別の state.ph に保存する) ----------
     構文: { intro:0|1, n, ok, ng, st(連続正解), last(直近 1正解/0誤答/null), at(最終学習時刻ms),
     due(次回復習時刻ms。回答済みの技能で最も早いもの), sk:{ meaning, cloze, ordering } }
     技能データ(sk の各値): lv(0-4) n ok ng st last due ──
     問題形式ごとの出題回数・正答回数はここ(形式と技能は1対1) */
  const newSkill = () => ({ lv: 0, n: 0, ok: 0, ng: 0, st: 0, last: null, due: 0 });
  const newRec = () => ({
    intro: 0,
    n: 0,
    ok: 0,
    ng: 0,
    st: 0,
    last: null,
    at: 0,
    due: 0,
    sk: { meaning: newSkill(), cloze: newSkill(), ordering: newSkill() }
  });
  const lastOf = v => (v === 1 ? 1 : v === 0 ? 0 : null);
  function cleanSkill(d) {
    const o = newSkill();
    if (!isPlain(d)) return o;
    o.lv = Math.min(4, Math.floor(num(d.lv, 0)));
    o.n = Math.floor(num(d.n, 0));
    o.ok = Math.min(o.n, Math.floor(num(d.ok, 0)));
    o.ng = Math.min(o.n - o.ok, Math.floor(num(d.ng, 0)));
    o.st = Math.min(o.ok, Math.floor(num(d.st, 0)));
    o.last = lastOf(d.last);
    o.due = num(d.due, 0);
    if (o.n === 0) {
      o.lv = 0;
      o.st = 0;
      o.last = null;
      o.due = 0;
    }
    return o;
  }
  function cleanRec(r) {
    // 不正な値は安全な初期値にする。回答のない記録は intro だけを残す
    const o = newRec();
    if (!isPlain(r)) return o;
    const sk = isPlain(r.sk) ? r.sk : {};
    SKILLS.forEach(k => {
      o.sk[k] = cleanSkill(sk[k]);
    });
    o.n = SKILLS.reduce((a, k) => a + o.sk[k].n, 0);
    o.ok = SKILLS.reduce((a, k) => a + o.sk[k].ok, 0);
    o.ng = SKILLS.reduce((a, k) => a + o.sk[k].ng, 0);
    o.intro = r.intro || o.n > 0 ? 1 : 0;
    o.st = Math.min(o.ok, Math.floor(num(r.st, 0)));
    o.last = o.n ? lastOf(r.last) : null;
    o.at = o.n ? num(r.at, 0) : 0;
    o.due = dueOf(o);
    return o;
  }
  function dueOf(rec) {
    const ds = SKILLS.map(k => rec.sk[k])
      .filter(d => d.n > 0)
      .map(d => d.due);
    return ds.length ? Math.min.apply(null, ds) : 0;
  }
  // { 構文ID: 記録 }。不明な構文IDの記録も残す(教材を一時的に外しても履歴を失わない)
  function cleanState(src) {
    const out = {};
    if (!isPlain(src)) return out;
    Object.keys(src).forEach(id => {
      if (id !== '__proto__' && RE_ID.test(id)) out[id] = cleanRec(src[id]);
    });
    return out;
  }
  const dayKey = ms => {
    const d = new Date(ms);
    return (
      String(d.getFullYear()) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0')
    );
  };
  function cleanDaily(x) {
    return isPlain(x) && isStr(x.d) && /^\d{8}$/.test(x.d)
      ? { d: x.d, xp: Math.min(REWARD.dailyCap, Math.floor(num(x.xp, 0))) }
      : { d: '', xp: 0 };
  }

  // 回答を記録する(rec を直接更新)。正解でも時期前なら段階は上がらない。
  // 誤答は段階0に戻りすぐ復習対象になる
  function recordAnswer(rec, skill, ok, now) {
    const d = rec.sk[skill];
    rec.intro = 1;
    rec.n++;
    d.n++;
    rec.at = now;
    if (ok) {
      rec.ok++;
      d.ok++;
      rec.st++;
      d.st++;
      rec.last = 1;
      d.last = 1;
      if (now >= d.due) {
        d.lv = Math.min(4, d.lv + 1);
        d.due = now + INT[d.lv];
      }
    } else {
      rec.ng++;
      d.ng++;
      rec.st = 0;
      d.st = 0;
      rec.last = 0;
      d.last = 0;
      d.lv = 0;
      d.due = now;
    }
    rec.due = dueOf(rec);
    return rec;
  }
  // この回答で得られる経験値(記録する前の技能データで判定)。firstMiss=この構文・技能でこのセッショ
  // ン初めての誤答か
  function rewardFor(d, ok, now, firstMiss) {
    if (ok)
      return d.n === 0 || (d.last !== 0 && now >= d.due)
        ? REWARD.correct
        : d.last === 0
          ? REWARD.recover
          : 0;
    return firstMiss ? REWARD.miss : 0;
  }
  // 1日の上限を適用して、実際に付与する経験値を返す(daily は { d, xp } を直接更新)
  function capDaily(daily, xp, now) {
    const k = dayKey(now);
    if (daily.d !== k) {
      daily.d = k;
      daily.xp = 0;
    }
    const g = Math.max(0, Math.min(xp, REWARD.dailyCap - daily.xp));
    daily.xp += g;
    return g;
  }

  /* ---------- 状態・復習・出題の選び方 ---------- */
  const dueSkill = (d, now) => d.n > 0 && (d.last === 0 || d.due <= now);
  function status(rec, p, now) {
    if (!rec || !rec.intro) return 'new';
    const ds = skillsOf(p).map(k => rec.sk[k]);
    if (ds.some(d => dueSkill(d, now))) return 'review';
    return ds.every(d => d.lv >= 2 && d.last !== 0) ? 'mastered' : 'learning';
  }
  const masteredCount = (phrases, recs, now) =>
    phrases.filter(p => status(recs[p.id], p, now) === 'mastered').length;
  const accuracy = d => (d.n ? d.ok / d.n : 0);
  // 次に出す技能: 復習なら期限の来た技能のうち「正答率が低い→段階が低い」順。
  // 学習なら未回答の技能(意味→空欄→語順の順)を先に、次に正答率の低い技能
  function pickSkill(rec, p, now, forReview) {
    const sks = skillsOf(p),
      r = rec || newRec();
    let pool = forReview ? sks.filter(k => dueSkill(r.sk[k], now)) : [];
    if (!pool.length) pool = sks;
    return pool
      .slice()
      .sort(
        (a, b) =>
          (r.sk[a].n === 0 ? 0 : 1) - (r.sk[b].n === 0 ? 0 : 1) ||
          accuracy(r.sk[a]) - accuracy(r.sk[b]) ||
          r.sk[a].lv - r.sk[b].lv ||
          sks.indexOf(a) - sks.indexOf(b)
      )[0];
  }
  function reviewList(phrases, recs, now) {
    // 誤答がある構文 → 段階の低い構文 → 期限の古い構文の順
    return phrases
      .filter(p => status(recs[p.id], p, now) === 'review')
      .map(p => {
        const r = recs[p.id],
          ds = skillsOf(p)
            .map(k => r.sk[k])
            .filter(d => dueSkill(d, now));
        return {
          p,
          k: [
            ds.some(d => d.last === 0) ? 0 : 1,
            Math.min.apply(
              null,
              ds.map(d => d.lv)
            ),
            Math.min.apply(
              null,
              ds.map(d => d.due)
            )
          ]
        };
      })
      .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2])
      .map(x => x.p);
  }
  function nextDueList(phrases, recs, limit) {
    return phrases
      .filter(p => recs[p.id] && recs[p.id].intro && recs[p.id].n > 0)
      .map(p => ({ p, t: recs[p.id].due }))
      .sort((a, b) => a.t - b.t)
      .slice(0, limit || 4);
  }
  /* セッションの問題リスト [{ pid, skill }]。
     learn : 場面内の新しい構文を最大2つ(レベルが低い順、同レベルでは習得済みの単語を含むものを優先)
     。各構文で 意味→空欄→語順 の全形式を、構文を交互に出す。新しい構文がなければ学習中・復習待ちの
     低い順に4つ(各1問)
     review: 復習待ちの構文を最大6つ(各1問・期限の来た技能のうち苦手なもの)。o.scene で絞れるが、
     画面の復習は全場面を対象にする(件数表示と一致させるため) */
  function buildQueue(phrases, recs, o) {
    o = o || {};
    const now = o.now == null ? Date.now() : o.now,
      kind = o.kind || 'learn';
    const inScene = phrases.filter(p => !o.scene || o.scene === 'all' || p.scene === o.scene);
    if (kind === 'review')
      return reviewList(inScene, recs, now)
        .slice(0, o.count || 6)
        .map(p => ({ pid: p.id, skill: pickSkill(recs[p.id], p, now, true) }));
    // 新しい構文: レベルの低い順(A1→A2)。同じレベルでは、習得済みの単語を含む構文(o.priority(p)
    // が小さいもの)を先に。それ以外はデータの並び順
    const rank = p => [LEVELS.indexOf(p.level), o.priority ? o.priority(p) : 0];
    const fresh = inScene
      .map((p, i) => ({ p, i, k: rank(p) }))
      .filter(x => status(recs[x.p.id], x.p, now) === 'new')
      .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i)
      .slice(0, 2)
      .map(x => x.p);
    if (fresh.length) {
      const items = [];
      SKILLS.forEach(k =>
        fresh.forEach(p => {
          if (skillsOf(p).indexOf(k) >= 0) items.push({ pid: p.id, skill: k });
        })
      );
      return items;
    }
    const order = { review: 0, learning: 1, mastered: 2 };
    return inScene
      .slice()
      .sort((a, b) => order[status(recs[a.id], a, now)] - order[status(recs[b.id], b, now)])
      .slice(0, o.count || 4)
      .map(p => ({ pid: p.id, skill: pickSkill(recs[p.id], p, now, false) }));
  }

  /* ---------- 称号(習得した構文の最大数で決まる。単語の称号とは別) ---------- */
  const TITLES = [
    { n: 3, name: 'ぶんけい見習い' },
    { n: 8, name: 'ぶんけい使い' },
    { n: 15, name: 'ぶんけい名人' },
    { n: 30, name: 'ぶんけい博士' },
    { n: 60, name: 'ぶんけい賢者' }
  ];
  const titleOf = n => TITLES.filter(t => n >= t.n).pop() || null;

  /* ---------- 検索・絞り込み(図鑑) ---------- */
  const fold = s =>
    String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const searchKey = (p, sceneLabel) =>
    fold(
      [p.fr, p.ja, p.pattern, p.grammarNote, sceneLabel || '']
        .concat(p.chunks.map(c => c.t + ' ' + c.ja))
        .join(' ')
    );
  function search(phrases, query, scenes) {
    const q = fold(query).trim();
    if (!q) return phrases.slice();
    const terms = q.split(/\s+/);
    return phrases.filter(p => {
      const k = searchKey(p, scenes && scenes[p.scene]);
      return terms.every(t => k.indexOf(t) >= 0);
    });
  }

  // 構文が参照する単語ID(wordIds と slots の wordId)。単語図鑑から「この単語を使う構文」
  // を探すのに使う
  const wordsOf = p => {
    const a = new Set(p.wordIds || []);
    (p.slots || []).forEach(s =>
      s.options.forEach(o => {
        if (o.wordId) a.add(o.wordId);
      })
    );
    return Array.from(a);
  };

  return {
    LEVELS,
    FORMATS,
    SKILLS,
    SKILL_OF,
    FORMAT_OF,
    SKILL_JA,
    INT,
    REWARD,
    TITLES,
    MAX_CHUNKS,
    render,
    renderWith,
    renderList,
    formatsOf,
    skillsOf,
    variantOf,
    validate,
    formatIssue,
    normalize,
    prepare,
    makeChoice,
    makeCloze,
    makeOrdering,
    makeQuestion,
    clozeFilled,
    checkChoice,
    checkCloze,
    orderingAdd,
    orderingRemove,
    orderingReset,
    orderingText,
    orderingCheck,
    newSkill,
    newRec,
    cleanRec,
    cleanState,
    cleanDaily,
    dayKey,
    recordAnswer,
    rewardFor,
    capDaily,
    status,
    masteredCount,
    pickSkill,
    reviewList,
    nextDueList,
    buildQueue,
    titleOf,
    search,
    shuffle,
    wordsOf
  };
});
