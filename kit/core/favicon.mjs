// 組んだデッキのタブのアイコン（backlog #59）。assets/logo/egatari-32-{light,dark}.svg（32 px 用の見た目を整えた版。MIT の対象外：NOTICE）の
// 形と色をそのまま 1 つの SVG にし、暗い画面の色は SVG の中の prefers-color-scheme で替える。data: URI の <link rel="icon"> として <head> に入れる
// （ファイルが 1 つで足り、CSP の img-src data: で通る）。形・色が assets/logo と同じことは tools/test-favicon.mjs が確かめる
// 同じ 1 つの SVG にした理由：<link media="(prefers-color-scheme: dark)"> を 2 つ並べる方式は、media を見ないブラウザ（Safari など）が
// 先の 1 つ（明るい版）だけを使い、暗いタブで読めないことがあるため。SVG の中の問い合わせなら、SVG のアイコンを使うブラウザは暗い画面の色まで見る
export const FAVICON = Object.freeze({
  bracket: 'M10 5H5V18.5 M22 27H27V13.5',
  e: 'M10 13.5Q15.125 13 19.875 11.875Q21.125 11.625 20.25 12.875L9.75 23.25L13.75 19Q16 16.625 16.875 19.875L17.375 22Q18.25 24.5 20.75 23Q22.625 21.875 22 20.25',
  sun: { cx: 14, cy: 8.25, r: 1.75 },
  light: { ink: '#4A488E', sun: '#D3381C' },
  dark: { ink: '#A9ABFA', sun: '#F2573B' },
});

export function faviconSvg() {
  const F = FAVICON;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + `<style>.i{stroke:${F.light.ink}}.s{fill:${F.light.sun}}@media (prefers-color-scheme:dark){.i{stroke:${F.dark.ink}}.s{fill:${F.dark.sun}}}</style>`
    + `<path class="i" d="${F.bracket}" fill="none" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/>`
    + `<circle class="s" cx="${F.sun.cx}" cy="${F.sun.cy}" r="${F.sun.r}"/>`
    + `<path class="i" d="${F.e}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// <link rel="icon"> 1 本（SVG は % 符号化。base64 にしない：HTML の中で読め、数百バイトで済む）
export function faviconLink() {
  const uri = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg()).replace(/'/g, '%27');
  return `<link rel="icon" type="image/svg+xml" href="${uri}" data-egatari-favicon>`;
}

// 入れるか：<html data-favicon="off"|false|no|0> なら入れない（data-feedback と同じ書き方）。原稿が自分の <link rel="icon">（shortcut icon も）を持てばそちらを使う
export function wantsFavicon(htmlAttr, hasOwnIcon) {
  if (/^(off|false|no|0)$/i.test((htmlAttr || '').trim())) return false;
  return !hasOwnIcon;
}
