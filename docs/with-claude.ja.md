<!-- i18n: pair=with-claude.md sha256=6ee9534d0531a41e -->
# Claude Code や Cowork で Egatari の教材を作る

[English](with-claude.md) | 日本語

作りたい授業を、ふつうの言葉で Claude に頼みます。Claude が台本とスライド（ステップとパーツ付き）を書き、品質チェックまで行って、Egatari Studio で開けるフォルダを渡します。

## できること

同じマーケットプレイスに 2 つのプラグインがあります。

- 軽量な `egatari` は `egatari:make` だけを含み、Node は要りません。構成案を見せ、承認後に `deck.html`（スライド）と `narration.md`（台本）を書きます。
- `egatari-studio` は `egatari-studio:studio` だけを含みます。ローカルの品質チェック・組み立て・パーツ作成・既存の音声を使った動画の書き出しに使います。コマンドは npm の包み egatari（`npx egatari@0.6.x …`）で動かすので、Node.js が要ります。

## スキルを入れる

### Claude Code

先に古い `~/.claude/skills/motion-*` を削除します。プロジェクトの `.claude/skills/` に入れていたものも削除します。studio を使う場合は egatari も一緒に入れます：

```text
/plugin marketplace add egatari/egatari-studio
/plugin install egatari@egatari
/plugin install egatari-studio@egatari
```

入れたら、自動更新を有効にします：`/plugin` → Marketplaces → egatari → Enable auto-update。Claude Code が初めから自動で更新するのは Anthropic の公式のマーケットプレイスだけで、egatari のようなほかのマーケットプレイスは初めは自動更新が切れています。スキルの指示と品質チェックは Studio のバージョンごとに変わるので、古いスキルのままだと、新しい決まりや直しが使われません。スキルが古いとわかれば、スキル自身が 1 回だけ知らせます（作業は止めません）。

教材を書くだけなら最初の 2 行で十分です。studio を使うときに `npm ci` は要りません。studio スキルが初めに `npx egatari@0.6.x doctor` で Node.js・ブラウザ・uv・ffmpeg を確かめ、足りないものの入れ方を案内します。更新は `/plugin update egatari@egatari` と `/plugin update egatari-studio@egatari`、または `npx egatari@0.6.x skills update`（Codex も更新します）を実行してツールを再起動します。Codex は README の「Codex で使う」を見てください。

### チャットの Claude・Cowork

Studio の **新規作成…** の **指示をコピー** の横、または **使い方（?）** の **AI のスキルをダウンロード** を押します。ダウンロードした `egatari-make-<version>-ja.zip` または `egatari-make-<version>-en.zip` をアップロードして make だけを入れます。Studio の画面の言語と動いているバージョンに合う ZIP を、Studio 自身のサイトから渡します。単体のオフライン版のエディタにも両言語を入れています。開発者は `node tools/make-llm-guide.mjs --zip out/release --lang ja`（または `--lang en`）でも ZIP を作れます。中の `make/SKILL.md` と references は、`plugins/egatari/skills/make/` と同じ生成元から作ります。

コマンドは要りません。2 つの囲みを Studio に貼り付けます。Studio の指示書とスキルのバージョンが違えば、Studio の **AI のスキルをダウンロード** で入れ直します。チャットのスキルは自動では更新されないので、Studio が新しくなったら入れ直してください。スキルの指示と品質チェックは Studio のバージョンごとに変わります。

書き終えたら、egatari-studio が入っていれば studio スキルで品質チェックと組み立てをします。それ以外は Chrome か Edge の <https://studio.egatari.org/> で作業フォルダを開きます。Mac の Safari は Egatari ファイル（.ega.html）で開く手順を使います。

## 最初に送る依頼

> 動きのある HTML スライドで、〇〇の授業を作って。対象は〇〇の学生、15 分、話す人は 1 人。

Claude の質問に答え、構成案を承認して、studio で品質チェックをします。

## Studio で開く

1. Chrome か Edge で <https://studio.egatari.org/> を開きます。
2. 「ファイル ▾」→「フォルダで作業する…」で、Claude が作ったフォルダを選びます。Egatari ファイル（編集可）なら「ファイル ▾」→「開く…」。Egatari ファイル（再生専用）は編集できません。
3. Claude がフォルダを直しているあいだも Studio を開いたままにすると、プレビューが自動で更新されます。くわしくは[編集アプリ](editor.ja.md)。

## うまくいかないとき

[GitHub の issue](https://github.com/egatari/egatari-studio/issues) に書いてください。Claude Code では「感想を送って」と言うと、スキルが issue の下書きを作り、確認してから送ります。
