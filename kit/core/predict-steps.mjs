// 予想のパーツ（m-predict）の段階を原稿（deck.html）から読む。品質チェックのコマンド版（kit/check.mjs）と編集アプリ（kit/core/check-source.mjs）が
// 同じ関数で predictAnswerWithCount・predictAnswerNeverShown（どちらも警告、R-steps）を出す。Node にもブラウザにも依存しない
// m-predict（vendor/components の predict 1.7.0〜2.0.3。どの版も同じ）：段階 0 = 問いと選択肢、段階 1 = 数の棒と −1・＋1 の操作（k >= 1 で出る）、
//   answer-step（既定 2）= 答え（✓ 正解・枠・note）。読み方は get aStep(){ return Math.max(1, Math.round(this.props["answer-step"]) || 2); }、
//   属性は base の props で +a（数でない字・空は NaN か 0 → 既定の 2）。答えの段階が数の棒の段階（1）なら、数える前に答えが見える
//   steps：get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : this.aStep; }。プレーヤーはパーツの段階を
//   steps までで止める（kit/deck.js の compPos：k = min(c.steps, …)）ので、steps が答えの段階より小さいと答えが出ない。
//   steps が数でない（NaN・Infinity）ときはプレーヤーがパーツのエラー（compData）にするので、ここでは見ない
//   predictAnswerStep(raw)   属性の値（ないなら null）→ パーツが答えを開く段階
//   predictStepProblems(src) → [{code, slide（0 からのスライドの番号か null）, line, value（answer-step の字か null）, step（答えの段階）, steps（steps の字か null）, count}]
//     code 'predictAnswerNeverShown'：steps < 答えの段階（答えが出ない。これがあれば predictAnswerWithCount は出さない：答えが出ないので「同時に出る」は当たらない）
//     code 'predictAnswerWithCount' ：答えの段階 ≤ 数の棒の段階（1）
import { parse } from 'parse5';

// m-predict が数の棒と数える操作を出す段階
export const PREDICT_COUNT_STEP = 1;

export function predictAnswerStep(raw) {
  if (raw === null || raw === undefined) return 2;
  return Math.max(1, Math.round(+raw) || 2);
}

const hasClass = (n, c) => (n.attrs || []).some((a) => a.name === 'class' && a.value.split(/\s+/).includes(c));

export function predictStepProblems(src) {
  const text = String(src);
  const doc = parse(text, { sourceCodeLocationInfo: true });
  const lineOf = (off) => text.slice(0, off).split('\n').length;
  const out = [];
  let slides = 0;
  const get = (n, name) => { const a = (n.attrs || []).find((x) => x.name === name); return a ? a.value : null; };
  // スライドの番号は kit/core/build-core.mjs の analyzeSlideIds と同じ数え方（section.slide を出てくる順に。<template> の中も）
  const walk = (n, slide) => {
    if (n.tagName === 'section' && hasClass(n, 'slide')) slide = slides++;
    if (n.tagName === 'm-predict') {
      const value = get(n, 'answer-step'), steps = get(n, 'steps'), step = predictAnswerStep(value), ns = steps === null ? step : +steps;
      const base = { slide, line: n.sourceCodeLocation ? lineOf(n.sourceCodeLocation.startOffset) : null, value, step, steps, count: PREDICT_COUNT_STEP };
      if (Number.isFinite(ns) && ns < step) out.push({ code: 'predictAnswerNeverShown', ...base });
      else if (step <= PREDICT_COUNT_STEP) out.push({ code: 'predictAnswerWithCount', ...base });
    }
    for (const c of n.childNodes || []) walk(c, slide);
    if (n.content) walk(n.content, slide);
  };
  walk(doc, null);
  return out;
}
