/* growth.js — モンスターの進化段階と称号(画面から独立した、純粋なロジック)
   ブラウザでは window.Growth、Node では require('./growth.js') で使えます。DOM・localStorage には
   触りません。

   ■ 単語を増やしたときに編集する場所はここです。
     ・STAGES: 進化段階。n は「習得済みになった最大の語数」。
     ・TITLES: 称号。n は習得語数の節目。
     単語数が n に届かない段階・称号は、目標として表示されません(nextStage / visibleTitles の
     vocabCount で判定)。教材を足すと、次の段階が自動で現れます。
   ■ n は小さい順に並べる(stageOf / titleOf が並び順を前提にしています)。 */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.Growth = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 進化段階(モンスターの姿)。n は「習得済みになった最大の語数」。
     単語数が n に届かない段階は、目標として表示しない
     (単語が30語のうちは26語で最終進化。語彙を増やすと、次の段階が自動で現れる)。 */
  const STAGES = [
    { n: 0, e: '🥚', name: 'たまご' },
    { n: 3, e: '🐣', name: 'ことひよ' },
    { n: 8, e: '🐥', name: 'ことどり' },
    { n: 16, e: '🦉', name: 'ことふくろう' },
    { n: 26, e: '🐲', name: 'ことドラゴン' },
    { n: 60, e: '🦄', name: 'ことユニコーン' },
    { n: 120, e: '🐉', name: 'ことりゅうおう' },
    { n: 300, e: '👑', name: 'ことおうさま' },
    // ---- 300語より先の長期目標。登録語数がその n に届くまでは、目標として表示されない ----
    { n: 500, e: '🦅', name: 'ことグリフォン' },
    { n: 750, e: '🐎', name: 'ことペガサス' },
    { n: 1000, e: '🔥', name: 'ことフェニックス' },
    { n: 1500, e: '🐕', name: 'ことケルベロス' },
    { n: 2000, e: '🦖', name: 'ことドラゴンキング' },
    { n: 3000, e: '🌈', name: 'こと天空の王' },
    { n: 5000, e: '🌟', name: 'ことスターマスター' },
    { n: 7500, e: '🌌', name: 'ことギャラクシー' },
    { n: 10000, e: '🪐', name: 'ことコスモマスター' },
    { n: 15000, e: '🌍', name: 'ことプラネットロード' },
    { n: 20000, e: '🌠', name: 'ことユニバースキング' }
  ];
  // 称号(習得語数の節目)。習得語数の最大値で決まるので、復習で習得済みが減っても失われない
  const TITLES = [
    { n: 10, name: 'ことば見習い' },
    { n: 25, name: 'ことば使い' },
    { n: 50, name: 'ことば名人' },
    { n: 100, name: 'ことば博士' },
    { n: 250, name: 'ことば賢者' },
    { n: 500, name: 'ことば王' },
    { n: 750, name: 'ことば探検家' },
    { n: 1000, name: 'ことば伝説' },
    { n: 1500, name: 'ことば勇者' },
    { n: 2000, name: 'ことば大賢者' },
    { n: 3000, name: 'ことば英雄' },
    { n: 5000, name: 'ことば超人' },
    { n: 7500, name: 'ことば宇宙探検家' },
    { n: 10000, name: 'ことば銀河伝説' },
    { n: 15000, name: 'ことば星雲の支配者' },
    { n: 20000, name: 'ことば宇宙王' }
  ];

  // モンスターの進化段階(習得した最大語数 n から決まる)
  function stageOf(n) {
    let s = STAGES[0];
    STAGES.forEach(x => {
      if (n >= x.n) s = x;
    });
    return s;
  }
  // 次の進化段階(単語数 vocabCount に届かない段階は除く。最終段階ならなし)
  const nextStage = (n, vocabCount) => STAGES.find(x => x.n > n && x.n <= vocabCount);
  // 習得数 n に応じた称号(なければ null)
  const titleOf = n => TITLES.filter(t => n >= t.n).pop() || null;
  // 称号の一覧のうち、画面に出すもの(獲得済み、または単語数 vocabCount で届く節目)
  const visibleTitles = (n, vocabCount) => TITLES.filter(t => n >= t.n || t.n <= vocabCount);

  return { STAGES, TITLES, stageOf, nextStage, titleOf, visibleTitles };
});
