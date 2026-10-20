'use strict';
// src/lib/growth.js(進化段階・称号)と src/lib/speech.js(読み上げ)のテスト。
// app.js から切り出したモジュールなので、単体の動作と、app.js が実際にそれを使っていることを確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/lib/growth.js');
const { createSpeech } = require('../src/lib/speech.js');
const { boot, read, synthWords } = require('./harness.js');

// ---- growth ----
test('育成: STAGES / TITLES は n が昇順・重複なしで、最初の段階は n=0(単語を足すときの書き間違いを検出)', () => {
  const asc = a => a.every((x, i) => i === 0 || x.n > a[i - 1].n);
  assert.ok(asc(G.STAGES) && asc(G.TITLES));
  assert.equal(G.STAGES[0].n, 0);
  assert.ok(G.STAGES.every(s => s.e && s.name) && G.TITLES.every(t => t.name));
});
test('育成: stageOf は習得数の境界で段階が変わる(出荷時の値)', () => {
  assert.equal(G.stageOf(0).name, 'たまご');
  assert.equal(G.stageOf(2).name, 'たまご');
  assert.equal(G.stageOf(3).name, 'ことひよ');
  assert.equal(G.stageOf(25).name, 'ことふくろう');
  assert.equal(G.stageOf(26).name, 'ことドラゴン');
  assert.equal(G.stageOf(299).name, 'ことりゅうおう');
  assert.equal(G.stageOf(300).name, 'ことおうさま');
  assert.equal(G.stageOf(499).name, 'ことおうさま', '300語〜499語は従来どおり「ことおうさま」');
  // 300語より先の段階を足したので、10000語は「ことコスモマスター」(以前の最終進化は300語の段階だった)
  assert.equal(G.stageOf(10000).name, 'ことコスモマスター');
});
test('育成: nextStage は、単語数(vocabCount)に届かない段階を目標にしない。最終段階では undefined', () => {
  assert.equal(G.nextStage(0, 30).n, 3);
  assert.equal(G.nextStage(26, 30), undefined, '30語のうちは26語で最終進化');
  assert.equal(G.nextStage(26, 60).n, 60, '60語に増えると次の段階が現れる');
  // 300語の「ことおうさま」は最終進化ではなくなった。単語が500語以上あれば次の目標が現れる
  assert.equal(G.nextStage(300, 5000).n, 500);
  assert.equal(
    G.nextStage(300, 499),
    undefined,
    '登録語数が500語に届かないうちは、300語が最終進化'
  );
  assert.equal(G.nextStage(20000, 99999), undefined, '最後の段階では次の目標はない');
});
test('育成: titleOf / visibleTitles', () => {
  assert.equal(G.titleOf(9), null);
  assert.equal(G.titleOf(10).name, 'ことば見習い');
  assert.equal(G.titleOf(99).name, 'ことば名人');
  assert.equal(G.titleOf(999).name, 'ことば探検家');
  assert.equal(G.titleOf(1000).name, 'ことば伝説');
  // 1000語より先の称号を足したので、5000語は「ことば超人」(以前の最高称号は1000語の「ことば伝説」)
  assert.equal(G.titleOf(5000).name, 'ことば超人');
  assert.deepEqual(
    G.visibleTitles(0, 30).map(t => t.n),
    [10, 25]
  );
  assert.deepEqual(
    G.visibleTitles(100, 30).map(t => t.n),
    [10, 25, 50, 100],
    '獲得済みの称号は、単語数に関係なく出る'
  );
});

