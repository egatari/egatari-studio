# 日本の人口の移り変わり：出典と権利

- **データの出典（総務省統計局「国勢調査」、e-Stat から取得）：**
  - `raw/pop_1920_2015.csv`：国勢調査 時系列データ「男女別人口－都道府県（大正９年～平成27年）」。statInfId 000031524010。https://www.e-stat.go.jp/stat-search/files?stat_infid=000031524010
  - `raw/census2020_t1-1.xlsx`：令和２年国勢調査 人口等基本集計 第１－１表。statInfId 000032142402。https://www.e-stat.go.jp/stat-search/files?stat_infid=000032142402
- **利用条件：** e-Stat の利用規約（https://www.e-stat.go.jp/terms-of-use）。政府標準利用規約（第 2.0 版）に基づき、CC BY 4.0 と両立する。スライドの表示は「総務省統計局『国勢調査』（e-Stat）を加工して作成」。`raw/` の 2 つのファイルは、この規約に従い、取得したまま再配布している。
- **数字の作り方：** すべて `scripts/make_data.py` の出力（`uv run --with openpyxl python scripts/make_data.py`）。`data/population.json`（全部の数字と元の表の注）と、パーツが読む `data/national.json`・`data/map.json`・`data/ratio.json` を書く。手で直した数字はない。
- **元の表の注：** 1945 年は沖縄県が調査されなかったため含まれない（スライド 2 に注を書き、台本でも言う）。1960 年の境界紛争地域の人口（73 人）は全国にだけ含まれる（グラフの単位では見えないので書かない）。
- **架空のもの：** 予想のスライドの人数（6・4・13・7）は架空。
