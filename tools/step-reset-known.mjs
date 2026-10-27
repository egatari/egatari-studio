// tools/test-step-reset.mjs の既知の揺れ（KNOWN）：部品庫の直しを待つあいだだけ、決まった 1 か所の決まった形の違いを通す
// test-all: part of test-step-reset
// 期限つき：その部品の既定の版（components.lock.json。tools/vendor-components.mjs が読む）が until 以上になったら、その項目が残っているだけで失敗（消すように言う）。
// 使われない項目も失敗：その OS で、その部品・スライド・段階の比べが 1 度も行われなかったら（場所が変わった・消えた）。
// 揺れはいつも出るとは限らないので、「使われた」は「その場所を比べた」ことで、「通した」ことではない
import { vendorComponents } from './vendor-components.mjs';

// 項目の形：{platform, part, slide（1 から）, step, until（部品の版）, maxOff（縁から遠い画素の数の上限）, maxCh（各チャンネルの違いの上限 /255）, label}。
// 部品の DOM がバイトまで同じで、縁から遠い画素が maxOff 個まで（各チャンネル maxCh 以下）、ほかは NOISE_BOUNDS の内側のときだけ通す。
// macOS の m-cycle のスライド 1 の段階 5：前の項目（until 1.11.0）は v1.11.0 の修正を取り込んで消したが、v1.11.0〜v1.13.0 でも同じ揺れが残る
// （部品の DOM はバイトまで同じで、(324,294)・(324,379) の 2 px が縁から遠いところで 29〜54/255 違う。CI でときどき落ちる）。
// 直しは部品庫（egatari/components）に頼んだ。その版を取り込む 1.14.0 で期限が切れる
export const KNOWN = [
  { platform: 'darwin', part: 'cycle', slide: 1, step: 5, until: '1.14.0', maxOff: 2, maxCh: 64,
    label: 'KNOWN (macOS, cycle s1k5, until components 1.14.0)' },
];

const ver = (s) => String(s).replace(/^v/, '').split('.').map((x) => +x || 0);
export const versionAtLeast = (a, b) => { const x = ver(a), y = ver(b); for (let j = 0; j < 3; j++) if (x[j] !== y[j]) return x[j] > y[j]; return true; };
// 部品の既定の版（components.lock.json の components.<名前>.default）。部品がなければ null
export const lockedVersion = (part) => { const c = vendorComponents().find((x) => x.name === part); return c ? c.version : null; };

// 期限の切れた項目：[{e, msg}]。versionOf(part) は部品の既定の版（null なら部品がない：それも消すように言う）
export function expired(known, versionOf = lockedVersion) {
  return known.map((e) => ({ e, v: versionOf(e.part) })).filter(({ e, v }) => v === null || versionAtLeast(v, e.until))
    .map(({ e, v }) => ({ e, msg: v === null ? `${e.label}: part ${e.part} is not vendored any more; remove this KNOWN entry from tools/step-reset-known.mjs`
      : `${e.label}: the vendored ${e.part} is ${v} (>= ${e.until}); remove this KNOWN entry from tools/step-reset-known.mjs` }));
}

// この比べに当てはまる項目（場所と OS）。slide は 1 から
export const entryFor = (known, platform, part, slide, step) => known.find((e) => e.platform === platform && e.part === part && e.slide === slide && e.step === step) || null;

// 項目の形に収まる違いか（cmp は kit/render-compare.mjs の compareRenders の結果、DA・DB は domSnapshot の結果）
export function knownAccepts(e, cmp, DA, DB) {
  if (!e || cmp.same) return false;
  if (!DA || !DB || DA.dom == null || DA.dom !== DB.dom) return false;
  const P = cmp.offPts || [];
  return cmp.kind === 'pixels' && cmp.n <= cmp.cap && cmp.out === 0 && cmp.off >= 1 && cmp.off <= e.maxOff && P.length === cmp.off && P.every((q) => q[2] <= e.maxCh);
}

// 使われなかった項目（この OS の項目で、試験した部品なのに、その場所を 1 度も比べなかったもの）：[{e, msg}]
export function unused(known, platform, testedParts, seen) {
  return known.filter((e) => e.platform === platform && testedParts.includes(e.part) && !seen.has(e))
    .map((e) => ({ e, msg: `${e.label}: matched nothing (part ${e.part}, slide ${e.slide}, step ${e.step} was never compared on ${platform}); fix or remove this KNOWN entry in tools/step-reset-known.mjs` }));
}
