# 開発ガイド

開発環境の準備、コマンド、コードの構成、変更するときの注意をまとめます。

- 教材データの追加は [CONTENT_GUIDE.md](CONTENT_GUIDE.md)
- 各機能の仕様・保存データは [SPECS.md](SPECS.md)

## 1. 開発環境の準備

- ゲーム本体は HTML・CSS・JavaScript だけで動きます(ビルド不要・依存ライブラリなし)。`index.html` をブラウザで開けば遊べます。
- 検証とテストの実行には **Node 18 以上**が必要です(`npm install` は不要。外部パッケージは使いません)。
- 整形(`npm run format` / `format:check`)だけは、`npx` で Prettier を一時的に使うため、ネットワークが必要です。
- エディタ設定は `.editorconfig`、書式は `.prettierrc.json`(幅100・シングルクォート・末尾カンマなし・字下げ2)です。

## 2. npm scripts

| コマンド | 内容 |
|---|---|
| `npm test` | 構文チェック → 教材の検証 → すべての自動テスト(`node --test tests/*.test.js`) |
| `npm run validate` | 単語・構文のスキーマ検証と、編集ルールの検証(`validate_words.js` / `validate_phrases.js` / `validate_policy.js`) |
| `npm run check` | `data` `src` `scripts` `tests` の全 `.js` の構文チェック(`scripts/check_syntax.js`) |
| `npm run content:status` | 教材の件数・次のID・欠番・偏りの表示(読むだけ) |
| `npm run format` / `npm run format:check` | Prettier による整形 / 確認(ネットワークが必要) |
| `node scripts/validate_words.js --strict` など | 各検証は `--strict`(警告も失敗扱い)と `--quiet`(警告の個別表示を省略)を受け付ける |

## 3. ソースの構成

```
index.html            画面の土台。先頭にテーマの先読みスクリプト。スクリプトの読み込み順もここ
css/style.css         見た目(配色はすべて CSS 変数。先頭の目次から探せる)
data/                 教材データ(自動整形の対象外)
src/app.js            ゲーム本体(画面・操作・学習記録)
src/lib/              画面から独立したロジック(ブラウザ / Node の両方で動く。DOM・localStorage には触らない)
scripts/              検証・確認用(ゲームを起動せずに実行)
tests/                自動テスト(node --test)。fixtures/ は出荷済み教材の基準データ
docs/                 ドキュメント
```

### スクリプトの読み込み順(`index.html`)

`data/words.js` → `src/lib/wordlib.js` → `src/lib/keymap.js` → `src/lib/growth.js` → `src/lib/speech.js` → `data/phrases.js` → `src/lib/phraselib.js` → `src/app.js`

`app.js` は、先に読み込まれたグローバル(`WORDS` `WordLib` `KeyMap` `Growth` `Speech` `PHRASES` `PhraseLib`)を使います。**順序を変えない**でください(`phrases.js` → `phraselib.js` → `app.js` の連続はテストも確認します)。

### `src/lib/` の各モジュール

| ファイル | 責務 |
|---|---|
| `wordlib.js` | 単語の検証・正規化・出題(選択肢)生成・検索・冠詞チェック |
| `phraselib.js` | 構文の検証・問題生成・採点・学習記録・復習・報酬ルール |
| `keymap.js` | キーボードショートカットの割り当て(初期設定・重複と禁止キーの検査・保存形式) |
| `growth.js` | モンスターの進化段階(`STAGES`)・称号(`TITLES`)と判定関数。単語を増やしたときの編集もここ |
| `speech.js` | フランス語の読み上げ(Web Speech API の薄い包み)。お知らせは呼び出し側が渡す |

### `src/app.js` の構成

状態は2つだけです。`state` = 学習記録(`localStorage` に保存)/ `view` = いまの画面(保存しない)。先頭に17章の目次があり、各章は `/* ===== N. 題名 ===== */` の見出しで始まります。

- **画面を出す流れ**: `go(mode)` → `render()` → `screenHtml(mode)` → `v〜()` が HTML 文字列を返す。ボタンは `data-act` を持ち、クリックもキーボードも `handleAct()` が処理する。
- **名前の付け方**: `v〜` = 画面の HTML / `〜Html` = HTML の部品 / `p〜` = 構文トレーニング / `bot〜` = BOT / `kb〜`・`key〜` = キーボード / `km〜` = キー設定の保存。
- **学習記録を書き換えるのは**、バトル・復習の回答(`answer`)、構文の回答(`answerPhrase`)、学習画面の通過(`markIntro`)、記録の読み込み・リセットだけ。BOT・キー設定・テーマは記録に触れない。

### なぜ `app.js` を1ファイルのままにしているか

画面・状態・操作が `state` / `view` / `$app` を共有しているため、1つの即時関数にまとまっています。画面と無関係で、状態を持たないロジックだけを `src/lib/` に切り出しました。