// ---- growth: 長期育成(300語以降の進化段階・追加した称号) ----
const OLD_STAGES = [
  [0, '🥚', 'たまご'],
  [3, '🐣', 'ことひよ'],
  [8, '🐥', 'ことどり'],
  [16, '🦉', 'ことふくろう'],
  [26, '🐲', 'ことドラゴン'],
  [60, '🦄', 'ことユニコーン'],
  [120, '🐉', 'ことりゅうおう'],
  [300, '👑', 'ことおうさま']
];
const NEW_STAGES = [
  [500, 'ことグリフォン'],
  [750, 'ことペガサス'],
  [1000, 'ことフェニックス'],
  [1500, 'ことケルベロス'],
  [2000, 'ことドラゴンキング'],
  [3000, 'こと天空の王'],
  [5000, 'ことスターマスター'],
  [7500, 'ことギャラクシー'],
  [10000, 'ことコスモマスター'],
  [15000, 'ことプラネットロード'],
  [20000, 'ことユニバースキング']
];
const OLD_TITLES = [
  [10, 'ことば見習い'],
  [25, 'ことば使い'],
  [50, 'ことば名人'],
  [100, 'ことば博士'],
  [250, 'ことば賢者'],
  [500, 'ことば王'],
  [1000, 'ことば伝説']
];
const NEW_TITLES = [
  [750, 'ことば探検家'],
  [1500, 'ことば勇者'],
  [2000, 'ことば大賢者'],
  [3000, 'ことば英雄'],
  [5000, 'ことば超人'],
  [7500, 'ことば宇宙探検家'],
  [10000, 'ことば銀河伝説'],
  [15000, 'ことば星雲の支配者'],
  [20000, 'ことば宇宙王']
];
const KEY = 'kotoba-monster-v1';
test('育成: 既存の進化段階(300語まで)は n・絵文字・名前とも変わっていない', () => {
  assert.deepEqual(
    G.STAGES.slice(0, OLD_STAGES.length).map(s => [s.n, s.e, s.name]),
    OLD_STAGES
  );
});
test('育成: 追加した進化段階は仕様どおりの語数・名前で、300語の次に昇順で並ぶ', () => {
  assert.deepEqual(
    G.STAGES.slice(OLD_STAGES.length).map(s => [s.n, s.name]),
    NEW_STAGES
  );
  assert.equal(G.STAGES.length, OLD_STAGES.length + NEW_STAGES.length);
});
test('育成: すべての進化段階に絵文字と名前があり、絵文字・名前・n に重複がない(昇順で並ぶ)', () => {
  const uniq = a => new Set(a).size === a.length;
  assert.ok(
    G.STAGES.every(s => typeof s.e === 'string' && s.e && typeof s.name === 'string' && s.name)
  );
  assert.ok(uniq(G.STAGES.map(s => s.e)), '絵文字の重複なし(段階が見分けられる)');
  assert.ok(uniq(G.STAGES.map(s => s.name)), '名前の重複なし');
  assert.ok(uniq(G.STAGES.map(s => s.n)), 'n の重複なし');
  assert.ok(
    G.STAGES.every((s, i) => i === 0 || s.n > G.STAGES[i - 1].n),
    'n は昇順'
  );
  assert.ok(
    G.STAGES.every(s => s.n === 0 || Number.isInteger(s.n)),
    'n は整数'
  );
});
test('育成: 299→300 の既存境界は維持され、新しい段階の境界(n-1 → n)でちょうど段階が変わる', () => {
  assert.equal(G.stageOf(299).name, 'ことりゅうおう');
  assert.equal(G.stageOf(300).name, 'ことおうさま');
  const all = G.STAGES;
  NEW_STAGES.forEach(([n, name]) => {
    const i = all.findIndex(s => s.n === n);
    assert.equal(G.stageOf(n - 1).name, all[i - 1].name, n - 1 + '語はひとつ前の段階');
    assert.equal(G.stageOf(n).name, name, n + '語で進化');
    assert.equal(G.stageOf(n + 1).name, name, n + 1 + '語も同じ段階');
  });
  // 仕様に明記された境界
  assert.equal(G.stageOf(499).name, 'ことおうさま');
  assert.equal(G.stageOf(500).name, 'ことグリフォン');
  assert.equal(G.stageOf(749).name, 'ことグリフォン');
  assert.equal(G.stageOf(750).name, 'ことペガサス');
  assert.equal(G.stageOf(999).name, 'ことペガサス');
  assert.equal(G.stageOf(1000).name, 'ことフェニックス');
  assert.equal(G.stageOf(1000000).name, 'ことユニバースキング');
});
test('育成: 登録語数に届かない将来の進化段階は目標にならず、語数が増えると次の目標が順に現れる', () => {
  // 637語 + 100語 = 737語のとき: 500語は目標になるが、750語は目標にならない
  assert.equal(G.nextStage(300, 737).n, 500);
  assert.equal(G.nextStage(500, 737), undefined, '750語は、750語以上が登録されるまで表示しない');
  assert.equal(G.nextStage(500, 749), undefined);
  assert.equal(G.nextStage(500, 750).n, 750, '750語が登録されると、次の目標として現れる');
  // すべての段階について、「登録語数が n-1 なら目標にならない / n なら目標になる」
  for (let i = 1; i < G.STAGES.length; i++) {
    const prev = G.STAGES[i - 1].n,
      cur = G.STAGES[i].n;
    assert.equal(
      G.nextStage(prev, cur - 1),
      undefined,
      cur + '語の段階は ' + (cur - 1) + '語では出ない'
    );
    assert.equal(G.nextStage(prev, cur).n, cur, cur + '語の段階は ' + cur + '語で出る');
    // 習得数が段階の途中にいても、次に目指すのは次の段階
    assert.equal(G.nextStage(prev + 1, cur).n, cur);
  }
});
test('称号: 既存の称号は変わっておらず、追加した称号は仕様どおりの語数・名前で昇順に並ぶ', () => {
  assert.deepEqual(
    G.TITLES.slice(0, 6).map(t => [t.n, t.name]),
    OLD_TITLES.slice(0, 6),
    '10〜500語の既存の称号'
  );
  assert.deepEqual(
    G.TITLES.map(t => [t.n, t.name]),
    OLD_TITLES.concat(NEW_TITLES).sort((a, b) => a[0] - b[0]),
    '既存の7つ + 追加の9つ(既存の1000語の称号も維持)'
  );
  const uniq = a => new Set(a).size === a.length;
  assert.ok(G.TITLES.every(t => typeof t.name === 'string' && t.name));
  assert.ok(uniq(G.TITLES.map(t => t.n)) && uniq(G.TITLES.map(t => t.name)));
  assert.ok(
    G.TITLES.every((t, i) => i === 0 || t.n > G.TITLES[i - 1].n),
    'n は昇順'
  );
});
test('称号: 取得の境界(n-1 では前の称号、n で新しい称号)。習得数が増えると適切な称号が得られる', () => {
  const all = G.TITLES;
  all.forEach((t, i) => {
    assert.equal(G.titleOf(t.n).name, t.name, t.n + '語で獲得');
    assert.equal(G.titleOf(t.n + 1).name, t.name);
    if (i === 0) assert.equal(G.titleOf(t.n - 1), null, '最初の称号の前は称号なし');
    else assert.equal(G.titleOf(t.n - 1).name, all[i - 1].name, t.n - 1 + '語では前の称号');
  });
  NEW_TITLES.forEach(([n, name]) => {
    assert.equal(G.titleOf(n - 1).name !== name, true);
    assert.equal(G.titleOf(n).name, name);
  });
  // 習得数が増えても、称号が下がることはない(順に上がる)
  let last = -1;
  for (const n of [
    0, 9, 10, 49, 250, 499, 500, 749, 750, 999, 1000, 1499, 1500, 1999, 2000, 2999, 3000, 4999,
    5000, 7499, 7500, 9999, 10000, 14999, 15000, 19999, 20000, 50000
  ]) {
    const t = G.titleOf(n),
      idx = t ? G.TITLES.indexOf(t) : -1;
    assert.ok(idx >= last, n + '語で称号が下がらない');
    last = idx;
  }
});
test('称号: 到達できる称号だけが目標一覧に出る。獲得済みの称号は登録語数に関係なく失われない', () => {
  const ns = (best, vocab) => G.visibleTitles(best, vocab).map(t => t.n);
  // 737語: 500語の称号までは目標に出るが、750語以降は出ない
  assert.deepEqual(ns(0, 737), [10, 25, 50, 100, 250, 500]);
  assert.deepEqual(ns(0, 750), [10, 25, 50, 100, 250, 500, 750], '750語になると新しい称号が現れる');
  assert.deepEqual(ns(0, 999), [10, 25, 50, 100, 250, 500, 750]);
  assert.deepEqual(ns(0, 1000), [10, 25, 50, 100, 250, 500, 750, 1000]);
  assert.deepEqual(ns(0, 1500).slice(-1), [1500]);
  assert.deepEqual(
    ns(0, 20000),
    G.TITLES.map(t => t.n),
    '20000語あれば全部'
  );
  // 登録語数が少なくても、獲得済みの称号は出る(教材が減っても失われない)
  assert.deepEqual(ns(3000, 30), [10, 25, 50, 100, 250, 500, 750, 1000, 1500, 2000, 3000]);
  // どんな (習得数, 登録語数) でも、獲得済みの称号は一覧に含まれる
  [0, 10, 499, 500, 750, 1500, 3000, 20000].forEach(best =>
    [0, 30, 637, 737, 750, 5000].forEach(vocab => {
      const vis = ns(best, vocab);
      G.TITLES.filter(t => best >= t.n).forEach(t =>
        assert.ok(vis.includes(t.n), best + '語・登録' + vocab + '語で ' + t.name + ' が消えない')
      );
      assert.ok(
        vis.every(n => n <= Math.max(best, vocab)),
        '届かない称号は出ない'
      );
    })
  );
});
test('統合: 登録語数が737語なら500語の進化目標は出るが、750語の目標は出ない(語数が増えると現れる)', () => {
  const a = boot({ wordsCode: synthWords(737) });
  a.k.state().best = 300;
  a.click('home');
  assert.match(a.html(), /ことおうさま/);
  assert.match(a.html(), /あと200語おぼえると進化/, '500語の「ことグリフォン」が目標');
  a.k.state().best = 500;
  a.click('home');
  assert.match(a.html(), /ことグリフォン/);
  assert.match(a.html(), /🦅/);
  assert.match(a.html(), /最終進化/, '750語に届かないので、いまは次の目標なし');
  assert.doesNotMatch(a.html(), /ことペガサス/);
  assert.match(a.html(), /🏅 <b>ことば王/);
  assert.doesNotMatch(a.html(), /ことば探検家/, '750語の称号は、750語以上登録されるまで出ない');
  // 語数が増えて750語以上になると、新しい進化目標と称号が自動で現れる
  const b = boot({ wordsCode: synthWords(800) });
  b.k.state().best = 500;
  b.click('home');
  assert.match(b.html(), /あと250語おぼえると進化/, '750語の「ことペガサス」が目標に現れる');
  assert.doesNotMatch(b.html(), /最終進化/);
  assert.match(b.html(), /🔒 <b>ことば探検家/, '750語の称号が目標に現れる(鍵つき)');
  b.k.state().best = 750;
  b.click('home');
  assert.match(b.html(), /ことペガサス/);
  assert.match(b.html(), /🏅 <b>ことば探検家/);
});
test('統合: 習得数の過去最高値から、新しい段階・称号が反映される。獲得済みの称号は教材が少なくても残る', () => {
  const g = boot();
  g.k.state().best = 3000;
  g.click('home');
  assert.match(g.html(), /こと天空の王/);
  assert.match(g.html(), /称号: ことば英雄/);
  assert.match(g.html(), /🏅 <b>ことば英雄/, '登録語数が30語でも、獲得済みの称号は一覧に残る');
  assert.match(g.html(), /🏅 <b>ことば王/);
  g.k.state().best = 20000;
  g.click('home');
  assert.match(g.html(), /ことユニバースキング/);
  assert.match(g.html(), /称号: ことば宇宙王/);
  assert.match(g.html(), /最終進化/);
});
test('互換性: 既存の学習記録(best=600 など)は初期化されず、新しい段階が反映される。保存形式は変わらない', () => {
  const raw = JSON.stringify({
    v: 4,
    xp: 123,
    best: 600,
    w: {},
    ph: {},
    pbest: 0,
    pd: { d: '', xp: 0 }
  });
  const g = boot({ storage: { [KEY]: raw }, wordsCode: synthWords(737) });
  assert.equal(g.k.state().best, 600, 'best を書き換えない');
  assert.equal(g.k.state().xp, 123, '経験値も保たれる');
  g.click('home');
  assert.match(g.html(), /ことグリフォン/, '600語まで習得した記録は、新しい段階に反映される');
  assert.match(g.html(), /称号: ことば王/);
  assert.equal(g.store[KEY], raw, '表示しただけでは保存データを書き換えない');
  assert.equal(JSON.parse(g.store[KEY]).v, 4, '保存形式のバージョンは v4 のまま');
  assert.ok(!Object.keys(g.store).some(k => k.startsWith(KEY + '-')), '退避キーも作られない');
});

