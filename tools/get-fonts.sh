#!/bin/sh
# BIZ UDPゴシック（OFL）の TTF を fonts/ に取ってくる。build が使う字だけに絞って埋め込む（ないときは @fontsource の分割ファイルを使う）
set -e
cd "$(dirname "$0")/../fonts"
for w in Regular Bold; do
  [ -f BIZUDPGothic-$w.ttf ] || curl -sSfL -o BIZUDPGothic-$w.ttf https://github.com/google/fonts/raw/main/ofl/bizudpgothic/BIZUDPGothic-$w.ttf
done
echo "ok: $(ls *.ttf)"
