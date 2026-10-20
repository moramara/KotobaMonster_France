'use strict';
// 構文トレーニングのテスト用の共通部品(*.test.js ではないので、単独ではテストとして実行されない)
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { boot, read } = require('./harness.js');
const PhraseLib = require('../src/lib/phraselib.js');
const { loadPhraseData } = require('../scripts/load_phrases.js');
const { loadWordData } = require('../scripts/load_words.js');

const KEY = 'kotoba-monster-v1';
// 書き出し(Blob / URL)と読み上げのスタブ
const STUBS =
  "globalThis.__blobs = []; globalThis.Blob = function (parts) { globalThis.__blobs.push(parts[0]); }; globalThis.URL = { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} };" +
  "globalThis.__spoken = []; globalThis.speechSynthesis = { getVoices() { return [{ lang: 'fr-FR' }]; }, cancel() {}, speak(u) { globalThis.__spoken.push(u.text); }, addEventListener() {} }; globalThis.SpeechSynthesisUtterance = function (t) { this.text = t; };";
// 本物の words.js / phrases.js / phraselib.js
// を読み込んだ状態でゲームを起動する(構文は新しい単語IDも参照するため、単語も本番データを使う)
function bootP(o) {
  o = o || {};
  return boot(
    Object.assign({ wordsCode: read('data/words.js') }, o, {
      extraCode:
        STUBS +
        '\n' +
        read('src/lib/phraselib.js') +
        '\n' +
        read('data/phrases.js') +
        '\n' +
        (o.extraCode || '')
    })
  );
}
const plain = x => JSON.parse(JSON.stringify(x));
function realPhrases() {
  const d = loadPhraseData();
  return { phrases: plain(d.phrases), scenes: plain(d.scenes) };
}
const wordIds = () => plain(loadWordData().words).map(w => w.id);
const wordCount = () => loadWordData().words.length;
// 再現できる乱数(mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const prepared = () =>
  PhraseLib.prepare(realPhrases().phrases, { wordIds: wordIds(), scenes: realPhrases().scenes })
    .phrases;

// 現在の問題に正解(ok=true)/不正解(false)で答える
function answerQ(g, ok) {
  const q = g.k.view().q;
  if (q.kind === 'ordering') {
    const ord = q.p.chunks.map((_, i) => 'c' + i);
    if (!ok) ord.reverse();
    ord.forEach(c => g.click('padd', { c }));
    g.click('pcheck');
  } else g.click('pans', { i: String(q.opts.findIndex(o => o.ok === ok)) });
}
// セッションを最後まで進める
function playAll(g, ok) {
  let n = 0;
  while (g.k.view().mode === 'pquiz' && n++ < 60) {
    answerQ(g, ok);
    g.click('pnext');
  }
}

/* ---- HTMLの簡易チェック: 正しく閉じた属性だけのタグを除いて < > が残らず、
   未知の属性・危険なタグがない ---- */
const TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[a-zA-Z][a-zA-Z0-9-]*(?:="[^"<>]*")?)*\s*\/?>/g;
const ATTR_OK =
  /^(class|id|style|title|type|value|placeholder|autocomplete|autocapitalize|spellcheck|aria-label|aria-pressed|disabled|selected|hidden|accept|data-[a-z]+)$/;
function lint(html, label) {
  const tags = [];
  const rest = html.replace(TAG, t => {
    tags.push(t);
    return '';
  });
  assert.ok(
    !/[<>]/.test(rest),
    label + ': 不正なタグが残っています: ' + (rest.match(/.{0,30}[<>].{0,30}/) || [''])[0]
  );
  tags.forEach(tag => {
    tag
      .replace(/="[^"]*"/g, '')
      .replace(/^<\/?[a-zA-Z0-9]+/, '')
      .replace(/\/?>$/, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .forEach(a => {
        assert.ok(ATTR_OK.test(a), label + ': 想定外の属性 "' + a + '" (' + tag.slice(0, 80) + ')');
        assert.ok(!/^on/i.test(a), label + ': イベントハンドラ属性');
      });
    assert.ok(
      !/^<\/?(script|img|iframe|svg|style|link|object|embed)\b/i.test(tag),
      label + ': 危険なタグ ' + tag.slice(0, 40)
    );
  });
}
module.exports = {
  bootP,
  KEY,
  wordCount,
  plain,
  realPhrases,
  wordIds,
  rng,
  prepared,
  answerQ,
  playAll,
  lint,
  PhraseLib,
  STUBS
};
