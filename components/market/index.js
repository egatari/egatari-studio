// m-market：市場規模の入れ子の円（TAM / SAM / SOM）。外の円から 1 つずつ、前の円の大きさから縮んで現れる
// <m-market unit="億円" style="height:420px"><script type="application/json">
//   {"rings": [{"key": "TAM", "value": 3000, "basis": "国内の…"}, {"key": "SAM", "value": 600, "basis": "…"}, {"key": "SOM", "value": 30, "basis": "…"}]}
// （JSON の終わり）</m-market>
// 段階 j（1〜円の数）で j 番目の円。数字は円が縮みきってから出る（count="true" で縮みに合わせて数え上げる）
// 円の大きさ：scale="fixed"（既定。見やすい決まった比）か "area"（面積を値に比例。小さすぎる円は最小の大きさにする）
// 配置：layout="bottom"（既定。下端をそろえる）か "center"（同心）。円の名前・値・根拠（basis）は右に引き出し線で書く
DECK.define("m-market", class extends DECK.MotionElement {
  static props = {
    unit:   {type: "string", default: "", doc: "値の単位（数字の後ろに付ける）"},
    digits: {type: "number", default: 0, doc: "値の小数桁"},
    scale:  {type: "string", default: "fixed", doc: "fixed（決まった比）か area（面積を値に比例）"},
    layout: {type: "string", default: "bottom", doc: "bottom（下端をそろえる）か center（同心）"},
    dur:    {type: "number", default: 0.9, doc: "1 つの円が現れる秒数"},
    count:  {type: "bool", default: false, doc: "値の数字を縮みに合わせて数え上げる"},
  };
  get steps(){ return this.getAttribute("steps") !== null ? +this.getAttribute("steps") : ((this.data || {}).rings || []).length; }
  mount(){
    var P = this.props, D = DECK, self = this, R = (this.data || {}).rings || [];
    this.style.display = "block"; this.style.position = "relative";
    var W = this.clientWidth, H = this.clientHeight;
    var svg = D.el("svg", {viewBox: "0 0 " + W + " " + H, width: W, height: H, style: "display:block;overflow:visible"}, this);
    // 円は左の 4 割ほど、名前と数字は右
    var big = Math.min(H / 2 - 6, W * 0.22), cx = 6 + big, bottom = H / 2 + big;
    var fixed = [1, 0.64, 0.34, 0.16];
    var radii = R.map(function(r, i){
      if (P.scale === "area") return Math.max(big * 0.14, big * Math.sqrt(r.value / R[0].value));
      return big * (fixed[i] !== undefined ? fixed[i] : fixed[fixed.length - 1] * Math.pow(0.5, i - fixed.length + 1));
    });
    var cy = function(i){ return P.layout === "center" ? H / 2 : bottom - radii[i]; };
    var tones = ["var(--term)", "var(--term)", "var(--emph)", "var(--emph)"];
    var fills = [0.10, 0.18, 0.22, 0.3];
    var gC = D.el("g", {}, svg), gL = D.el("g", {}, svg);
    var lx = cx + big + 64, n = R.length;
    this.rings = R.map(function(r, i){
      var col = r.tone ? "var(--" + (/^(term|emph|muted|accent2|series-[1-4])$/.test(r.tone) ? r.tone : "term") + ")" : tones[Math.min(i, 3)];
      var c = D.el("circle", {cx: cx, cy: cy(i), r: radii[i], fill: col, "fill-opacity": fills[Math.min(i, 3)], stroke: col, "stroke-width": i === n - 1 ? 3 : 2.2, opacity: 0}, gC);
      // 引き出し線の起点：この円の見えている帯の中（次の円の上端との間）。最後の円は中心
      var top = cy(i) - radii[i], nextTop = i + 1 < n ? cy(i + 1) - radii[i + 1] : null;
      var py = nextTop !== null ? (top + nextTop) / 2 : cy(i);
      // 名前と数字の行は高さを等分して並べる（上から順に）
      var ly = (H / (n + 0.2)) * (i + 0.5) + 14;
      var g = D.el("g", {opacity: 0}, gL);
      D.el("circle", {cx: cx, cy: py, r: 5, fill: col}, g);
      D.el("polyline", {points: cx + "," + py + " " + (lx - 40) + "," + py + " " + (lx - 12) + "," + (ly - 10), fill: "none", stroke: col, "stroke-width": 1.6}, g);
      var key = D.mtext(g, lx, ly, r.key || "", {"font-size": 28, "font-weight": 700, fill: col});
      // 数字は名前の後ろ（名前の幅は和文 1 字 = 1 字幅、ほかは 0.6 字幅の見積もり）、根拠は次の行
      var kw = [...String(r.key || "")].reduce(function(a, ch){ return a + (/[\u0000-\u024f]/.test(ch) ? 0.7 : 1); }, 0) * 28;
      var val = D.el("text", {x: lx + kw + 20, y: ly, "font-size": 36, "font-weight": 700, fill: "var(--fg)", style: "font-variant-numeric:tabular-nums"}, g);
      var basis = r.basis ? D.mtext(g, lx, ly + 34, r.basis, {"font-size": 24, fill: "var(--muted)"}) : null;
      return {r: r, c: c, g: g, val: val, basis: basis, rad: radii[i], prev: i ? radii[i - 1] : radii[i] * 1.15, cy: cy(i), pcy: i ? cy(i - 1) : cy(i), i: i};
    });
  }
  fmt(v){
    var s = Math.abs(v).toFixed(this.props.digits).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 ? "−" : "") + i + (s[1] ? "." + s[1] : "") + this.props.unit;
  }
  duration(k){ return k >= 1 ? this.props.dur + (this.props.count ? 0 : 0.35) : 0; }
  render(k, t){
    var P = this.props, D = DECK, self = this, n = this.rings.length;
    this.rings.forEach(function(o){
      var j = o.i + 1;
      var e = j < k ? 1 : j > k ? 0 : D.prog(t, 0, P.dur);
      // 前の円の大きさ・位置から縮んで今の大きさへ
      o.c.setAttribute("r", D.lerp(o.prev, o.rad, e).toFixed(2));
      o.c.setAttribute("cy", D.lerp(o.pcy, o.cy, e).toFixed(2));
      o.c.setAttribute("opacity", (j <= k ? Math.min(1, e * 2) : 0).toFixed(3));
      // 名前と数字：縮みきってから（count なら縮みに合わせて）
      var lo = P.count ? (j <= k ? Math.min(1, e * 3) : 0) : j < k ? 1 : j > k ? 0 : D.prog(t, P.dur, 0.35);
      o.val.textContent = self.fmt(P.count ? o.r.value * (j < k ? 1 : e) : o.r.value);
      o.g.setAttribute("opacity", lo.toFixed(3));
    });
  }
});
