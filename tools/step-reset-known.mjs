// tools/test-step-reset.mjs の既知の揺れ（KNOWN）：部品庫の直しを待つあいだだけ、決まった 1 か所の決まった形の違いを通す
// test-all: part of test-step-reset
// 期限つき：部品庫の既定の版（components.lock.json の tag）が until 以上になったら、その項目が残っているだけで失敗（消すように言う）。
// 使われない項目も失敗：その OS で、その部品・スライド・段階の比べが 1 度も行われなかったら（場所が変わった・消えた）。
// 揺れはいつも出るとは限らないので、「使われた」は「その場所を比べた」ことで、「通した」ことではない
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './vendor-components.mjs';

// macOS の CI で m-cycle のスライド 1 の段階 5 を入り直すと、部品の DOM はバイトまで同じなのに、縦の線の両端の 2 px が縁から遠いところで
// 54/255 違う（kit/render-compare.mjs の NOISE_BOUNDS の各チャンネル 24/255 を超える）。部品の直しは egatari-08 の m-cycle の修正
// （egatari/components v1.11.0）。部品の DOM がバイトまで同じで、縁から遠い画素が 2 個まで（各チャンネル 64/255 以下）、
// ほかは NOISE_BOUNDS の内側（数・部品の箱）のときだけ通す
export const KNOWN = [
  { platform: 'darwin', part: 'cycle', slide: 1, step: 5, until: '1.11.0', maxOff: 2, maxCh: 64,
    label: 'KNOWN (macOS, cycle s1k5, until components 1.11.0)' },
];

const ver = (s) => String(s).replace(/^v/, '').split('.').map((x) => +x || 0);
export const versionAtLeast = (a, b) => { const x = ver(a), y = ver(b); for (let j = 0; j < 3; j++) if (x[j] !== y[j]) return x[j] > y[j]; return true; };
export const lockedVersion = (root = ROOT) => JSON.parse(fs.readFileSync(path.join(root, 'components.lock.json'), 'utf8')).tag;

// 期限の切れた項目：[{e, msg}]
export function expired(known, version) {
  return known.filter((e) => versionAtLeast(version, e.until))
    .map((e) => ({ e, msg: `${e.label}: the vendored components are ${version} (>= ${e.until}); remove this KNOWN entry from tools/step-reset-known.mjs` }));
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
