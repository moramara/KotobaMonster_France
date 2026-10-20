'use strict';
// 教材拡充(第2弾: 単語 w135〜w182 / 構文 p61〜p84)のテスト。
// 正確さ : 性・冠詞・活用・形容詞の性数を、データとは独立した正解表で確認する(誤字・性の誤りの検出)
//   連携   : 新しい単語が構文で使われている・構文が特定の語や場面に偏っていない・A1からA2へ段階的
//   出題   : 空欄補充・語順整序の正解が完成文と一致し、誤答候補が正解にならない
//   表示   : BOTおまかせ復習で、新しい単語・構文の正解と解説が正しく出る
//   互換   : 旧版(第2弾より前)の教材で作った学習記録を、今の教材で読み込んでも壊れない
// 「出荷済みの教材の保護」は content_baseline.test.js(baseline_content_r2.json)が行う。
// ここは追加した内容の質を確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootP, plain, realPhrases, lint, playAll, PhraseLib: L } = require('./phrase_boot.js');
const { loadWordData } = require('../scripts/load_words.js');
const { WORD_COUNT, PHRASE_COUNT, RELEASES } = require('./baseline.js');
const WordLib = require('../src/lib/wordlib.js');

const deq = assert.deepEqual;
const WD = plain(loadWordData()),
  WORDS = WD.words,
  { phrases: PH, scenes: SCENES } = realPhrases();
const NW = WORDS.filter(w => Number(w.id.slice(1)) > WORD_COUNT),
  NP = PH.filter(p => Number(p.id.slice(1)) > PHRASE_COUNT);
const R2 = RELEASES[1] ? RELEASES[1].data : { words: [], phrases: [] };
// 第2弾の教材(以降の追加は含めない)
const R2W = NW.filter(w => R2.words.some(b => b.id === w.id)),
  R2P = NP.filter(p => R2.phrases.some(b => b.id === p.id));
const byFr = fr => R2W.find(w => w.fr === fr);
const refs = p => {
  const s = new Set(p.wordIds || []);
  (p.slots || []).forEach(sl => sl.options.forEach(o => o.wordId && s.add(o.wordId)));
  return s;
};

test('第2弾の範囲: 単語48語(w135〜w182)・構文24件(p61〜p84)が、基準ファイルどおりに存在する', () => {
  assert.equal(R2.words.length, 48);
  assert.equal(R2.phrases.length, 24);
  assert.equal(R2W.length, 48);
  assert.equal(R2P.length, 24);
  assert.ok(R2W.length >= 40 && R2W.length <= 60, '単語の追加は40〜60語程度');
  assert.ok(R2P.length >= 15 && R2P.length <= 25, '構文の追加は15〜25件程度');
});

