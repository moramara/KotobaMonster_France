'use strict';
// 構文データ(phrases.js)と検証(phraselib.js の validate / prepare)のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const { PhraseLib: L, realPhrases, wordIds, plain } = require('./phrase_boot.js');

const IDS = wordIds();
const opts = () => ({ wordIds: IDS, scenes: realPhrases().scenes });
const val = list => L.validate(list, opts());
// 例: Je voudrais un café, s'il vous plaît.
const base = () => plain(realPhrases().phrases.find(p => p.id === 'p10'));
// p10 をもとに、ID ごとに異なる文(「un x01」のような名詞)を持つテスト用データを作る(他の構文と
// fr・ja が衝突しない)
const mk = (over, id) => {
  const p = plain(base()),
    n = (over && over.id) || id || 'x01';
  p.id = n;
  p.chunks[1].t = 'un ' + n;
  p.cloze.post = ' ' + n;
  p.fr = L.render(p);
  p.ja = 'テスト訳' + n;
  return Object.assign(p, over);
};
// 検証用の最小データ(他の構文と fr・ja がぶつからないよう、本物の構文に1つ足す)
const withExtra = extra => realPhrases().phrases.concat([extra]);
const errsOf = (extra, f) =>
  val(withExtra(extra)).errors.filter(e => e.id === extra.id && (!f || e.field.indexOf(f) === 0));
const C = (t, ja, after) => Object.assign({ t, ja }, after ? { after } : {});