// ---- speech ----
function fakeWin(voices, opt) {
  opt = opt || {};
  const log = { spoken: [], cancels: 0, listeners: {} };
  const win = {
    SpeechSynthesisUtterance: function (t) {
      this.text = t;
    },
    speechSynthesis: {
      getVoices: () => voices,
      cancel() {
        log.cancels++;
        if (opt.cancelThrows) throw new Error('x');
      },
      speak(u) {
        if (opt.speakThrows) throw new Error('x');
        log.spoken.push(u);
      },
      addEventListener(t, f) {
        log.listeners[t] = f;
      }
    }
  };
  return { win, log };
}
test('読み上げ: 読み上げの仕組みがない環境では、supported=false。speak は false を返して知らせる', () => {
  const msgs = [],
    sp = createSpeech({ win: {}, notify: m => msgs.push(m) });
  assert.equal(sp.supported, false);
  assert.equal(sp.speechOK(), false);
  assert.equal(sp.speak('bonjour'), false);
  assert.deepEqual(msgs, ['この端末では音声が使えません']);
  assert.doesNotThrow(() => sp.cancel());
});
test('読み上げ: fr-FR を優先し、なければ fr で始まる声。速度 0.85・言語 fr-FR・onend を設定する', () => {
  const { win, log } = fakeWin([{ lang: 'en-US' }, { lang: 'fr_CA' }, { lang: 'fr-FR' }]);
  const sp = createSpeech({ win });
  assert.equal(sp.speechOK(), true);
  let ended = 0;
  assert.equal(sp.speak('chat', { onend: () => ended++ }), true);
  const u = log.spoken[0];
  assert.equal(u.text, 'chat');
  assert.equal(u.lang, 'fr-FR');
  assert.equal(u.rate, 0.85);
  assert.equal(u.voice.lang, 'fr-FR');
  u.onend();
  u.onerror();
  assert.equal(ended, 2, '終了・失敗のどちらでも onend を呼ぶ');
  const w2 = fakeWin([{ lang: 'fr-CA' }]);
  assert.equal(createSpeech({ win: w2.win }).speechOK(), true);
});
test('読み上げ: フランス語の声がないときは speechOK=false。speak は知らせたうえで続行し、voiceschanged で拾い直す', () => {
  const msgs = [],
    voices = [],
    { win, log } = fakeWin(voices),
    sp = createSpeech({ win, notify: m => msgs.push(m) });
  assert.equal(sp.speechOK(), false);
  assert.equal(sp.speak('eau'), true);
  assert.deepEqual(msgs, ['フランス語の音声が見つかりません']);
  voices.push({ lang: 'fr-FR' });
  log.listeners.voiceschanged();
  assert.equal(sp.speechOK(), true);
});
test('読み上げ: 失敗しても例外を出さず、知らせて false を返す。cancel も例外を出さない', () => {
  const msgs = [],
    { win } = fakeWin([{ lang: 'fr-FR' }], { speakThrows: true, cancelThrows: true }),
    sp = createSpeech({ win, notify: m => msgs.push(m) });
  assert.equal(sp.speak('x'), false);
  assert.deepEqual(msgs, ['音声を再生できませんでした']);
  assert.doesNotThrow(() => sp.cancel());
});