/* ================= 正確さ(独立した正解表) ================= */
test('正確さ: 名詞の冠詞と性(母音・無音のhで始まる語、見た目だけでは性が分からない語を含む)', () => {
  const nouns = {
    mer: ['la', 'f'],
    montagne: ['la', 'f'],
    taxi: ['le', 'm'],
    métro: ['le', 'm'],
    viande: ['la', 'f'],
    chocolat: ['le', 'm'],
    sac: ['le', 'm'],
    'week-end': ['le', 'm'],
    an: ["l'", 'm']
  };
  Object.keys(nouns).forEach(fr => {
    const w = byFr(fr);
    assert.ok(w, fr + ' がある');
    deq([w.art, w.g], nouns[fr], fr + ' の冠詞・性');
  });
  deq(
    R2W.filter(w => !w.pos)
      .map(w => w.fr)
      .sort(),
    Object.keys(nouns).sort(),
    '名詞は上の9語だけ(性の確認漏れがない)'
  );
  const an = byFr('an');
  assert.equal(an.art, "l'", "an は母音で始まるので l'");
  assert.equal(an.g, 'm', "冠詞が l' でも性は男性(見た目では分からない)");
  assert.equal(WordLib.checkArticle(an).ok !== false, true);
  R2W.filter(w => !w.pos).forEach(w =>
    assert.ok(WordLib.checkArticle(w).ok !== false, w.fr + ' の冠詞が語頭と合う')
  );
});
test('正確さ: 動詞は不定詞で登録し、現在形6人称の活用が正しい(綴りの変化・不規則活用を含む)', () => {
  const V = {
    lire: 'je lis, tu lis, il lit, nous lisons, vous lisez, ils lisent',
    regarder: 'je regarde, tu regardes, il regarde, nous regardons, vous regardez, ils regardent',
    acheter: "j'achète, tu achètes, il achète, nous achetons, vous achetez, ils achètent",
    chercher: 'je cherche, tu cherches, il cherche, nous cherchons, vous cherchez, ils cherchent',
    ouvrir: "j'ouvre, tu ouvres, il ouvre, nous ouvrons, vous ouvrez, ils ouvrent",
    partir: 'je pars, tu pars, il part, nous partons, vous partez, ils partent'
  };
  Object.keys(V).forEach(fr => {
    const w = byFr(fr);
    assert.equal(w.pos, 'verb', fr);
    assert.equal(w.forms.present, V[fr], fr + ' の活用');
    assert.match(fr, /(er|ir|re)$/, '不定詞の形');
  });
  deq(
    R2W.filter(w => w.pos === 'verb')
      .map(w => w.fr)
      .sort(),
    Object.keys(V).sort(),
    '動詞は上の6語だけ(活用の確認漏れがない)'
  );
});
test('正確さ: 形容詞は 女性形・男性複数形・女性複数形 が正しい(綴りの規則どおり)', () => {
  const A = {
    nouveau: ['nouvelle', 'nouveaux', 'nouvelles'],
    beau: ['belle', 'beaux', 'belles'],
    cher: ['chère', 'chers', 'chères'],
    gentil: ['gentille', 'gentils', 'gentilles'],
    ouvert: ['ouverte', 'ouverts', 'ouvertes'],
    fermé: ['fermée', 'fermés', 'fermées']
  };
  Object.keys(A).forEach(fr => {
    const w = byFr(fr);
    assert.equal(w.pos, 'adjective', fr);
    deq([w.forms.fem, w.forms.mp, w.forms.fp], A[fr], fr + ' の女性形・男性複数形・女性複数形');
    assert.equal(w.art, '');
    assert.equal(w.g, '');
  });
  deq(
    R2W.filter(w => w.pos === 'adjective')
      .map(w => w.fr)
      .sort(),
    Object.keys(A).sort(),
    '形容詞は上の6語だけ'
  );
});
test('正確さ: 代名詞・前置詞・接続詞・副詞・数詞は、冠詞・性をもたず、品詞・レベルが適切', () => {
  const POS = {
    pronoun: ['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles'],
    preposition: ['dans', 'sur', 'sous', 'devant', 'pour', 'en', 'près de', 'loin de'],
    conjunction: ['parce que'],
    adverb: ['maintenant', 'trop', 'toujours', 'parfois', 'jamais'],
    numeral: ['deux', 'trois', 'cinq', 'dix', 'vingt']
  };
  Object.keys(POS).forEach(pos => {
    deq(
      R2W.filter(w => w.pos === pos)
        .map(w => w.fr)
        .sort(),
      POS[pos].slice().sort(),
      pos + ' の語'
    );
    R2W.filter(w => w.pos === pos).forEach(w => {
      assert.equal(w.art, '');
      assert.equal(w.g, '');
    });
  });
  deq(
    R2W.filter(w => w.level === 'A2')
      .map(w => w.fr)
      .sort(),
    ['jamais', 'loin de', 'parce que', 'parfois', 'partir', 'près de', 'toujours', 'trop'],
    'A2 は A1 から一歩進んだ語だけ(8語)'
  );
  assert.equal(R2W.filter(w => w.level === 'A1').length, 40);
  R2W.forEach(w => assert.ok(['A1', 'A2'].includes(w.level), w.fr + ' のレベル'));
  assert.ok(
    byFr('vous').note.includes('丁寧') || byFr('vous').note.includes('ていねい'),
    'tu と vous の使い分けを説明している'
  );
  assert.ok(byFr('tu').note.includes('vous'));
});
test('正確さ: 発音(カタカナ)は補助情報。すべての語に例文と日本語訳があり、フランス語表記・日本語訳が主の情報になっている', () => {
  R2W.forEach(w => {
    assert.ok(w.ex && w.exJa, w.fr + ' の例文・訳');
    assert.match(w.kana, /^[\u30A0-\u30FF\s・\-ー']+$/, w.fr + ' のカタカナ');
    assert.ok(w.ja.length >= 1 && /[\u3040-\u30FF\u4E00-\u9FFF]/.test(w.ja), w.fr + ' の日本語訳');
    assert.ok(!('ipa' in w) || typeof w.ipa === 'string');
  });
  R2W.filter(w => w.emoji).forEach(w => assert.ok(!w.pos, w.fr + ': 絵文字は名詞だけ'));
});

/* ================= 単語と構文の連携・偏り ================= */
test('連携: 第2弾の単語は、すべて構文(wordIds または応用例 slots)で使われている', () => {
  const used = new Set();
  PH.forEach(p => refs(p).forEach(id => used.add(id)));
  const unused = R2W.filter(w => !used.has(w.id)).map(w => w.fr);
  deq(unused, [], '構文で使われていない新しい単語');
  const direct = new Set();
  R2P.forEach(p => (p.wordIds || []).forEach(id => direct.add(id)));
  assert.ok(
    R2W.filter(w => direct.has(w.id)).length >= 25,
    'wordIds で直接参照している語が十分ある(slots だけに頼らない)'
  );
});
test('連携: 第2弾の構文は、第2弾の単語と既存の基本単語の両方を使い、参照先はすべて実在する', () => {
  const ids = new Set(WORDS.map(w => w.id));
  let fromNew = 0,
    fromOld = 0;
  R2P.forEach(p => {
    assert.ok((p.wordIds || []).length >= 2, p.id + ': wordIds');
    assert.equal(new Set(p.wordIds).size, p.wordIds.length, p.id + ': 参照の重複');
    refs(p).forEach(id => {
      assert.ok(ids.has(id), p.id + ' が存在しない単語 ' + id + ' を参照');
      if (Number(id.slice(1)) > WORD_COUNT) fromNew++;
      else fromOld++;
    });
  });
  assert.ok(
    fromNew >= 60 && fromOld >= 60,
    '新旧の語がつながっている: 新 ' + fromNew + ' / 旧 ' + fromOld
  );
  const oldUsed = new Set();
  R2P.forEach(p =>
    refs(p).forEach(id => {
      if (Number(id.slice(1)) <= WORD_COUNT) oldUsed.add(id);
    })
  );
  assert.ok(oldUsed.size >= 25, '既存の基本単語を ' + oldUsed.size + ' 語使っている');
});
test('偏り: 構文は8場面すべてにあり、特定の場面・単語・文法項目に偏らない。A1からA2へ段階的(A1が主、A2が3割前後)', () => {
  const cnt = a => a.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {}),
    sc = cnt(R2P.map(p => p.scene));
  ['greeting', 'ask', 'shop', 'daily', 'plan', 'travel', 'routine', 'talk'].forEach(k =>
    assert.ok(sc[k] >= 1, k + ' に追加がある')
  );
  assert.ok(
    Math.max.apply(null, Object.values(sc)) <= Math.ceil(R2P.length * 0.25),
    '1つの場面に4分の1を超えて集中しない: ' + JSON.stringify(sc)
  );
  const a2 = R2P.filter(p => p.level === 'A2').length;
  assert.ok(
    a2 >= 5 && a2 <= Math.floor(R2P.length * 0.4) && R2P.length - a2 > a2,
    'A1 が主・A2 が3〜4割: A2=' + a2
  );
  const wc = cnt([].concat(...R2P.map(p => p.wordIds || [])));
  assert.ok(
    Math.max.apply(null, Object.values(wc)) <= Math.ceil(R2P.length * 0.2),
    '1つの単語が wordIds の2割を超えて集中しない: ' + JSON.stringify(wc)
  );
  assert.equal(
    new Set(R2P.map(p => p.pattern)).size,
    R2P.length,
    '文法の型(pattern)がすべて異なる'
  );
  assert.equal(new Set(R2P.map(p => p.ja)).size, R2P.length);
  R2P.forEach(p => {
    assert.ok(p.pattern && p.grammarNote && p.grammarNote.length <= 140, p.id + ' の型・文法解説');
    assert.ok(p.chunks.length >= 2 && p.chunks.length <= 5, p.id + ' の語句数');
    assert.ok(Object.prototype.hasOwnProperty.call(SCENES, p.scene));
  });
});
test('偏り: 文法項目を幅広く扱っている(人称・時刻と数・近接未来・否定・前置詞・形容詞の一致・乗り物・天気・理由)', () => {
  const has = fr => R2P.some(p => p.fr === fr),
    need = [
      "Tu t'appelles comment ?",
      'Ils travaillent à Paris.',
      "J'ai vingt ans.",
      'Quelle heure est-il ?',
      "Qu'est-ce que tu vas faire demain ?",
      'Vous voulez du thé ou du café ?',
      "C'est trop cher.",
      'Le magasin est ouvert.',
      "Un taxi pour la gare, s'il vous plaît.",
      'Je voudrais deux billets.',
      'Le train part à dix heures.',
      "L'hôtel est près de la gare.",
      'Le livre est sur la table.',
      'Vous pouvez ouvrir la fenêtre ?',
      'Je ne mange jamais de viande.',
      "Nous allons à l'école en bus.",
      'La ville est belle.',
      'Elle est contente.',
      "Il fait beau aujourd'hui.",
      'Je dors parce que je suis fatigué.'
    ];
  need.forEach(fr => assert.ok(has(fr), fr + ' がある'));
});

/* ================= 出題(空欄補充・語順整序・選択)の正解整合 ================= */
test('出題: 第2弾の構文は、完成文が語句から再構成でき、空欄の正解・誤答候補・語順の正解が整合している', () => {
  const all = new Set();
  PH.forEach(p => {
    all.add(p.fr);
    (p.slots || []).forEach(s =>
      s.options.forEach(o => all.add(L.renderWith ? L.renderWith(p, s.chunk, o.t) : o.t))
    );
  });
  const render = chunks => chunks.map(c => c.t + (c.after || '')).join(' ');
  R2P.forEach(p => {
    assert.equal(render(p.chunks), p.fr, p.id + ': 完成文と語句の一致');
    if (p.cloze) {
      const c = p.cloze;
      assert.equal(c.pre + c.answer + c.post, p.chunks[c.chunk].t, p.id + ': 空欄の正解と語句');
      assert.equal(c.options.length, 4);
      assert.equal(new Set(c.options).size, 4);
      assert.ok(c.options.includes(c.answer));
      c.options
        .filter(o => o !== c.answer)
        .forEach(o =>
          assert.notEqual(
            render(
              p.chunks.map((x, i) =>
                i === c.chunk ? Object.assign({}, x, { t: c.pre + o + c.post }) : x
              )
            ),
            p.fr,
            p.id + ': 誤答 ' + o + ' が正解と同じ文になる'
          )
        );
    }
    const q = L.makeQuestion(p, 'ordering', PH);
    assert.ok(q, p.id + ' の語順問題');
    const order = q.cards
      .slice()
      .sort((a, b) => a.i - b.i)
      .map(c => c.cid);
    assert.ok(L.orderingCheck(q, order), p.id + ': 教材の並びが正解');
    assert.ok(
      !L.orderingCheck(q, order.slice().reverse()) || order.length < 2,
      p.id + ': 逆順は不正解'
    );
    L.skillsOf(p).forEach(k => {
      for (let s = 1; s <= 20; s++) {
        const x = L.makeQuestion(
          p,
          L.FORMAT_OF[k],
          PH,
          (() => {
            let a = s * 7919;
            return () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
          })()
        );
        assert.ok(x, p.id + ' ' + k);
        if (x.kind === 'choice')
          assert.equal(
            x.opts.filter((o, i) => L.checkChoice(x, i)).length,
            1,
            p.id + ': 選択の正解は1つ'
          );
        if (x.kind === 'cloze')
          assert.equal(
            x.opts.filter((o, i) => L.checkCloze(x, i)).length,
            1,
            p.id + ': 空欄の正解は1つ'
          );
      }
    });
  });
});
test('出題: 第2弾の構文の応用例(slots)は、元の文と別の文になり、同じ文が複数の構文に重なっていない', () => {
  const seen = new Map();
  PH.forEach(p => seen.set(p.fr, (seen.get(p.fr) || 0) + 1));
  R2P.forEach(p =>
    (p.slots || []).forEach(s => {
      assert.ok(s.chunk >= 0 && s.chunk < p.chunks.length, p.id + ' の slots の位置');
      const ts = s.options.map(o => o.t);
      assert.equal(new Set(ts).size, ts.length, p.id + ': 応用例の重複');
      ts.forEach(t => assert.notEqual(t, p.chunks[s.chunk].t, p.id + ': 応用例が元の文と同じ'));
    })
  );
  assert.ok(
    Array.from(seen.values()).every(n => n === 1),
    '完成文の重複なし'
  );
});

/* ================= BOTおまかせ復習での表示 ================= */
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
    },
    pending: () => q.size
  };
}
const startBot = (g, kind) => {
  g.click('botmenu');
  g.click('botkind', { v: kind });
  g.click('bottarget', { v: 'all' });
  g.click('botcount', { v: '0' });
  g.click('botaudio', { v: 'off' });
  g.click('botstart');
};
test('BOT: 第2弾の単語を再生すると、正解の単語・日本語訳・発音・例文・活用・メモが教材どおりに出る(動詞・形容詞・名詞・代名詞…)', () => {
  const g = bootP(),
    T = fakeTimers(g),
    esc = g.k.esc;
  startBot(g, 'word');
  const items = g.k.view().items;
  assert.equal(items.length, WORDS.length);
  for (let i = 0; i < WORD_COUNT; i++) g.click('botnext');
  assert.equal(g.k.view().items[g.k.view().i].id, 'w135');
  R2W.forEach(w => {
    assert.equal(g.k.view().q.w.id, w.id);
    T.tick(3500);
    const h = g.html();
    lint(h, w.id);
    assert.ok(h.includes('BOTの答え'), w.id);
    [WordLib.display(w), w.ja, w.kana, w.ex, w.exJa, w.note]
      .filter(Boolean)
      .forEach(t => assert.ok(h.includes(esc(t)), w.id + ' の ' + t + ' を表示'));
    Object.keys(w.forms || {}).forEach(k =>
      assert.ok(h.includes(esc(w.forms[k])), w.id + ' の forms.' + k)
    );
    const q = g.k.view().q,
      correct = q.type === 'ja2fr' || q.type === 'img2fr' ? WordLib.display(w) : w.ja;
    assert.deepEqual(
      Array.from(h.matchAll(/class="btn ok" disabled>([^<]*)</g)).map(m => m[1]),
      [esc(correct)],
      w.id + ': 正解の選択肢'
    );
    g.click('botnext');
  });
  g.click('botstop');
  assert.equal(T.pending(), 0, '終了後にタイマーが残らない(第2弾のあとに教材が続いていても同じ)');
  assert.equal(g.sb.__errors.length, 0);
});
test('BOT: 第2弾の構文を再生すると、完成文・日本語訳・型・文法解説・語句の意味と、空欄・語順の正解が出る', () => {
  const g = bootP(),
    T = fakeTimers(g),
    esc = g.k.esc;
  startBot(g, 'phrase');
  assert.equal(g.k.view().items.length, PH.length);
  for (let i = 0; i < PHRASE_COUNT; i++) g.click('botnext');
  assert.equal(g.k.view().q.p.id, 'p61');
  R2P.forEach(p => {
    assert.equal(g.k.view().q.p.id, p.id);
    T.tick(5000);
    const h = g.html();
    lint(h, p.id);
    [p.fr, p.ja, p.pattern, p.grammarNote].forEach(t =>
      assert.ok(h.includes(esc(t)), p.id + ': ' + t)
    );
    p.chunks.forEach(c => assert.ok(h.includes(esc(c.t) + ' = ' + esc(c.ja)), p.id));
    const kind = g.k.view().q.kind;
    if (kind === 'cloze')
      assert.ok(h.includes('空欄の答え: 「' + esc(p.cloze.answer) + '」'), p.id);
    if (kind === 'ordering') assert.ok(h.includes('正しい並び'), p.id);
    g.click('botnext');
  });
  assert.equal(g.sb.__errors.length, 0);
});

