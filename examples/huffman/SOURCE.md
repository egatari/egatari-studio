# 出典と数の作り方（ハフマン符号）

- 「すもももももももものうち」の回数・符号・ビット数（2〜5 枚目）：`scripts/make_codes.py` で計算した（`data/huffman.json`）。固定長 3 ビット × 12 字 = 36 ビット、ハフマン符号 20 ビット。
- MH 符号の表（7 枚目と `data/mh_table.json`）：ITU-T 勧告 T.4「Standardization of Group 3 facsimile terminals for document transmission」の表 2（終端符号）・表 3（メイクアップ符号）と EOL。<https://www.itu.int/rec/T-REC-T.4>
  - 2026-11-11 に、表の 182 語（白 91・黒 91。EOL を除く）を libtiff の `libtiff/t4.h`（TIFFFaxWhiteCodes・TIFFFaxBlackCodes）と照合し、すべて一致した：`python3 scripts/make_codes.py --libtiff path/to/t4.h`
- 7 枚目の復号（11011011111 → 白 64＋白 2＝白 66、黒 2、68 点）：同じスクリプトで復号して確かめた（`data/mh.json`）。
- A4 の 1 行 1728 点：T.4 の走査線の画素数（表 3 の最大のメイクアップ符号 1728 もこれに当たる）。
