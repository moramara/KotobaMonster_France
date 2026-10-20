#!/usr/bin/env node
'use strict';
// 教材の現状を表示する(読むだけ。ファイルは変更しない)。使い方: node scripts/content_status.js
// 教材を追加する前に「次に使うID」と、カテゴリ・レベル・場面の偏りを確認するための道具。
// 件数やIDをドキュメントに書かなくて済むように、現在値はいつでもここで確認する。
const { loadWordData } = require('./load_words.js');
const { loadPhraseData } = require('./load_phrases.js');

// 'w182' → 182、'w0183' → 183(数値部分を取り出すだけ。ID全体が正しい形式かは idFormatProblem で別に調べる)。
// 接頭辞+数字の形でないものと、安全に扱えない巨大な数は null
const numOf = (id, prefix) => {
  const m = new RegExp('^' + prefix + '(\\d+)$').exec(String(id));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
};
// 9 → 'w09'、10 → 'w10'、100 → 'w100'(9以下だけ2桁にそろえる。構文は p99 まで2桁)
const makeId = (prefix, n) => prefix + (n < 10 ? '0' + n : String(n));
// 数値を取り出せたIDの形式の不備。正しければ null、不備があれば { expected, reason }(番号0は直し先がないので expected は null)。
// 正しい形は makeId(prefix, n) と完全に一致するもの(1〜9は2桁、10以降はゼロ埋めなし、番号は1以上)
function idFormatProblem(id, prefix, n) {
  const expected = makeId(prefix, n);
  if (n >= 1 && id === expected) return null;
  if (n < 1) return { expected: null, reason: '番号は1以上です' };
  const digits = String(id).length - prefix.length;
  const reason =
    digits < expected.length - prefix.length ? '1〜9は2桁で書きます' : '不要なゼロ埋めがあります';
  return { expected, reason };
}
const tally = (list, key) => {
  const o = {};
  list.forEach(x => {
    const k = key(x) || '(未指定)';
    o[k] = (o[k] || 0) + 1;
  });
  return o;
};

// 1種類の教材(単語または構文)の、連番の状態: 最大番号・次のID・欠番・連番でないID・形式が不正なID・重複ID
//   odd       … 接頭辞+数字の形ではないID(最大番号・欠番の計算には使わない)
//   malformed … 数字は取り出せるが、形式が不正なID({ id, expected, reason })。w1 / w001 / w0183 など。
//               数値部分は最大番号・欠番の計算に含める(直したときに既存のIDとぶつからないようにするため)
//   dups      … 重複ID。w183 と w0183 のように、直すと同じIDになるものも重複として、正しい形(w183)で報告する
function idStatus(list, prefix) {
  const nums = [],
    odd = [],
    malformed = [];
  list.forEach(x => {
    const n = numOf(x.id, prefix);
    if (n === null) {
      odd.push(x.id);
      return;
    }
    nums.push(n);
    const bad = idFormatProblem(x.id, prefix, n);
    if (bad) malformed.push({ id: x.id, expected: bad.expected, reason: bad.reason });
  });
  const max = nums.length ? Math.max(...nums) : 0,
    have = new Set(nums),
    gaps = [];
  for (let i = 1; i <= max; i++) if (!have.has(i)) gaps.push(makeId(prefix, i));
  const seen = new Set(),
    dups = [];
  list.forEach(x => {
    const n = numOf(x.id, prefix),
      key = n === null ? x.id : makeId(prefix, n);
    if (seen.has(key) && dups.indexOf(key) < 0) dups.push(key);
    seen.add(key);
  });
  return { count: list.length, max, next: makeId(prefix, max + 1), gaps, odd, malformed, dups };
}

// words / phrases(読み込んだ生データ)から、状況の集計を作る
function summarize(words, phrases) {
  const used = new Set();
  phrases.forEach(p => (p.wordIds || []).forEach(id => used.add(id)));
  return {
    words: Object.assign(idStatus(words, 'w'), {
      byCat: tally(words, w => w.cat),
      byLevel: tally(words, w => w.level),
      byPos: tally(words, w => w.pos || (w.art || w.g ? 'noun' : '')),
      unusedInPhrases: words.filter(w => !used.has(w.id)).length
    }),
    phrases: Object.assign(idStatus(phrases, 'p'), {
      byScene: tally(phrases, p => p.scene),
      byLevel: tally(phrases, p => p.level)
    })
  };
}

function format(sum) {
  const line = o =>
    Object.keys(o)
      .map(k => k + ' ' + o[k])
      .join(' / ');
  const out = [];
  const part = (title, s) => {
    out.push(
      title + ': ' + s.count + '件 / 最大番号 ' + s.max + ' / 次のID ' + s.next,
      '  欠番: ' +
        (s.gaps.length ? s.gaps.join(', ') : 'なし') +
        ' / 連番でないID: ' +
        (s.odd.length ? s.odd.join(', ') : 'なし') +
        (s.malformed.length
          ? ' / 形式が不正なID: ' +
            s.malformed.map(m => m.id + (m.expected ? '(→' + m.expected + ')' : '')).join(', ')
          : '') +
        ' / 重複ID: ' +
        (s.dups.length ? s.dups.join(', ') : 'なし')
    );
  };
  part('単語', sum.words);
  out.push('  レベル: ' + line(sum.words.byLevel), '  品詞: ' + line(sum.words.byPos));
  out.push('  カテゴリ: ' + line(sum.words.byCat));
  out.push('  構文の wordIds から参照されていない単語: ' + sum.words.unusedInPhrases + '語');
  part('構文', sum.phrases);
  out.push('  レベル: ' + line(sum.phrases.byLevel), '  場面: ' + line(sum.phrases.byScene));
  return out.join('\n');
}

module.exports = { summarize, idStatus, idFormatProblem, makeId, format };

if (require.main === module) {
  try {
    console.log(format(summarize(loadWordData().words, loadPhraseData().phrases)));
  } catch (e) {
    console.error('教材を読み込めません: ' + e.message);
    process.exit(1);
  }
}
