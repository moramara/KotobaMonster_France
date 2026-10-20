// テスト専用の固定データ(出荷時の既存30語の凍結コピー)。本番の words.js を編集してもテストが壊れないようにするため。
// このファイルは編集しないでください。
// 単語データ。ここに W(...) を足すだけで単語を追加できます(ゲームのロジックは変更不要)。
// W(id, カテゴリ, 冠詞, 性(m/f/''), フランス語, 日本語訳, 絵文字, 発音カタカナ(目安), 例文, 例文訳, 追加情報(省略可))
//
// 追加情報 { ... } で指定できる項目(すべて省略可。品詞によって必要なものだけ書く):
//   pos    品詞: noun verb adjective adverb pronoun preposition conjunction interjection expression article numeral
//          (冠詞か性を書いた単語は名詞とみなされるので省略可。名詞以外は必ず指定)
//   level  学習レベル: A1 A2 B1 B2 C1 C2
//   alt    別訳の配列            例) alt: ['ネコ']       ※ 同じ日本語訳の語は誤答選択肢に並びません
//   syn    同義語(フランス語)の配列
//   forms  文法情報               例) forms: { plural: 'chats' } / 形容詞 { fem: 'belle' } / 動詞 { present: 'je parle, tu parles, ...' }
//   note   学習メモ
//   ipa    IPA発音記号            例) ipa: '/ʃa/'
//   img    true にすると名詞以外でも「絵→仏」問題に使う   noImage: true で絵の問題から外す
//
// 登録後は `npm run validate`(= node scripts/validate_words.js)で必ず検証してください。
// ID は一度決めたら変更しないでください(学習記録が ID で紐づいています)。
// 複数ファイルに分ける場合は words_xxx.js を作り、index.html の words.js の次に <script> を追加して WORDS.push(...) します。
const W = (id, cat, art, g, fr, ja, emoji, kana, ex, exJa, extra) => Object.assign({ id, cat, art, g, fr, ja, emoji, kana, ex, exJa }, extra || {});
// 使えるカテゴリの一覧(図鑑の並び順にもなります)。新カテゴリを作るときはここに追加します。綴りミスの検出にも使います。
const CATEGORIES = ['あいさつ', '動物', '食べ物', '身の回りの物', '自然'];
const WORDS = [
  W('w01', 'あいさつ', '', '', 'bonjour', 'こんにちは', '👋', 'ボンジュール', 'Bonjour, Marie !', 'こんにちは、マリー。', { pos: 'interjection', level: 'A1' }),
  W('w02', 'あいさつ', '', '', 'merci', 'ありがとう', '🙏', 'メルスィ', 'Merci beaucoup !', 'どうもありがとう!', { pos: 'interjection', level: 'A1' }),
  W('w03', 'あいさつ', '', '', 'salut', 'やあ', '😄', 'サリュ', 'Salut, ça va ?', 'やあ、元気?', { pos: 'interjection', level: 'A1' }),
  W('w04', 'あいさつ', '', '', 'au revoir', 'さようなら', '🚶', 'オ ルヴォワール', 'Au revoir, à demain !', 'さようなら、また明日。', { pos: 'expression', level: 'A1' }),
  W('w05', 'あいさつ', '', '', "s'il vous plaît", 'お願いします', '🥺', 'スィル ヴ プレ', "Un café, s'il vous plaît.", 'コーヒーをお願いします。', { pos: 'expression', level: 'A1' }),
  W('w06', 'あいさつ', '', '', 'oui', 'はい', '✅', 'ウィ', "Oui, j'aime ça.", 'はい、それが好きです。', { pos: 'adverb', level: 'A1' }),
  W('w07', 'あいさつ', '', '', 'non', 'いいえ', '❌', 'ノン', 'Non, merci.', 'いいえ、結構です。', { pos: 'adverb', level: 'A1' }),
  W('w08', '動物', 'le', 'm', 'chat', '猫', '🐱', 'シャ', 'Le chat dort.', '猫が寝ている。', { level: 'A1' }),
  W('w09', '動物', 'le', 'm', 'chien', '犬', '🐶', 'シヤン', 'Le chien joue dans le jardin.', '犬が庭で遊んでいる。', { level: 'A1' }),
  W('w10', '動物', "l'", 'm', 'oiseau', '鳥', '🐦', 'ロワゾー', "L'oiseau chante.", '鳥が歌っている。', { level: 'A1' }),
  W('w11', '動物', 'le', 'm', 'poisson', '魚', '🐟', 'ポワソン', 'Le poisson nage.', '魚が泳いでいる。', { level: 'A1' }),
  W('w12', '動物', 'la', 'f', 'vache', '牛', '🐄', 'ヴァッシュ', "La vache mange de l'herbe.", '牛が草を食べている。', { level: 'A1' }),
  W('w13', '動物', 'le', 'm', 'cheval', '馬', '🐴', 'シュヴァル', 'Le cheval court vite.', '馬は速く走る。', { level: 'A1' }),
  W('w14', '食べ物', 'la', 'f', 'pomme', 'りんご', '🍎', 'ポム', "J'aime la pomme.", 'りんごが好きです。', { level: 'A1' }),
  W('w15', '食べ物', 'le', 'm', 'pain', 'パン', '🍞', 'パン', 'Je mange du pain.', 'パンを食べます。', { level: 'A1' }),
  W('w16', '食べ物', 'le', 'm', 'fromage', 'チーズ', '🧀', 'フロマージュ', 'Le fromage est bon.', 'チーズはおいしい。', { level: 'A1' }),
  W('w17', '食べ物', "l'", 'f', 'eau', '水', '💧', 'ロー', "Je bois de l'eau.", '水を飲みます。', { level: 'A1' }),
  W('w18', '食べ物', 'le', 'm', 'lait', '牛乳', '🥛', 'レ', 'Le lait est froid.', '牛乳は冷たい。', { level: 'A1' }),
  W('w19', '食べ物', 'le', 'm', 'gâteau', 'ケーキ', '🍰', 'ガトー', 'Le gâteau est délicieux.', 'ケーキはとてもおいしい。', { level: 'A1' }),
  W('w20', '食べ物', 'la', 'f', 'banane', 'バナナ', '🍌', 'バナーヌ', 'La banane est jaune.', 'バナナは黄色い。', { level: 'A1' }),
  W('w21', '食べ物', 'le', 'm', 'café', 'コーヒー', '☕', 'カフェ', 'Je prends un café.', 'コーヒーをいただきます。', { level: 'A1' }),
  W('w22', '身の回りの物', 'le', 'm', 'livre', '本', '📖', 'リーヴル', 'Le livre est sur la table.', '本はテーブルの上にある。', { level: 'A1' }),
  W('w23', '身の回りの物', 'la', 'f', 'table', 'テーブル', '🪑', 'ターブル', 'La table est grande.', 'テーブルは大きい。', { level: 'A1' }),
  W('w24', '身の回りの物', 'la', 'f', 'maison', '家', '🏠', 'メゾン', 'La maison est belle.', '家は美しい。', { level: 'A1' }),
  W('w25', '身の回りの物', 'la', 'f', 'voiture', '車', '🚗', 'ヴォワチュール', 'La voiture est rouge.', '車は赤い。', { level: 'A1' }),
  W('w26', '身の回りの物', 'le', 'm', 'stylo', 'ペン', '🖊️', 'スティロ', "J'ai un stylo.", 'ペンを持っています。', { level: 'A1' }),
  W('w27', '身の回りの物', 'la', 'f', 'clé', '鍵', '🔑', 'クレ', 'Où est la clé ?', '鍵はどこ?', { level: 'A1' }),
  W('w28', '身の回りの物', 'le', 'm', 'téléphone', '電話', '📱', 'テレフォヌ', 'Mon téléphone est ici.', '私の電話はここにあります。', { level: 'A1' }),
  W('w29', '自然', 'la', 'f', 'fleur', '花', '🌸', 'フルール', 'La fleur sent bon.', '花はいい香りがする。', { level: 'A1' }),
  W('w30', '自然', 'le', 'm', 'soleil', '太陽', '☀️', 'ソレイユ', 'Le soleil brille.', '太陽が輝いている。', { level: 'A1' })
];
