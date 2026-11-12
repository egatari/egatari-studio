# パーツ図鑑（parts-showcase）

**What it is:** one lesson that plays every part of parts library 2 (38 parts: the contents menu is m-menu, plus 37 part slides), each on its own realistic, fictional topic. It is the gallery's showcase of parts (the 「パーツ図鑑」), not the per-part reference. That reference is Studio's 「パーツの一覧」 at studio.egatari.org/parts/, and the last slide links to it.

**Themes:** the same `deck.html` is built in the 7 bundled themes. Only the `--theme` flag changes, so the content is identical across themes and the quality check gives the same result for each.

```sh
python3 scripts/<part>.py      # regenerate data/<part>.json (the slides copy these values)
sh scripts/build-themes.sh     # writes out-themes/parts-zukan-<theme>.ega.html
```

Themes: default (藍), sumi (墨), kokugo (国語), tokiwa (常盤), murasaki (江戸紫), kogecha (焦茶), asagi (浅葱).

**Thumbnails for New lesson ③ (「見本で見る」):**

| use | slide id | slide |
|---|---|---|
| cover | `s-mbteyz` | パーツ図鑑 (cover) |
| preview body slide | `s-wm5imv` | 場所・地図：会員の多い地域 (m-map-japan; theme colours show best in the choropleth) |

**How it was made:** `fragments/NN-<part>.html|md` hold one slide each, and `scripts/assemble.py` joined them once, before ids were given. After assembly, `deck.html` was edited by hand: the menu layout, and the preview map slide (no concl line, so the map can be taller). Edit `deck.html` directly from now on, and don't re-run the assembly.

**Rights:** CC BY 4.0, © 2026 雲居玄道, except the classical texts (孟浩然「春暁」, 清少納言『枕草子』, public domain) and the procedures taken from public sources: 厚生労働省「正しい手洗いの方法」, 首相官邸「防災の手引き」, 平成 26 年版 防災白書 (all 加工して作成). Kana stroke shapes: strokesvg (Klee One, SIL OFL 1.1). All other topics and numbers are fictional.

**Licence files:** `LICENSES/strokesvg-OFL.txt` (SIL OFL 1.1 with the Klee One / strokesvg copyright lines) and `LICENSES/strokesvg-LICENSE.txt` cover the kana stroke shapes that m-kakijun carries inside the built file.

**Names:** organisations and places in fictional topics are not real municipalities or companies. The org chart uses 「A 市」; みどり市 was dropped because it is a real city (群馬県).
