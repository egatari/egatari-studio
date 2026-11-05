// boxplot-core 1.0.0: m-boxplot's quartiles (a library part, Egatari spec §6.1): the median, the quartiles by three methods
// (jp: the median of each half, leaving out the median when n is odd — 中2・数学Ⅰ; inc / exc: spreadsheet QUARTILE.INC /
// QUARTILE.EXC) and the 1.5 × IQR fences. Pure functions of their arguments: no DOM, no state. m-boxplot 2.0.0 requires it;
// tools/test-stats.mjs tests it. Moved verbatim from m-boxplot 1.13.0 (its `static stats`).
//   returns {sorted, at, median, quartiles, fences, clean}
egatariParts.define({name: "boxplot-core", version: "1.0.0", requires: {}}, function(){
  "use strict";
  function sorted(a){ return a.slice().sort(function(x, y){ return x - y; }); }
  function clean(v){ return +(+v).toFixed(10); }
  // 並べた値 s の、0 から数えた位置 h（小数なら前後の値の間を比で分ける）の値
  function at(s, h){ var lo = Math.floor(h + 1e-9), f = h - lo; return clean(f > 1e-9 ? s[lo] + f * (s[lo + 1] - s[lo]) : s[lo]); }
  function median(a){ var s = sorted(a); return at(s, (s.length - 1) / 2); }
  // 四分位数。iq1 imed iq3 は並べた値の中の位置（0 から。x.5 なら 2 つの値の間）、halves は jp の前半・後半の位置の範囲
  function quartiles(values, method){
    var s = sorted(values), n = s.length;
    if (!n) throw new Error("m-boxplot: a group has no values");
    var imed = (n - 1) / 2, iq1, iq3, halves = null;
    if (!method || method === "jp"){
      var m = Math.floor(n / 2);
      if (m === 0){ iq1 = iq3 = 0; }
      else { iq1 = (m - 1) / 2; iq3 = n - m + (m - 1) / 2; halves = [[0, m - 1], [n - m, n - 1]]; }
    } else if (method === "inc"){ iq1 = (n - 1) * 0.25; iq3 = (n - 1) * 0.75; }
    else if (method === "exc"){
      iq1 = (n + 1) * 0.25 - 1; iq3 = (n + 1) * 0.75 - 1;
      if (iq1 < -1e-9 || iq3 > n - 1 + 1e-9) throw new Error('m-boxplot: method="exc" needs 3 or more values (like QUARTILE.EXC)');
    } else throw new Error('m-boxplot: method="' + method + '" is not jp, inc or exc');
    return {n: n, sorted: s, min: s[0], q1: at(s, iq1), med: at(s, imed), q3: at(s, iq3), max: s[n - 1], iq1: iq1, imed: imed, iq3: iq3, halves: halves};
  }
  // 外れ値：第1四分位数 − 1.5 × 四分位範囲 より小さいか、第3四分位数 ＋ 1.5 × 四分位範囲 より大きい値。ひげはその内側の最小・最大まで
  function fences(q, values){
    var r = q.q3 - q.q1, lo = clean(q.q1 - 1.5 * r), hi = clean(q.q3 + 1.5 * r), s = sorted(values);
    var inside = s.filter(function(v){ return v >= lo && v <= hi; });
    return {lo: lo, hi: hi, wlo: inside.length ? inside[0] : q.q1, whi: inside.length ? inside[inside.length - 1] : q.q3,
            out: s.filter(function(v){ return v < lo || v > hi; })};
  }
  return {sorted: sorted, at: at, median: median, quartiles: quartiles, fences: fences, clean: clean};
});
