<!-- i18n: pair=play.md sha256=f7f236e8bad495e4 -->
# Egatari Play（再生ページ）

[English](play.md) | 日本語

Egatari Play は、[Egatari](https://github.com/egatari/egatari-spec) の 1 ファイル（.ega.html）を、見る人の端末の中で開いて再生する Web ページです。置き場所は `https://play.egatari.org/` の予定で、**まだ公開していません**（[公開の手順](#公開の手順管理者向け)）。

1 ファイルを Web ページとして開けない場面があるために作りました。

- iPhone・iPad は、ファイルのアプリから手元の HTML のファイルを開けない
- Android のファイルのアプリには、ブラウザにうまく働かない `content://` のアドレスを渡すものがある
- チャット（Slack など）は大きなファイルのプレビューに失敗する

見る人はページの中でファイルを選びます（Android では、入れたアプリに共有もできます）。ファイルはページの中で読み、どこにも送りません。

## 使い方

- **ファイルを開く**：「ファイルを開く」を押すか、ページにファイルをドロップします。再生するのは Egatari のファイルだけで、`deck-meta` が Egatari のものでないページは断ります。上の帯に教材の題と、「Egatari ファイル（編集可）」（原稿の層のある持ち運べる 1 ファイル）か「Egatari ファイル（再生のみ）」かを出します。どちらも同じように再生します。直すのは Egatari Studio です。
- **最近のファイル**：開いたファイルは「この端末にだけ保存されます」の知らせのもとで、ブラウザの中の OPFS（origin ごとの非公開のファイル領域）に残ります。ページから OPFS に書けないブラウザ（古い Safari）では IndexedDB に残します。10 個まで。1 つずつでも、すべてでも消せます。「開いたファイルを最近の一覧に残す」を外すと残しません。**「共有の端末」**は、学校の iPad のように何人かで使う端末のためのもので、オンにすると最近のファイルを残さず、いま残っているものも消します（選んだことはこの端末に覚えます）。既定はオフです（`play/main.js` の `SHARED_DEVICE_DEFAULT`。定数 1 つで替えられます）。どこにも送りません。
- **入れる**：ページは Web アプリ（manifest と service worker）です。Android とパソコンの Chrome ではブラウザのメニューから入れ、iPhone・iPad では 共有 → ホーム画面に追加。入れた後はオフラインでも開けます。
- **共有で開く（Android）**：入れたアプリは共有の受け先になります。ファイルのアプリやチャットから .ega.html を共有し、Egatari Play を選びます。
- **言葉**：日本語が先で、「English」のボタンで英語に替えます（この端末に覚えます）。

## 教材を切り離すしくみ

教材は、スクリプトを含む信頼しない HTML です（仕様 §11）。ページはホストとして再生します（仕様 §10.1）。

- 教材は `<iframe sandbox="allow-scripts">` の中で、文書は `srcdoc` です。`allow-same-origin`・`allow-popups`・`allow-forms`・`allow-modals`・`allow-downloads`・`allow-top-navigation` はありません。origin を持たないので、このページの OPFS・IndexedDB・localStorage・cookie を読めず、DOM にも届きません。窓を開くことも、ページを移すこともできません。
- 文書は、ページの**信頼する先頭部分**のあとに、ファイルのバイトをそのまま続けたものです（`app/preview-doc.js`。Studio のプレビューと同じ）。先頭部分がプレビューの決まり（`connect-src 'none'`・`frame-src 'none'`・読めるのは `data:` と `blob:` だけ）を持つので、教材のバイトを 1 つでも解析する前に決まりが効いています。教材の中を探して何かを入れることはしません。先頭部分には、ページの小さな仲立ち（`play/lesson-shim.js`）も入ります。`?embed=1`（仕様 §9.4）にし、授業の外へ出るリンクをページに渡します。
- `srcdoc` の文書は、ページ自身の決まりも受け継ぎ、両方が効きます。そのため、ページの決まりはインラインのスクリプトとスタイルを許します（教材が使うため）。ページ自身はインラインを使わず、スクリプトはすべてファイルで、ファイルやサービスから来た字（題・ファイル名・ライブの字・リンクのアドレス）はどれも字として入れ、マークアップにはしません。ほかはできるだけ狭くし、`tools/test-play.mjs` がそのまま確かめます：`default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src data: blob:; connect-src 'self' https://live.egatari.org wss://live.egatari.org; worker-src 'self'; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`（`connect-src 'self'` は service worker が入るときのため。Android の共有はシステムからの POST で、ページのフォームではないので `form-action 'none'`）。**次の案：**教材の枠を専用のパス（例 `/frame`）から見出しの CSP つきで配り、`srcdoc` でなく知らせで中身を渡せば、ページの決まりが教材に受け継がれなくなり、`'unsafe-inline'` を外せます。ページの `connect-src` にはライブの部屋の endpoint がありますが、教材の先頭部分がそれを `'none'` に絞るので、部屋につなげるのはページだけです。
- **再生のみのファイル自身の CSP の `<meta>`**（ライブの部屋を付けたファイルに入るもの。live §2.4）は、先頭部分の後の教材の `<head>` の中に入り、これも効きます。ブラウザはすべての決まりを満たすことを求めるので、教材には 3 つのうちいちばん狭いものが効きます。その `connect-src`（ライブの endpoint）は枠の中では意味を持ちません。**`deck-extensions` のブロック**はデータで、ページが何も実行しない解析（`play/scan.mjs`。上限つきの parse5）で自分で読みます。教材の中のライブの部分（`kit/live.js`）は、枠の中にいるのでつなぎません（live §2.1）。ライブはページの側に出すので、教材の中のライブの印と板は、先頭部分の規則で隠します（「ここからは参加できません」としか言えないため）。
- 枠からの知らせは信頼しない頼みです。その枠（`event.source`）から、origin が `"null"` のものだけを、次の形だけ受けます：位置の知らせ（仕様 §9.4 の `position`、または再生器の前からの `deck-pos`）と、リンクの頼み `{egatari: "openLink", href, text, download?}`（仕様 §9.4。この項目だけ、`text` は 200 字まで、`download` は `true` だけで、`download` 属性のあるリンクのときに付く）。ほかは無視します。仲立ちが `openLink` を送るのは、見る人自身の操作（枠に一時的な操作の印がある本物のクリック）のときだけで、教材のスクリプトが作ったクリックでは何も送りません。教材のコードが自分でこの知らせを送ることはできるので、ページは信頼せず、§11 を自分で当て、自分の箱で押されるまで何も開きません。（Studio の編集のプレビューにはこの知らせはなく、再生器が行き先を見せるだけで開く手段は出しません。§11 (g)）

## リンク

教材が開くように頼んだリンクは、再生器と同じ決まり `kit/core/link-policy.mjs`（仕様 §11）を通します。確かめる箱はページの側（枠の外）にあるので、教材がその上に描くことはできません。行き先の host とアドレスを見せ、`https:`・`http:`・`mailto:`・`tel:` のほかは開きません。字が別の host を名指す・ふつうの `https:` でない・ダウンロードする・アドレスにユーザー名やパスワードがある・host が punycode のときは、毎回確かめます。教材の隣のファイル（相対のリンク）はこのページからは届かないので、わけを書いて断ります。ファイルを保存するリンク（`download: true`）も断り、host と「この教材からはファイルを保存できません」を見せて、何も開きません。開くのは、見る人が押す `noopener noreferrer` のふつうのリンクです。一度同意したふつうの `https:` の host は、この閲覧のあいだメモリに覚え（§11 (f)）、次からは host の名前と「開く」だけの、注意書きのない箱を出します。1 回押すことは要ります。ページは知らせだけでリンクを開かず、Safari はページの中で押さないとタブを開かせないためです。箱は一度に 1 つで、閉じてから 1.5 秒は新しい頼みを無視するので、教材が箱を出し続けることはできません。

## ライブ

教材に鍵つきの正しい `extensions.live` がある（「ライブの部屋つき」で書き出した再生のみのファイル）とき、ページが教材の代わりに働きます（live §2A）。「ライブ」のボタンと板をページの側に出し、WebSocket もページが持ちます。

- **先に参加。** ライブのある教材は、はじめの画面から始まります：時間の窓と行き先の host のついた「参加する」と、「参加しないで見る」。教材の枠はそのどちらかを押してから置くので、「参加する」の押しが枠に取られることはありません。参加しないで見るときは何も要求せず、「参加する」はライブの操作の中に残ります。ページがつながない endpoint の教材では、はじめの画面に「参加する」の代わりに部屋の参加のページへのリンクを出します。
- 「参加する」を押すまで、また時間の窓の外では、何も要求しません。送るのは活動に要るものだけです：質問・投票・入れたときだけ名前・この端末で作った番号・ping。部屋からの字は字として見せます。つなぎ直しは `LivePolicy.plan`（`kit/core/live-policy.mjs`）のとおりです。
- 今の段階は、教材の位置の知らせで知り、その段階の投票を見せます。投票のある段階になると知らせます。
- **置き方**（`play/layout.mjs`）は、教材が始まるときに活動と画面から 1 回だけ決め、再生中は変えません（向きを変えたとき・パソコンの窓の大きさを変えたときだけ置き直す）：

  | 教材 | 電話（縦） | 電話（横） | 広い画面 |
  |---|---|---|---|
  | ライブなし | 教材がページいっぱい | 同じ | 同じ |
  | ライブ（投票なし） | 教材の下に 44 px の帯：状態・「抜ける」か「参加する」 | 横の余り（下） | 44 px の帯 |
  | ライブ（投票あり） | 16:9 の舞台の下の板（投票が先頭） | 横の余り（下） | 340 px の横の板 |

  電話を横にしたとき（高さ 500 px まで）は、ページの帯を隠して舞台を高さいっぱいにします。横の余りが 120 px 以上（19.5:9 の電話で約 150 px）あれば、そこに列を置きます：閉じる・状態・「抜ける」か「参加する」・「投票」（押すと列の中に投票を出す）。余りがない（16:9 の電話）ときは、`play/main.js` の定数 `NO_SLACK_VARIANT` で選びます。**'strip'**（既定）は舞台を 28 px 縮めて上に帯を置き、投票は帯の中身を 1 行の投票に替えます。**'overlay'** は画面いっぱいのまま、状態を枠の上端に重ね、投票は枠の上に重ねた板で開きます（測るときは `?noslack=overlay`）。
- **置き方を変えないわけ。** 教材の枠は別のプロセスで動き、Chrome はそこへの押しを、最後に画面に出した時点の当たり判定で振り分けます。教材のあった場所にいま現れた操作（枠の上に出した板や、縮んだ枠の跡）は、負荷の下の素早い押しで 45 回中 12 回、最初の押しを教材に取られました。「参加する」を枠より先にし、操作を枠より先に置いて動かさないようにした後は、`tools/play-tap-measure.mjs`（3 つ同時に、各 15 回、操作が見えたらすぐ押す）で取られた押しは 0 回でした：参加 0/45、縦の投票 0/90、横（余りあり）0/135、余りなしは帯も重ねる形も 0/225、向きを変えた直後の最初の押し 0/45、「抜ける」0/45。重ねる形でも取られなかったのは、状態の表示が初めから枠の上にあるためと見ています。既定は、枠の上に何も重ならない帯のままにしています。スライドの大きさは、縦（375 × 667）で 375 × 211 px、横（844 × 390）で 693 × 390、667 × 375 の電話では帯で 617 × 347・重ねる形で 667 × 375、1280 × 800（横の板）で 940 × 529 です。
- 「ライブ」のボタン（縦と広い画面）はライブの操作へ焦点を移し、Esc で戻ります。新しい版の知らせは教材を閉じるまで待ちます。
- ページがつなぐのは、ページ自身の決まりが許す endpoint だけです（組み立ての `--live-endpoint`。既定は `https://live.egatari.org`）。ほかの endpoint の教材には、部屋の参加のページへのリンク（`/join#room=…&key=…`。鍵は `#` の後ろ）を出し、新しいタブで開きます。
- **教材の中へは何も渡しません。** v1 で教材から受けるのは、画面の段階の 1 つだけです。まだないもの：質問に付けてスライドに丸を描くこと（枠からページへ線を渡す口がまだない）。
- 先生自身の編集可のファイルの `extensions.live` には鍵がないので、ライブなしで再生します。

## service worker と版

service worker（`play/sw.js`）が覚えるのは、組み立てが一覧にしたページ自身のファイルだけで、版（パッケージの版とファイルのハッシュ）の名前のキャッシュに入れます。ほかのもの（教材・共有されたファイル）は覚えません。新しい版は古い版の横に入って待ち、ページに「新しい版があります」と出し、見る人が「更新する」を押したときだけ替わります。教材を開いているときは先に確かめます。

## 組み立て

```sh
node tools/build-play.mjs [--out _play] [--live-endpoint https://live.example.org …]
```

`_play/`（リポジトリに入れない）に書きます：`index.html`・`guard.js`・`play.css`・`play.js`（`play/main.js` から esbuild でまとめる。`kit/core/link-policy.mjs`・`kit/core/live-policy.mjs`・`kit/core/bounded-html.mjs`・`app/preview-doc.js` を取り込み、再生器を写して分けることはしない）・`reader.js`（ファイルを読む Worker）・`sw.js`・`manifest.webmanifest`（`assets/logo` の 192・512 px の画像と `share_target`）・`icons/`・`_headers`。`--live-endpoint`（くり返せる）は、ページがつないでよい部屋の一覧を置き換え、同じものをページの `connect-src` に書きます。

試験：`node tools/test-play.mjs <作業フォルダ>`（`npm test` の一部）。作業フォルダに組み、Cloudflare と同じように `_headers` を付ける小さなサーバーで配り、ライブの部屋には `tools/live-fake-server.mjs` を使います。

手元で試すには：`node tools/build-play.mjs && npx wrangler@4.124.0 dev -c play/wrangler.toml`（wrangler はこのリポジトリの依存にないので、`npx` がこの版（egatari/live が固定しているもの）を取ってきます）。

## 置き場所：Cloudflare Workers の静的なファイル

ページは見出しつきの静的なファイルです。Pages ではなく **Cloudflare Workers の静的なファイル（static assets）**に置きます（`play/wrangler.toml`・`play/wrangler.production.toml`・`play/worker.js`）。

- Cloudflare は新しい静的なサイトを Workers に寄せていて、ライブの部屋（egatari/live）もすでに Worker です。道具（wrangler）も、設定と公開のしかたも、開発用と本番用の設定の分け方も 1 つで済みます。
- 静的なファイルは `_headers` を読みます。決まりと「枠の中を断る」見出しは、そこからすべてのファイルに付き、コードを動かさずに配ります。
- 小さな Worker は、どのファイルにも当たらない要求だけに答えます。service worker が入る前に届いた Android の共有（`POST /share`）です。ファイルは受け取れない（何もアップロードしない）ので、`/?share=nosw` への 303 を返し、ページが「一度アプリを開いてから、もう一度共有してください」と知らせます。
- 独自ドメイン（`routes = [{ pattern = "play.egatari.org", custom_domain = true }]`）なら、`wrangler deploy` が DNS の記録と証明書を自分で作ります。

ページは枠の中では動きません。すべてのファイルに `Content-Security-Policy: frame-ancestors 'none'` と `X-Frame-Options: DENY` を付け、`guard.js` がほかの何よりも先に `window.top` を確かめます（重ねての守り）。

## 公開の手順（管理者向け）

まだ行っていません。本番は少なくとも 2026-10-23 15:00 まで凍結中で、公開には毎回、持ち主の承認が要ります。

1. 公開するコミットで `npm ci && npm test`（少なくとも `node tools/test-play.mjs`）。
2. `node tools/build-play.mjs`（本番：`--dev-loopback` なし。ライブの endpoint は既定の `https://live.egatari.org`）。
3. 必要なら `npx wrangler@4.124.0 login`。`egatari.org` のゾーンが同じ Cloudflare のアカウントにあること。
4. `CLOUDFLARE_ACCOUNT_ID=<アカウントの ID> npx wrangler@4.124.0 deploy -c play/wrangler.production.toml`。`custom_domain = true` なので、`play.egatari.org` の DNS の記録と証明書が作られます。アカウントの ID は公開のときに渡し、リポジトリには入れません。
5. 確かめる：`curl -sI https://play.egatari.org/` に、`frame-ancestors 'none'` を含む `Content-Security-Policy` と `X-Frame-Options: DENY` があること。ページを開き、教材を開き、電話に入れてみる。

## 自分で置く

同じファイルを自分の origin から配ってもかまいません。条件：

- **応答の見出しを送れる置き場所。** `_headers` の見出しをすべてのファイルに付けてください：`Content-Security-Policy`（`frame-ancestors 'none'` を含む）・`X-Frame-Options: DENY`・`X-Content-Type-Options: nosniff`・`Referrer-Policy: no-referrer` と、そこにあるほかのもの。Cloudflare（Workers・Pages）と Netlify は `_headers` をそのまま読みます。nginx・Caddy・Apache では、その行をサーバーの設定に写してください。GitHub Pages など見出しを送れない置き場所は使わないでください。枠の中を断れず、ページの決まりもブラウザの既定だけになります。
- **HTTPS**（service worker と OPFS は安全な文脈でしか動かない）。
- **専用の origin**。どの編集アプリとも別の origin にしてください（live §2A.4）。一緒に Egatari Studio を置くなら、その origin とは分け、ここで再生した教材が編集アプリの保存先に届かないようにします。
- **`POST /share`** には `/?share=nosw` への `303 See Other` を返す（`play/worker.js` と同じ）。そうしないと、共有はアプリを一度開いた後でしか働きません。
- **ライブの部屋**：ページがつないでよい部屋のサービスごとに `--live-endpoint <部屋のサービス>` を付けて組んでください。ほかの endpoint の教材には参加のリンクだけを出します。

## v1 にないもの

- iOS のラッパーのアプリ（後で）。
- 質問に付けてスライドに丸を描くことを、ページを通して行うこと。
- 教材からの印刷と添付の保存（枠に `allow-modals` も `allow-downloads` もない）。ページ自身の全画面のボタン。
- OS からファイルを直接開くこと（パソコンの `file_handlers`）。
