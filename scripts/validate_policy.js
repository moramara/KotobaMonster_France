#!/usr/bin/env node
'use strict';
// 教材の「編集ルール」の検証。使い方: node scripts/validate_policy.js [--strict] [--quiet]
// words.js / phrases.js のスキーマ検証(validate_words.js / validate_phrases.js)では見ない、
// 次の決まりを確認する(README ではなく docs/CONTENT_GUIDE.md に書いてある決まり)。
//   単語: 動詞の現在形は6人称・形容詞は女性形が必須・絵文字は他の語と重複しない・
//         IDは欠番のない連番(w01〜)
//   (形容詞の mp / fp と、絵文字を名詞だけに付ける決まりは「推奨」。出荷済みの語に例外があるので、
//    ここでは検査しない。docs/CONTENT_GUIDE.md を参照)
//   構文: A1 の構文が A1 以外の単語を参照しない・IDは欠番のない連番(p01〜)
// ゲーム本体(src/lib)の検証ではないので、ここで見つかった問題で単語・構文がゲームから除外されることは
// ありません。エラーがあれば終了コード1。--strict なら警告でも1。
const { loadWordData } = require('./load_words.js');
const { loadPhraseData } = require('./load_phrases.js');
const { idStatus } = require('./content_status.js');

const isStr = v => typeof v === 'string';
// 不定詞の代名動詞(se lever など)か
const reflexive = fr => /^(se|s') ?/.test(fr);
// 現在形の6人称の、それぞれの先頭の代名詞
const PRON = [/^(je|j') ?/, /^tu /, /^il /, /^nous /, /^vous /, /^ils /];
const PRON_SE = [/^je me /, /^tu te /, /^il se /, /^nous nous /, /^vous vous /, /^ils se /];

// 単語・構文(読み込んだ生データ)を調べて { errors, warnings } を返す。各要素は { kind, id, field, message }
function checkPolicy(words, phrases) {
  const errors = [],
    warnings = [];
  const E = (kind, id, field, message) => errors.push({ kind, id, field, message });
  const Wn = (kind, id, field, message) => warnings.push({ kind, id, field, message });

  // ---- ID(欠番のない連番・重複なし)----
  [
    ['word', words, 'w'],
    ['phrase', phrases, 'p']
  ].forEach(([kind, list, prefix]) => {
    const s = idStatus(list, prefix);
    s.odd.forEach(id =>
      E(kind, id, 'id', '連番の形式(' + prefix + '01, ' + prefix + '02 …)ではありません')
    );
    s.malformed.forEach(m =>
      E(
        kind,
        m.id,
        'id',
        '形式が不正です(' + m.reason + (m.expected ? '。正しくは ' + m.expected : '') + ')'
      )
    );
    s.dups.forEach(id => E(kind, id, 'id', 'IDが重複しています'));
    s.gaps.forEach(id => E(kind, id, 'id', 'IDが欠番です(欠番を作らず「最大番号 + 1」で追加する)'));
  });

  // ---- 単語 ----
  const emojiOwner = new Map();
  words.forEach(w => {
    const pos = w.pos || (w.art || w.g ? 'noun' : '');
    if (pos === 'verb') {
      const f = w.forms && isStr(w.forms.present) ? w.forms.present.split(', ') : null;
      if (!f) E('word', w.id, 'forms.present', '動詞は forms.present(現在形の6人称)が必須です');
      else if (f.length !== 6)
        E(
          'word',
          w.id,
          'forms.present',
          '現在形は「, 」区切りで6人称そろえてください(いま ' + f.length + ')'
        );
      else {
        const pron = reflexive(w.fr) ? PRON_SE : PRON;
        f.forEach((x, i) => {
          if (!pron[i].test(x))
            E(
              'word',
              w.id,
              'forms.present',
              i + 1 + '番目が je/tu/il/nous/vous/ils の順になっていません: ' + x
            );
        });
      }
      if (!/(er|ir|re|oir)$/.test(w.fr || ''))
        Wn('word', w.id, 'fr', '動詞は不定詞(-er / -ir / -re / -oir)で登録します: ' + w.fr);
    }
    if (pos === 'adjective') {
      const f = w.forms || {};
      if (!isStr(f.fem) || !f.fem)
        E('word', w.id, 'forms.fem', '形容詞は女性形 forms.fem が必須です');
    }
    if (w.emoji) {
      if (emojiOwner.has(w.emoji))
        E(
          'word',
          w.id,
          'emoji',
          '絵文字が ' + emojiOwner.get(w.emoji) + ' と重複しています(絵→仏の問題が曖昧になる)'
        );
      else emojiOwner.set(w.emoji, w.id);
    }
  });

  // ---- 構文: A1 の構文は A1 の単語だけを参照する ----
  const level = new Map(words.map(w => [w.id, w.level || 'A1']));
  phrases
    .filter(p => p.level === 'A1')
    .forEach(p => {
      const ids = (p.wordIds || []).slice();
      (p.slots || []).forEach(s =>
        (s.options || []).forEach(o => o && o.wordId && ids.push(o.wordId))
      );
      ids.forEach(id => {
        if (level.has(id) && level.get(id) !== 'A1')
          E(
            'phrase',
            p.id,
            'wordIds',
            'A1 の構文が ' +
              level.get(id) +
              ' の単語 ' +
              id +
              ' を参照しています(構文も ' +
              level.get(id) +
              ' にする)'
          );
      });
    });

  return { errors, warnings };
}
const formatIssue = x => '[' + x.id + '] ' + x.field + ': ' + x.message;

module.exports = { checkPolicy, formatIssue };

if (require.main === module) {
  const args = process.argv.slice(2),
    strict = args.includes('--strict'),
    quiet = args.includes('--quiet');
  let rep, nw, np;
  try {
    const w = loadWordData().words,
      p = loadPhraseData().phrases;
    nw = w.length;
    np = p.length;
    rep = checkPolicy(w, p);
  } catch (e) {
    console.error('教材を読み込めません: ' + e.message);
    process.exit(1);
  }
  console.log('編集ルールの検証: 単語 ' + nw + '語 / 構文 ' + np + '件');
  rep.errors.forEach(x => console.log('  ✗ エラー ' + formatIssue(x)));
  if (!quiet) rep.warnings.forEach(x => console.log('  △ 警告   ' + formatIssue(x)));
  console.log('エラー ' + rep.errors.length + '件 / 警告 ' + rep.warnings.length + '件');
  if (rep.errors.length) {
    console.log('NG: エラーを修正してください(docs/CONTENT_GUIDE.md の編集ルール)');
    process.exit(1);
  }
  if (strict && rep.warnings.length) {
    console.log('NG(--strict): 警告を修正してください');
    process.exit(1);
  }
  console.log('OK');
}