// ---- app.js との統合 ----
test('統合: app.js は、育成と読み上げを src/lib のモジュールから使い、同じ定義を持ち直していない', () => {
  const app = read('src/app.js');
  assert.ok(!/const STAGES\s*=/.test(app) && !/const TITLES\s*=/.test(app));
  assert.ok(!/new SpeechSynthesisUtterance/.test(app) && !/synth\.(speak|cancel)/.test(app));
  assert.match(app, /Growth/);
  assert.match(app, /Speech\.createSpeech/);
  const html = read('index.html');
  assert.match(
    html,
    /<script src="src\/lib\/keymap\.js"><\/script>\s*<script src="src\/lib\/growth\.js"><\/script>\s*<script src="src\/lib\/speech\.js"><\/script>[\s\S]*<script src="src\/app\.js">/,
    'app.js より前に読み込む'
  );
});
test('統合: ホームのモンスターは Growth の段階・称号で描かれる(習得数に応じて進化する)', () => {
  const g = boot();
  const html0 = g.html();
  assert.ok(html0.includes(G.STAGES[0].e) && html0.includes(G.STAGES[0].name));
  g.k.state().best = 10;
  g.click('home');
  const s = G.stageOf(10),
    t = G.titleOf(10);
  assert.ok(g.html().includes(s.name) && g.html().includes(t.name));
});
