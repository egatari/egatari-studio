<!-- generated; do not edit by hand -->
# local のパーツ

ローカル（CLI）向けのパーツ。Claude Code・Codex などの CLI で、ローカルのツールの出力（例：トレーサーが書くコードの実行の記録）から作る。対話型AIへの指示には含まれない。そのツールを動かせないときは使わない。

### `<m-trace>`

値はローカルで動かすトレーサー `trace.py`（`uv run trace.py prog.py --out trace.json`）の出力をそのまま子の JSON に書く。手で書かない。パーツはコードを実行しない。


サンプルは `demo.html`（for 文の合計、辞書で数える、バブルソートを by="time" で）。トレースは `trace-demo/` のプログラムを `trace.py` で追った出力。

`trace.py`・`trace-demo` はパーツ集のリポジトリ（egatari/components）の tools フォルダにある。そこから取ってきて使う。

[README](https://github.com/egatari/components/blob/v2.15.0/components/trace/README.md)
