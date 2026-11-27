# ガン・スプラッシュ

**[English version below.](#english)**

ブラウザで遊ぶ、3対3の水鉄砲陣取りゲームです。限られた水を補給しながら、中央の陣地を取り合います。画面は「16ビット家庭用ゲーム機のソフトの復刻版」を意識したドット絵です。

**▶ [ブラウザですぐ遊ぶ](https://share.viveworker.com/v/7y6t9NpMbezXZlDU)**（インストール不要）

![タイトル・試合・リザルトの画面](docs/screenshots.png)

## 特徴

- 16ビット機風のドット絵と、ゲームのために作曲した音楽・効果音。
- 3対3のBOT戦。仲間も敵も、水の補給、陣地の取り合い、かくれて撃つ、を自分で考えて動きます。
- PCとスマホ・タブレットのブラウザで遊べます。1ファイル版は、インターネットにつながっていなくても動きます。
- ふりがな付きの取扱説明書が、ゲームの中で読めます。
- 画面の読み上げと「動きをへらす」設定に対応しています。

## 遊び方

いちばん手軽なのは、上の「ブラウザですぐ遊ぶ」です。手元で動かすときは、Node.js 22 以上で次を実行し、ブラウザで http://127.0.0.1:4173 を開きます。

```sh
git clone https://github.com/gomidoji/gun-splash.git
cd gun-splash
npm start
```

サーバーなしで遊ぶときは、1ファイル版を作ってダブルクリックで開きます（インターネットにつながっていなくても動きます）。

```sh
npm run build    # play.html ができます
```

最近の Chrome、Edge、Safari、Firefox 向けです。音ははじめOFFです（起動画面の「あそぶ（音あり）」で始めるか、［設定］でONにします）。

## ルール

- あなた＋仲間のBOT2体（BLUE）と、BOTの3体（ORANGE）の対戦。1試合は90秒です。
- 中央の陣地を合計30秒確保するか、相手を全滅させれば勝ち。時間切れのときは確保時間の長いほうが勝ちです。
- 水鉄砲は水を使います。水たまりに入るとタンクに補給でき、ポンプのそばで止まると水たまりに水を足せます。ステージの水には限りがあり、なくなると最後の15秒になります。
- 武器は3種類です。
  - **ノーマル**：中距離の連射
  - **スプラッシュ**：近距離に広がる散弾
  - **ロングバレル**：ためて撃つ、貫通する遠距離弾
- ステージは入門から上級までの4つです。順番に勝つと次が開き、上級で勝つと、なぞのスペシャルステージも遊べるようになります。くわしいルールは、ゲーム内の取扱説明書にあります。

## 操作

| | PC | スマホ・タブレット |
|---|---|---|
| 移動 | WASD／矢印キー | 画面の左側に触れて指を動かす |
| ねらう | マウス | 移動の向き（自動で照準補正） |
| うつ | 左クリック（ロングバレルは長押し） | 画面の右側を押す |
| 武器を切り替え | E／右クリック | ［ぶき］ボタン |
| ポーズ | Esc／P | ［ポーズ］ボタン |
| すぐやりなおし | R | ポーズメニュー |

## 開発

依存パッケージはありません。`src/` がゲーム本体で、ビルドせずにそのまま静的配信できます（`src/index.html` から始まります）。

```sh
npm test         # テスト（tests/）
npm run build    # src/ から 1ファイル版の play.html を作る
npm run fonts    # フォント（src/fonts/）とゲーム画面の文字データを作り直す（要インターネット）
```

### ファイルの地図

| 場所 | 中身 |
|---|---|
| `src/game.mjs` | ルール、ステージ、BOT の考え方（ブラウザに依存しないので、テストから直接動かせます） |
| `src/app.mjs` | 試合と画面のつなぎ、ステージの進みぐあいの保存 |
| `src/js/core.js` | 描画、入力、音、画面の切り替えの土台 |
| `src/js/title.js`, `play.js`, `result.js` | タイトル・ステージ選択、試合、リザルトの各画面 |
| `src/js/shell.js` | 起動画面、設定、説明書の呼び出しなど、ゲーム画面の外側 |
| `src/js/sprites*.js`, `bgm*.js` | ドット絵と音楽（どちらもテキストのデータ） |
| `src/manual.html`, `src/js/manual.js` | 取扱説明書 |
| `tests/` | テスト（`node --test`） |

### テスト用の URL スイッチ

`src/index.html` の後ろに付けて使います。スペシャルステージのネタばれを含むので、遊ぶ人向けの案内には書いていません。

| スイッチ | 働き |
|---|---|
| `?seed=N` | 試合の乱数を固定し、毎回同じ試合にする |
| `?unlock=1` | すべてのステージを開く（進みぐあいは保存しない） |
| `?auto=1` | 自分（YOU）も BOT にする |
| `?debug=1` | 開発用の警告とモック切り替えパネルを出す |
| `?mock=1` | 各画面を決まったデータで表示する（`#画面/状態` で直接開ける） |

### 文字の決まり

- ゲーム画面の文字は、かなと、決まった44字の漢字だけです（`src/js/core.js` の `KANJI`）。
- 取扱説明書の漢字には、すべてふりがなを付けます。新しい漢字や熟語を使うときは、`src/js/manual.js` の `RUBY` に読みを足します。
- フォントは、ゲームと説明書で使う文字だけを収めたサブセットです。ゲーム画面の文字は、そのフォントの輪郭から作った点のデータ（`src/js/j16-atlas.js`）で描くので、どの端末でも同じ見た目になります。新しい文字を使う文を足したら `npm run fonts` を実行します（必要なときはテスト時に通知されます）。

## 参加のしかた

Issue や Pull Request を歓迎します。

- Pull Request の前に `npm test` が通ることを確かめてください。
- 大きな変更（ルール、ステージ、BOT の強さなど）は、先に Issue で相談してもらえると助かります。
- 文を足すときは、上の「文字の決まり」に沿ってください。

## プライバシー

このゲームは、遊んでいるあいだ外部と通信しません。ステージの進みぐあいと設定は、お使いのブラウザの中（localStorage）にだけ保存されます。

## 動画・配信について

プレイ動画の投稿や、実況・配信は自由です。

## ライセンス

[MIT License](LICENSE)。

`src/fonts/` に同梱しているフォント（DotGothic16、BIZ UDPGothic、Dela Gothic One、M PLUS Rounded 1c）は、どれも [SIL Open Font License 1.1](https://openfontlicense.org/) です。それぞれのライセンス文は同じフォルダーの `*-OFL.txt` にあります。

---

## English

Gun Splash (ガン・スプラッシュ) is a 3-vs-3 water-pistol turf battle that runs in the browser. Refill your limited water and fight over the zone in the middle. It is drawn in pixel art and presented as a re-release of a game for a 16-bit home console.

**▶ [Play it in your browser](https://share.viveworker.com/v/7y6t9NpMbezXZlDU)** (nothing to install)

### Features

- 16-bit console style pixel art, with music and sound effects made for the game.
- 3-vs-3 against bots. Your allies and your opponents decide for themselves when to refill, when to fight over the zone and when to shoot from cover.
- Plays in browsers on PCs, phones and tablets. The single-file version also works offline.
- An in-game manual (in Japanese, with readings on every kanji).
- Supports screen readers and a "reduce motion" setting.

### How to play

The easiest way is the "Play it in your browser" link above. To run it yourself, use Node.js 22 or later and open http://127.0.0.1:4173 in your browser.

```sh
git clone https://github.com/gomidoji/gun-splash.git
cd gun-splash
npm start
```

To play without a server, build the single-file version and double-click it (it works offline, too).

```sh
npm run build    # creates play.html
```

It is made for recent versions of Chrome, Edge, Safari and Firefox. Sound starts off; choose "あそぶ（音あり）" (play with sound) on the start screen, or turn it on in [設定] (settings). The game's text is in Japanese.

### Rules

- You and two bot allies (BLUE) play against three bots (ORANGE). A round lasts 90 seconds.
- Hold the center zone for 30 seconds in total, or knock out the whole other team, to win. When time runs out, the team that held the zone longer wins.
- Your water gun uses water. Step into a puddle to refill your tank; stand still by a pump to add water to its puddle. Each stage has a limited amount of water; when it is gone, the last 15 seconds begin.
- There are three weapons:
  - **Normal**: rapid fire at mid range
  - **Splash**: a short-range spread
  - **Long barrel**: a charged, piercing long-range shot
- There are four stages, from beginner to advanced. A win opens the next one, and a win on the advanced stage opens a mystery special stage. The full rules are in the in-game manual (the [せつめいしょ] (manual) button, in Japanese).

### Controls

| | PC | Phone / tablet |
|---|---|---|
| Move | WASD / arrow keys | Touch the left side of the screen and move your finger |
| Aim | Mouse | Your movement direction (with aim assist) |
| Shoot | Left click (hold for the long barrel) | Press the right side of the screen |
| Switch weapon | E / right click | The [ぶき] (weapon) button |
| Pause | Esc / P | The [ポーズ] (pause) button |
| Restart at once | R | Pause menu |

### Development

There are no dependencies. `src/` is the game itself and can be served as static files without a build (the entry point is `src/index.html`).

```sh
npm test         # run the tests (tests/)
npm run build    # build the single-file play.html from src/
npm run fonts    # rebuild the fonts (src/fonts/) and the in-game text glyphs (needs the internet)
```

#### Where things are

| Path | What it holds |
|---|---|
| `src/game.mjs` | Rules, stages and the bots' decisions (no browser needed, so the tests run it directly) |
| `src/app.mjs` | Glue between the match and the screens; saves the stage progress |
| `src/js/core.js` | The base for drawing, input, sound and screen changes |
| `src/js/title.js`, `play.js`, `result.js` | The title / stage select, match and result screens |
| `src/js/shell.js` | Everything around the game screen: the start screen, settings, opening the manual |
| `src/js/sprites*.js`, `bgm*.js` | Pixel art and music (both as text data) |
| `src/manual.html`, `src/js/manual.js` | The in-game manual |
| `tests/` | The tests (`node --test`) |

#### URL switches for testing

Add them after `src/index.html`. They spoil the special stage, so the player-facing sections above leave them out.

| Switch | What it does |
|---|---|
| `?seed=N` | Fixes the match's random numbers, so every match plays the same |
| `?unlock=1` | Opens every stage (the progress is not saved) |
| `?auto=1` | Makes you (YOU) a bot too |
| `?debug=1` | Shows developer warnings and the mock switcher panel |
| `?mock=1` | Shows each screen with fixed data (open one directly with `#screen/state`) |

#### Text rules

- In-game text uses kana and a fixed set of 44 kanji only (`KANJI` in `src/js/core.js`).
- Every kanji in the manual gets a reading. When you use a new kanji or compound, add its reading to `RUBY` in `src/js/manual.js`.
- The fonts are subsets that hold only the characters the game and the manual use. The in-game text is drawn from dot glyphs made from that font's outlines (`src/js/j16-atlas.js`), so it looks the same on every device. After adding text with new characters, run `npm run fonts` (the tests tell you when).

### Contributing

Issues and pull requests are welcome.

- Make sure `npm test` passes before opening a pull request.
- For big changes (rules, stages, bot strength and the like), please open an issue first so we can talk it over.
- When you add text, follow the text rules above.

### Privacy

The game does not talk to any server while you play. Your stage progress and settings are stored only in your own browser (localStorage).

### Videos and streaming

Feel free to post gameplay videos and to stream the game.

### License

[MIT License](LICENSE).

The fonts bundled in `src/fonts/` (DotGothic16, BIZ UDPGothic, Dela Gothic One, M PLUS Rounded 1c) are all under the [SIL Open Font License 1.1](https://openfontlicense.org/). Their license texts are the `*-OFL.txt` files in the same folder.
