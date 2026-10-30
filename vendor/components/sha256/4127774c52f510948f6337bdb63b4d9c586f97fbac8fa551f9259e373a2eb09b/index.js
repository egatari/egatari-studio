// hist-core 1.0.0: m-hist's statistics (a library part, Egatari spec §6.1): mean, median, mode, counting into classes
// (以上・未満), class values, and the frequency-table mean, mode and median class. Pure functions of their arguments: no DOM,
// no state. m-hist 2.0.0 requires it; tools/test-stats.mjs tests it. Moved verbatim from m-hist 1.13.0 (its `static stats`).
//   returns {sorted, sum, mean, median, modes, binOf, counts, mids, tableMean, binModes, tableMedian, cumulative, clean}
egatariParts.define({name: "hist-core", version: "1.0.0", requires: {}}, function(){
  "use strict";
  function sorted(a){ return a.slice().sort(function(x, y){ return x - y; }); }
  function sum(a){ var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a){ return sum(a) / a.length; }
  // 中央値：小さい順に並べた真ん中の値（偶数個なら真ん中の 2 つの平均）
  function median(a){ var s = sorted(a), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
  // 最頻値：いちばん多く出る値（同数なら全部、小さい順）。どの値も 1 回ずつ（2 個以上）なら最頻値はない（[]）
  function modes(a){
    var c = {}, keys = [], mx = 0;
    a.forEach(function(v){ var k = String(v); if (!(k in c)){ c[k] = 0; keys.push(v); } c[k]++; mx = Math.max(mx, c[k]); });
    if (mx === 1 && a.length > 1) return [];
    return sorted(keys.filter(function(v){ return c[String(v)] === mx; }));
  }
  // 階級の番号（start + i·width 以上、start + (i+1)·width 未満。浮動小数の誤差を少し許す）
  function binOf(v, start, width){ return Math.floor((v - start) / width + 1e-9); }
  function counts(values, start, width, nb){
    var c = []; for (var i = 0; i < nb; i++) c.push(0);
    values.forEach(function(v){ var b = binOf(v, start, width); if (b >= 0 && b < nb) c[b]++; });
    return c;
  }
  function mids(start, width, nb){ var m = []; for (var i = 0; i < nb; i++) m.push(clean(start + (i + 0.5) * width)); return m; }
  // 度数分布表からの平均値：Σ（階級値 × 度数）÷ 度数の合計
  function tableMean(mid, cnt){ var s = 0, n = 0; mid.forEach(function(m, i){ s += m * cnt[i]; n += cnt[i]; }); return s / n; }
  // 度数分布表の最頻値：度数がいちばん多い階級の階級値（同数なら全部）
  function binModes(mid, cnt){ var mx = Math.max.apply(null, cnt); return mx > 0 ? mid.filter(function(m, i){ return cnt[i] === mx; }) : []; }
  // 度数分布表の中央値：真ん中の順位の値が入る階級（{bin}）。偶数個で真ん中の 2 つが別の階級なら、その境の値（{at}）
  function tableMedian(start, width, cnt){
    var n = sum(cnt), r1 = n % 2 ? (n + 1) / 2 : n / 2, r2 = n % 2 ? r1 : n / 2 + 1, find = function(r){ var c = 0; for (var i = 0; i < cnt.length; i++){ c += cnt[i]; if (c >= r) return i; } return cnt.length - 1; };
    var a = find(r1), b = find(r2);
    return a === b ? {bin: a, from: clean(start + a * width), to: clean(start + (a + 1) * width), x: clean(start + (a + 0.5) * width)} : {at: clean(start + b * width), x: clean(start + b * width)};
  }
  function cumulative(c){ var s = 0; return c.map(function(v){ return (s += v); }); }
  function clean(v){ return +(+v).toFixed(10); }
  return {sorted: sorted, sum: sum, mean: mean, median: median, modes: modes, binOf: binOf, counts: counts, mids: mids,
          tableMean: tableMean, binModes: binModes, tableMedian: tableMedian, cumulative: cumulative, clean: clean};
});
