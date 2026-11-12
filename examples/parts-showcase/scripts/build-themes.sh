#!/bin/sh
# Build パーツ図鑑 in the 7 bundled themes. deck.html is the same for all of them;
# only --theme changes. Run from this folder: sh scripts/build-themes.sh
set -e
mkdir -p out-themes
for t in default sumi kokugo tokiwa murasaki kogecha asagi; do
  npx egatari@0.6.x build deck.html --portable --theme "$t" -o "out-themes/parts-zukan-$t.ega.html"
done
