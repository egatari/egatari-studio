<!-- generated; do not edit by hand -->
# local のパーツ

ローカル（CLI）向けのパーツ。Claude Code・Codex などの CLI で、ローカルのツールの出力（例：トレーサーが書くコードの実行の記録）から作る。チャットの AI への指示には入らない。そのツールを動かせないときは使わない。

### `<m-trace>`

値はローカルで動かすトレーサー `tools/trace.py`（`uv run tools/trace.py prog.py --out trace.json`）の出力をそのまま子の JSON に書く。手で書かない。パーツはコードを実行しない。


サンプルは `demo.html`（for 文の合計、辞書で数える、バブルソートを by="time" で）。トレースは `tools/trace-demo/` のプログラムを `tools/trace.py` で追った出力。

[README](https://github.com/egatari/components/blob/v2.14.0/components/trace/README.md)