/* ---- 初期教材 ---- */
test('初期教材: 検証でエラーも警告も0件(単語IDの実在確認を含む)', () => {
  const r = val(realPhrases().phrases);
  assert.deepEqual(r.errors.map(L.formatIssue), []);
  assert.deepEqual(r.warnings.map(L.formatIssue), []);
});
test('教材: 50構文以上(うち追加分30以上。件数の上限なし)・A1とA2・出荷時の8場面は残る(追加は自由)。出荷時の場面は各5〜7構文以上', () => {
  const { phrases, scenes } = realPhrases(),
    added = phrases.filter(p => Number(p.id.slice(1)) > 21);
  assert.ok(phrases.length >= 50, '総数 ' + phrases.length);
  assert.ok(added.length >= 30, '追加分 ' + added.length);
  const levels = new Set(phrases.map(p => p.level));
  assert.ok(levels.has('A1') && levels.has('A2'), 'A1 と A2 の両方がある');
  phrases.forEach(p => assert.ok(L.LEVELS.includes(p.level), p.id + ' のレベル ' + p.level));
  assert.ok(phrases.filter(p => p.level === 'A2').length >= 8, 'A2 の構文');
  const SHIPPED = ['ask', 'daily', 'greeting', 'plan', 'routine', 'shop', 'talk', 'travel'];
  SHIPPED.forEach(k =>
    assert.ok(Object.prototype.hasOwnProperty.call(scenes, k), '場面 ' + k + ' が消えています')
  );
  SHIPPED.forEach(k =>
    assert.ok(
      phrases.filter(p => p.scene === k).length >=
        (['routine', 'talk', 'travel'].includes(k) ? 5 : 7),
      k + ' の構文が少ない'
    )
  );
  phrases.forEach(p =>
    assert.ok(
      Object.prototype.hasOwnProperty.call(scenes, p.scene),
      p.id + ' の場面 ' + p.scene + ' が PHRASE_SCENES にない'
    )
  );
});
test("初期教材: 依頼された型(Je m'appelle / Je suis / J'habite à / J'aime / Où est / Est-ce que / Qu'est-ce que c'est / Je voudrais / C'est combien / Ça coûte combien / Je prends / Il y a / J'ai besoin de / Je peux / Pouvez-vous / Je ne comprends pas / Je ne sais pas / Je vais)を含む", () => {
  const fr = realPhrases()
    .phrases.map(p => p.fr)
    .join(' | ');
  [
    "Je m'appelle",
    'Je suis',
    "J'habite à",
    "J'aime",
    'Comment vous appelez-vous ?',
    'Où est',
    'Est-ce que',
    "Qu'est-ce que c'est ?",
    'Je voudrais',
    "C'est combien ?",
    'Ça coûte combien ?',
    'Je prends',
    'Il y a',
    "J'ai besoin d",
    'Je peux',
    'Pouvez-vous répéter',
    'Je ne comprends pas.',
    'Je ne sais pas.',
    'Je vais'
  ].forEach(s => assert.ok(fr.indexOf(s) >= 0, s + ' がありません'));
});
test('初期教材: Je voudrais + 名詞 / + 不定詞 の両方がある', () => {
  const pats = realPhrases().phrases.map(p => p.pattern);
  assert.ok(pats.some(x => /Je voudrais \+ 名詞/.test(x)));
  assert.ok(pats.some(x => /Je voudrais \+ 不定詞/.test(x)));
});
test("初期教材: 仕様の例(Je voudrais un café, s'il vous plaît.)が、語句・空欄・応用例まで表現できている", () => {
  const p = base();
  assert.equal(p.fr, "Je voudrais un café, s'il vous plaît.");
  assert.equal(p.pattern, "Je voudrais + 名詞 + s'il vous plaît");
  assert.deepEqual(
    p.chunks.map(c => c.t),
    ['Je voudrais', 'un café', "s'il vous plaît"]
  );
  assert.ok(/条件法/.test(p.grammarNote));
  assert.deepEqual(p.cloze.options.slice().sort(), ['des', 'la', 'un', 'une']);
  assert.equal(p.cloze.answer, 'un');
  assert.deepEqual(p.slots[0].options.map(o => L.variantOf(p, p.slots[0], o)).slice(0, 2), [
    "Je voudrais un thé, s'il vous plaît.",
    "Je voudrais de l'eau, s'il vous plaît."
  ]);
  assert.deepEqual(
    L.orderingText({ cards: p.chunks.map((c, i) => ({ cid: 'c' + i, i, t: c.t })), p }, [
      'c0',
      'c1',
      'c2'
    ]),
    p.fr
  );
});
test('初期教材: chunks は空白での単純分割ではなく、意味のまとまり(アポストロフィ・倒置のハイフン・複合表現)を1単位で保持する', () => {
  const ph = realPhrases().phrases,
    ts = ph.reduce((a, p) => a.concat(p.chunks.map(c => c.t)), []);
  [
    "s'il vous plaît",
    "m'appelle",
    "d'un stylo",
    'vous appelez-vous',
    'Pouvez-vous',
    'ne comprends pas',
    "Qu'est-ce que",
    'dans la maison'
  ].forEach(t => assert.ok(ts.indexOf(t) >= 0, t));
  ph.forEach(p =>
    assert.ok(
      p.chunks.length < p.fr.split(/\s+/).length || p.chunks.length <= 3,
      p.id + ' が単語ごとの分割になっていない'
    )
  );
});
test('初期教材: 各構文で chunks を連結すると fr と完全に一致し、句読点・文末記号が教材データから再現される', () => {
  realPhrases().phrases.forEach(p => {
    assert.equal(L.render(p), p.fr, p.id);
    assert.match(p.fr, /[.?]$/, p.id + ' の文末');
  });
  assert.equal(
    L.render(realPhrases().phrases.find(p => p.id === 'p07')),
    'Où est la gare ?',
    '疑問符の前の空白もデータから'
  );
});
test('初期教材: 空欄補充は、正解が候補に1つだけ・誤答を入れても完成文にならない・候補は4つで重複なし', () => {
  realPhrases()
    .phrases.filter(p => p.cloze)
    .forEach(p => {
      const z = p.cloze;
      assert.equal(z.pre + z.answer + z.post, p.chunks[z.chunk].t, p.id);
      assert.equal(z.options.length, 4, p.id);
      assert.equal(new Set(z.options).size, 4, p.id);
      assert.equal(z.options.filter(o => o === z.answer).length, 1, p.id);
      z.options
        .filter(o => o !== z.answer)
        .forEach(o =>
          assert.notEqual(L.renderWith(p, z.chunk, z.pre + o + z.post), p.fr, p.id + ':' + o)
        );
    });
});
test('初期教材: 空欄補充の誤答は文法的に成り立たない(un/une/des/la。le / du は誤答にしていない)', () => {
  const p = realPhrases().phrases.find(q => q.id === 'p10');
  assert.ok(p.cloze.options.indexOf('du') < 0 && p.cloze.options.indexOf('le') < 0);
  const known = {
    p04: ['le', 'la', "l'", 'les'],
    p07: ['la', 'le', "l'", 'les'],
    p21: ['en', 'à', 'au', 'aux']
  };
  Object.keys(known).forEach(id =>
    assert.deepEqual(
      realPhrases()
        .phrases.find(q => q.id === id)
        .cloze.options.slice()
        .sort(),
      known[id].slice().sort()
    )
  );
});
test('初期教材: 関連する単語IDはすべて実在し、言い換え(equiv)は相互に指定されている', () => {
  const ph = realPhrases().phrases,
    byId = new Map(ph.map(p => [p.id, p]));
  ph.forEach(p => {
    (p.wordIds || []).forEach(w => assert.ok(IDS.indexOf(w) >= 0, p.id + ' ' + w));
    (p.slots || []).forEach(s =>
      s.options.forEach(o => {
        if (o.wordId) assert.ok(IDS.indexOf(o.wordId) >= 0, p.id + ' ' + o.wordId);
      })
    );
    (p.equiv || []).forEach(q => assert.ok(byId.get(q).equiv.indexOf(p.id) >= 0, p.id + '↔' + q));
  });
  assert.ok(
    ph.some(p => (p.wordIds || []).length),
    '既存の単語データを再利用している'
  );
});
test('初期教材: IDは重複せず p01〜 の連番(永続ID)、日本語訳と文の重複もない', () => {
  const ph = realPhrases().phrases;
  assert.equal(new Set(ph.map(p => p.id)).size, ph.length);
  assert.deepEqual(
    ph.map(p => p.id),
    ph.map((_, i) => 'p' + String(i + 1).padStart(2, '0'))
  );
  assert.equal(new Set(ph.map(p => p.fr)).size, ph.length);
  assert.equal(new Set(ph.map(p => p.ja)).size, ph.length);
});
test('初期教材: 応用(slots)の入れ替え後の文が、元の chunks の構造を保つ(元の文と同一にならず、空でない)', () => {
  realPhrases().phrases.forEach(p =>
    p.slots.forEach(s =>
      s.options.forEach(o => {
        const v = L.variantOf(p, s, o);
        assert.notEqual(v, p.fr, p.id);
        assert.ok(v.length > 5 && /[.?]$/.test(v), p.id + ' ' + v);
      })
    )
  );
});
test('初期教材: 解説は簡潔(140文字以内)で、日本語で書かれている', () => {
  realPhrases().phrases.forEach(p => {
    assert.ok(p.grammarNote.length <= 140, p.id);
    assert.match(p.grammarNote, /[\u3040-\u30ff\u4e00-\u9fff]/, p.id);
  });
});

