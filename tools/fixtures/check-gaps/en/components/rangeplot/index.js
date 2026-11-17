// m-rangeplot: test part for tools/test-check-gaps.mjs (handoff Issue #40). A working-folder part that does what a chart part should do
// when a value lies outside the range it shows: it calls ctx.report("range", …) once, naming the values and the range.
// yr="[lo,hi]" and values="[…]" are attributes; it draws the values as dots, clipped to the range like m-curves does
DECK.define("m-rangeplot", class extends DECK.MotionElement {
  static steps = 1;
  mount(ctx){
    this.style.display = "block";
    var yr = JSON.parse(this.getAttribute("yr") || "[0,1]"), vs = JSON.parse(this.getAttribute("values") || "[]");
    var lo = Math.min(yr[0], yr[1]), hi = Math.max(yr[0], yr[1]);
    var out = vs.filter(function(v){ return v < lo || v > hi; });
    if (out.length) ctx.report("range", "[rangeplot] " + out.length + " of " + vs.length + " values (" + out.join(", ") + ") are outside yr [" + yr.join(", ") + "] and are cut off");
    var g = DECK.el("svg", {viewBox: "0 0 400 200", style: "width:100%;height:100%"}, this);
    vs.forEach(function(v, i){
      var y = 190 - 180 * (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1);
      DECK.el("circle", {cx: 40 + i * 120, cy: y, r: 8, style: "fill:var(--term)"}, g);
    });
  }
});