/* ================= 既存の学習記録との互換 ================= */
test('互換: 第2弾より前の教材(初版 134語・60構文)で作った学習記録を、今の教材で読み込んでも、記録・習熟度・育成が変わらない', () => {
  const T0 = 1700000000000,
    DAY = 86400000;
  const gOld = bootP({
    extraCode: 'WORDS.length = ' + WORD_COUNT + '; PHRASES.length = ' + PHRASE_COUNT + ';'
  });
  gOld.k.setClock(() => T0);
  assert.equal(gOld.k.vocab.length, WORD_COUNT, '旧版の再現');
  assert.equal(gOld.k.phrases.length, PHRASE_COUNT);
  const play = g => {
    g.learn(3);
    g.click('battle');
    let n = 0;
    while (g.k.view().mode === 'battle' && n++ < 40) {
      g.answer(n % 3 !== 0);
      g.next();
    }
    g.click('home');
    g.click('pmenu');
    g.click('plearn');
    if (g.k.view().mode === 'pwords') g.click('pgo');
    playAll(g, true);
    g.click('home');
  };
  play(gOld);
  gOld.k.setClock(() => T0 + 2 * DAY);
  play(gOld);
  gOld.k.setClock(() => T0 + 9 * DAY);
  // 別々の環境の配列は、そのままでは比較できないので通常の配列にする assert.ok(oldState.xp > 0 &&
  // Object.keys(oldState.w).length >= 6 && Object.keys(oldState.ph).length >= 4);
  const oldState = plain(gOld.k.state()),
    oldStatus = Array.from(gOld.k.vocab, w => w.id + ':' + gOld.k.status(w)),
    oldPStatus = Array.from(gOld.k.phrases, p => p.id + ':' + gOld.k.pstatus(p));
  // 同じ記録を、第2弾を含む今の教材で読み込む
  const g = bootP({ storage: gOld.store });
  g.k.setClock(() => T0 + 9 * DAY);
  assert.equal(g.k.vocab.length, WORDS.length);
  assert.equal(g.k.phrases.length, PH.length);
  deq(plain(g.k.state()), oldState, '記録(state)が変わっていない');
  deq(
    Array.from(
      g.k.vocab.filter(w => Number(w.id.slice(1)) <= WORD_COUNT),
      w => w.id + ':' + g.k.status(w)
    ),
    oldStatus,
    '旧単語の状態(未学習・学習中・復習待ち・習得済み)が同じ'
  );
  deq(
    Array.from(
      g.k.phrases.filter(p => Number(p.id.slice(1)) <= PHRASE_COUNT),
      p => p.id + ':' + g.k.pstatus(p)
    ),
    oldPStatus,
    '旧構文の状態が同じ'
  );
  assert.ok(
    NW.every(w => g.k.status(w) === 'new') && NP.every(p => g.k.pstatus(p) === 'new'),
    '新しい教材はすべて未学習から始まる'
  );
  assert.equal(
    Object.keys(g.k.state().w).some(id => Number(id.slice(1)) > WORD_COUNT),
    false,
    '新しい単語の記録は勝手に作られない'
  );
  assert.equal(g.k.reviewList().length, gOld.k.reviewList().length, '復習待ちの件数が同じ');
  assert.equal(g.k.pdue().length, gOld.k.pdue().length);
  // そのまま続けて学習でき、記録が正しく伸びる(旧単語を再学習せず、次の未学習から)
  const xp0 = g.k.state().xp;
  g.click('learn');
  g.click('learnNext');
  g.click('home');
  g.click('battle');
  const before = Object.keys(g.k.state().w).length;
  let n = 0;
  while (g.k.view().mode === 'battle' && n++ < 40) {
    g.answer(true);
    g.next();
  }
  assert.ok(g.k.state().xp > xp0, 'バトルの経験値が増える');
  assert.ok(Object.keys(g.k.state().w).length >= before);
  assert.equal(g.sb.__errors.length, 0);
});
test('互換: 保存形式(キー・バージョン)は変わらず、新しい教材を足しても既存の記録のキーは増えない', () => {
  const g = bootP();
  g.learn(2);
  g.click('battle');
  g.answer(true);
  const keys = Object.keys(g.store);
  assert.deepEqual(keys, ['kotoba-monster-v1'], '記録のキーは従来の1つだけ');
  const saved = JSON.parse(g.store['kotoba-monster-v1']);
  assert.ok(saved && typeof saved === 'object');
});
test('第2弾の追加分は、新しいカテゴリ(代名詞・数・日付)も含め、図鑑のカテゴリ一覧に出て、絞り込める', () => {
  assert.ok(WD.categories.includes('代名詞') && WD.categories.includes('数・日付'));
  const g = bootP();
  g.click('zukan');
  ['代名詞', '数・日付'].forEach(c => {
    g.select('cat', c);
    const list = g.k.zukan().list;
    assert.ok(list.length >= 6, c + ' の語数');
    list.forEach(w => assert.equal(w.cat, c));
  });
  assert.equal(g.sb.__errors.length, 0);
});