- **切り出し済み**: 検証・問題生成・採点・キー割り当て・進化段階と称号・読み上げ。
- **`app.js` に残している処理と理由**:
  - 保存と移行(第5章): 保存形式の互換性が最優先で、`THEME_KEY` や `v: 4` などのソース文字列を直接確認するテストがある。
  - 表示テーマ(第2章): 同上。`index.html` の先読みスクリプトと規則を共有している。
  - BOT(第13章)・キーボード(第16章)・各画面: `view` やタイマー、DOM と密結合している。
- **今後の分割の候補(安全度の高い順)**:
  1. 保存と移行を、`clock` / 単語・構文の一覧を注入する純粋関数として切り出す(保存形式を確認するテストの検査先を合わせて更新する)。
  2. キーボードの「どのボタンを押すか」の判定を、DOM 非依存の部分から切り出す。
  3. BOT のタイマーと読み上げ制御を切り出す。
- 行数だけを理由に分割しません。分割するときは、1段階ごとに `npm test` を通し、保存データと復習・タイマー・BOT の挙動が変わらないことを確認します。

### 新しい `src/lib/*.js` を足すとき

1. 画面・`localStorage`・`state` / `view` に触れない純粋なロジックにする。ブラウザでは `window.<名前>`、Node では `require` で使える形にする(`keymap.js` / `growth.js` と同じ書き方)。
2. `index.html` に `<script>` を追加する(`app.js` より前)。
3. `tests/harness.js` の `boot()` にも同じ読み込みを追加する(テストの仮想ブラウザが `app.js` より前に読む必要がある)。
4. 単体テストを `tests/` に足す。

## 4. テスト

`node --test tests/*.test.js`。ゲーム本体は、`tests/harness.js` が作る最小限の DOM スタブの上で、本物の `app.js` を動かして確認します(外部ライブラリなし)。

| ファイル | 内容 |
|---|---|
| `app.test.js` `article.test.js` `wordlib.test.js` `words_data.test.js` | 統合・冠詞判定・単語ロジック・数千語の規模・教材データの見直し |
| `html_safety.test.js` | HTML の安全性(動的な文字列のエスケープ) |
| `phrase_data.test.js` `phrase_logic.test.js` `phrase_app.test.js` | 構文トレーニング(データ・ロジック・画面) |
| `content_baseline.test.js` | 出荷済み教材の ID・並び順・内容の保護 |
| `content_expansion.test.js` `content_r2.test.js` `content_fixes.test.js` | 追加教材の正確さ・連携・互換、既存教材の説明の修正、ドキュメントと実装の整合 |
| `bot.test.js` `theme.test.js` `keyboard.test.js` | BOT・表示テーマ・キーボードショートカット |
| `growth_speech.test.js` | 進化段階・称号・読み上げの単体と、`app.js` との統合 |
| `validate_policy.test.js` `content_status.test.js` `syntax.test.js` | 編集ルールの検証・教材の状況・全 `.js` の構文 |
| `harness.js` `baseline.js` `phrase_boot.js` | テストの共通部品(単独ではテストとして実行されない) |

- テストを通すためだけに、期待値を変えないでください。教材を足して失敗するときは、教材を見直します。
- CSS は人が読みやすい形(1行に1宣言・コメント入り)で書き、テストは `harness.js` の `readCss()` が返す圧縮形に対して正規表現で確認します。

## 5. コードを変更するときの注意

- **仕様とユーザー体験を変えない**。変えるときは [SPECS.md](SPECS.md) とテストも更新する。
- HTML の**要素 ID・`data-act`・CSS クラス**は、イベント処理・キーボード・テストが依存している。安易に変えない。
- **動的な文字列は必ず `esc()` を通して**HTML に埋め込む。読み上げ(`speak`)には、エスケープ前の文字列(`disp()`)を渡す(HTML 用は `dispH()`)。
- 色は `var(--…)` で使い、`css/style.css` の先頭の3ブロック以外に直接書かない。新しい色は3ブロックすべてに足す(詳細は [SPECS.md](SPECS.md) の「表示テーマ」)。
- **学習記録の保存形式・移行処理を変えない**。必要が出たときは、必要性を説明し、移行と退避キーを検証してから変える(キー一覧は [SPECS.md](SPECS.md))。
- 復習・タイマー・BOT・自動学習の挙動を変えない。BOT は学習記録を読むだけで、書き換えない。
- 整形の対象外: `data/`(「1行に1語・1構文」の表の形)と `tests/fixtures/`。`app.js` の HTML テンプレート文字列は、出力される空白を変えないため、長い行のままにしている。
- 不要なライブラリ・ビルド環境・フレームワークを導入しない。

## 6. 育成の拡張

- 進化段階は `src/lib/growth.js` の `STAGES`、称号は `TITLES` で定義します(`n` は昇順)。単語数が `n` に届かない間は、その段階は目標として表示されません(単語を増やすと自動で次の目標が現れます)。
- 選択肢の優先順位は `src/lib/wordlib.js` の `RANKERS`(学習済み > 同カテゴリ > 同品詞)。`makeQuestion` の `rank` を差し替えれば難易度別の出題にできます。