/* ---- エラー検出 ---- */
test('検証: IDの重複を検出する', () => {
  const l = realPhrases().phrases.concat([
    Object.assign(plain(base()), {
      fr: 'Autre phrase.',
      ja: '別',
      chunks: [C('Autre phrase', '別', '.')],
      cloze: undefined
    })
  ]);
  l[l.length - 1].id = 'p10';
  assert.ok(val(l).errors.some(e => e.id === 'p10' && e.field === 'id' && /重複/.test(e.message)));
});
test('検証: 必須フィールドの欠落・空を検出する(fr / ja / scene / pattern / grammarNote / level / chunks / id)', () => {
  ['fr', 'ja', 'scene', 'pattern', 'grammarNote', 'level', 'chunks', 'id'].forEach(f => {
    const x = mk({ id: 'x01' });
    delete x[f];
    const l = withExtra(x);
    const r = val(l);
    assert.ok(
      r.errors.some(e => e.field === f || e.id === '(#' + l.length + ')'),
      f + ' の欠落を検出できません'
    );
    const y = mk({ id: 'x02', [f]: '' });
    if (f !== 'chunks') assert.ok(val(withExtra(y)).errors.length > 0, f + ' が空');
  });
  assert.ok(val('abc').errors.length === 1 && val([5]).errors.length === 1, '構文データの型の誤り');
});
test('検証: 不正なレベル・場面・問題形式を検出する', () => {
  assert.ok(errsOf(mk({ id: 'x01', level: 'Z9' }), 'level').length);
  assert.ok(errsOf(mk({ id: 'x01', scene: 'unknown' }), 'scene').length);
  assert.ok(
    errsOf(mk({ id: 'x01', formats: ['choice', 'dictation'] }), 'formats').length,
    '未知の形式'
  );
  assert.ok(errsOf(mk({ id: 'x01', formats: [] }), 'formats').length);
  assert.ok(errsOf(mk({ id: 'x01', formats: ['cloze'] }), 'formats').length, 'choice が必須');
  assert.ok(
    errsOf(mk({ id: 'x01', cloze: undefined, formats: ['choice', 'cloze'] }), 'cloze').length,
    'cloze データなしの cloze 形式'
  );
});
test('検証: 空の選択肢・重複・正解が候補にない・数が足りない空欄補充を検出する', () => {
  const z = o => mk({ id: 'x01', cloze: Object.assign(plain(base().cloze), o) });
  assert.ok(
    errsOf(z({ options: ['un', '', 'une', 'des'] }), 'cloze.options').some(e =>
      /空/.test(e.message)
    )
  );
  assert.ok(
    errsOf(z({ options: ['une', 'des', 'la', 'les'] }), 'cloze.options').some(e =>
      /ちょうど1つ/.test(e.message)
    ),
    '正解が候補にない'
  );
  assert.ok(
    errsOf(z({ options: ['un', 'un', 'une', 'des'] }), 'cloze.options').some(e =>
      /重複/.test(e.message)
    )
  );
  assert.ok(
    errsOf(z({ options: ['un', 'une'] }), 'cloze.options').some(e => /3つ以上/.test(e.message))
  );
  assert.ok(errsOf(z({ options: undefined }), 'cloze.options').length, 'options なし');
});
test('検証: 空欄補充の正解データの不整合(pre+answer+post が語句と不一致 / 位置が範囲外 / 誤答でも正解文になる)を検出する', () => {
  const z = o => mk({ id: 'x01', cloze: Object.assign(plain(base().cloze), o) });
  assert.ok(errsOf(z({ post: ' cafe' }), 'cloze').some(e => /一致しません/.test(e.message)));
  assert.ok(errsOf(z({ answer: 'une' }), 'cloze').length);
  assert.ok(errsOf(z({ chunk: 9 }), 'cloze.chunk').length);
  assert.ok(errsOf(z({ chunk: -1 }), 'cloze.chunk').length);
  assert.ok(errsOf(z({ answer: '' }), 'cloze.answer').length);
  // 'un ' を入れると「un  café」になり別の文
  const two = mk({
    id: 'x01',
    cloze: { chunk: 1, pre: '', answer: 'un', post: ' x01', options: ['un', 'un ', 'des', 'la'] }
  });
  assert.equal(
    errsOf(two, 'cloze.options').filter(e => /正解の文になります/.test(e.message)).length,
    0
  );
  const dupeOk = mk({
    id: 'x02',
    cloze: { chunk: 1, pre: '', answer: 'un', post: ' x02', options: ['un', 'un', 'des', 'la'] }
  });
  assert.ok(errsOf(dupeOk, 'cloze.options').length);
});
test('検証: 語順整序に必要な語句情報の不足(chunks なし・1つだけ・語句/意味が空・句読点が不正)を検出する', () => {
  assert.ok(errsOf(mk({ id: 'x01', chunks: [] }), 'chunks').length);
  assert.ok(errsOf(mk({ id: 'x01', chunks: undefined }), 'chunks').length);
  const one = mk({
    id: 'x01',
    fr: 'Merci.',
    ja: 'ありがとう。',
    chunks: [C('Merci', 'ありがとう', '.')],
    cloze: undefined,
    formats: ['choice', 'ordering']
  });
  assert.ok(errsOf(one, 'formats').some(e => /2つ以上/.test(e.message)));
  assert.ok(
    errsOf(mk({ id: 'x01', chunks: [C('', 'あ'), C('b', 'い', '.')] }), 'chunks[0].t').length
  );
  assert.ok(
    errsOf(mk({ id: 'x01', chunks: [C('Je', ''), C('b', 'い', '.')] }), 'chunks[0].ja').length
  );
  assert.ok(
    errsOf(mk({ id: 'x01', chunks: [C('Je', 'a', 'x'), C('b', 'い', '.')] }), 'chunks[0].after')
      .length,
    '句読点以外の after'
  );
  assert.ok(errsOf(mk({ id: 'x01', chunks: [C(' Je', 'a')] }), 'chunks[0].t').length, '前後の空白');
  assert.ok(
    errsOf(
      mk({
        id: 'x01',
        chunks: [
          C('a', 'a'),
          C('b', 'b'),
          C('c', 'c'),
          C('d', 'd'),
          C('e', 'e'),
          C('f', 'f'),
          C('g', 'g'),
          C('h', 'h'),
          C('i', 'i', '.')
        ]
      }),
      'chunks'
    ).some(e => /多すぎ/.test(e.message))
  );
});
test('検証: chunks を連結した文と fr の不一致(語順・句読点・綴り)を検出する', () => {
  const p = mk({ id: 'x01' });
  p.fr = "Je voudrais un x01 s'il vous plaît.";
  assert.ok(errsOf(p, 'chunks').some(e => /一致しません/.test(e.message)));
  const q = mk({ id: 'x01' });
  q.chunks = [q.chunks[1], q.chunks[0], q.chunks[2]];
  assert.ok(errsOf(q, 'chunks').length);
});
test('検証: 存在しない単語IDの参照(wordIds / slots の wordId)を検出する', () => {
  const p = mk({ id: 'x01', wordIds: ['w21', 'w999'] });
  assert.ok(errsOf(p, 'wordIds').some(e => /w999/.test(e.message)));
  const q = mk({ id: 'x01' });
  q.slots[0].options[0].wordId = 'nope';
  assert.ok(errsOf(q, 'slots').some(e => /nope/.test(e.message)));
  assert.equal(
    errsOf(mk({ id: 'x01', wordIds: ['w21', 'w05'] }), 'wordIds').length,
    0,
    '実在IDは通る'
  );
  assert.equal(
    L.validate([mk({ id: 'x01', wordIds: ['w999'] })], {}).errors.filter(e => e.field === 'wordIds')
      .length,
    0,
    '単語一覧を渡さなければ照合しない'
  );
});
test('検証: slots・equiv の不備を検出する', () => {
  const s = f => {
    const p = mk({ id: 'x01' });
    f(p.slots[0]);
    return errsOf(p, 'slots');
  };
  assert.ok(
    s(x => {
      x.chunk = 7;
    }).length
  );
  assert.ok(
    s(x => {
      x.options = [];
    }).length
  );
  assert.ok(
    s(x => {
      x.label = '';
    }).length
  );
  assert.ok(
    s(x => {
      x.options[0] = { t: 'a' };
    }).length
  );
  assert.ok(errsOf(mk({ id: 'x01', equiv: ['nothere'] }), 'equiv').length);
  assert.ok(errsOf(mk({ id: 'x01', equiv: ['x01'] }), 'equiv').length, '自分自身');
});
test('検証: HTML用の特殊文字(< > &)を含む文字列をエラーにする', () => {
  ['fr', 'ja', 'pattern', 'grammarNote'].forEach(f =>
    assert.ok(errsOf(mk({ id: 'x01', [f]: 'a<b' }), f).length, f)
  );
});
test('検証: エラーと警告を区別する(未知のフィールド・長すぎる解説・片方向の equiv・同じ訳 は警告)', () => {
  const p = mk({ id: 'x01', foo: 1 });
  let r = val(withExtra(p));
  assert.equal(r.errors.filter(e => e.id === 'x01').length, 0);
  assert.ok(r.warnings.some(w => w.id === 'x01' && w.field === 'foo'));
  r = val(withExtra(mk({ id: 'x01', grammarNote: 'あ'.repeat(141) })));
  assert.ok(r.warnings.some(w => w.field === 'grammarNote') && !r.errors.some(e => e.id === 'x01'));
  r = val(withExtra(mk({ id: 'x01', equiv: ['p10'] })));
  assert.ok(r.warnings.some(w => w.id === 'x01' && w.field === 'equiv'));
  assert.equal(r.errors.filter(e => e.id === 'x01').length, 0);
  r = val(
    withExtra(
      mk({
        id: 'x01',
        ja: base().ja,
        fr: 'Autre.',
        chunks: [C('Autre', 'a', '.')],
        cloze: undefined
      })
    )
  );
  assert.ok(r.warnings.some(w => w.field === 'ja'));
  assert.ok(
    L.validate(realPhrases().phrases.slice(0, 3), opts()).warnings.some(w =>
      /4つ未満/.test(w.message)
    )
  );
});
test('検証: 重複した完成文(fr)はエラー(選択問題で正解が複数になるため)', () => {
  const p = mk({ id: 'x01', ja: '別の訳' });
  p.fr = base().fr;
  assert.ok(errsOf(p, 'fr').some(e => /重複/.test(e.message)));
});
test('prepare: エラーのある構文だけを除外し、警告だけの構文は残す。正規化した形(既定値つき)で返す', () => {
  const bad = mk({ id: 'x01', level: 'Z9' }),
    warn = mk({ id: 'x02', foo: 1, ja: 'x2のための訳' }),
    r = L.prepare(withExtra(bad).concat([warn]), opts());
  assert.equal(r.excluded, 1);
  assert.ok(!r.phrases.some(p => p.id === 'x01'));
  assert.ok(r.phrases.some(p => p.id === 'x02'));
  assert.equal(r.phrases.length, realPhrases().phrases.length + 1);
  const p = r.phrases.find(q => q.id === 'p09');
  assert.deepEqual(
    [p.cloze, p.slots, p.wordIds, p.equiv, p.formats],
    [null, [], [], [], ['choice', 'ordering']]
  );
  assert.deepEqual(r.phrases.find(q => q.id === 'p10').formats, ['choice', 'cloze', 'ordering']);
  assert.ok(p.chunks.every(c => typeof c.after === 'string' && typeof c.sp === 'boolean'));
  assert.equal(L.prepare('x', {}).phrases.length, 0);
});
test('formatIssue: 構文ID・フィールド・原因を含む', () => {
  const e = errsOf(mk({ id: 'x01', level: 'Z9' }), 'level')[0];
  assert.match(L.formatIssue(e), /^x01\.level: /);
});
