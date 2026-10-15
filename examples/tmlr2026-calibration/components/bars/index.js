// m-bars: grouped bars (raw vs temperature scaling); the last group is an outlier shown in three steps
// <m-bars style="height:380px"><script type="application/json">{{JSON:bars.json}}</script></m-bars>
// data = {metric:"ECE", groups:[{label, raw, ts}, …]}  (the last group is the outlier)
// step 1: the first groups grow from 0 (y max fits them)
// step 2: the last group's slot opens and its raw bar rises (comparable to the others); from the cue the
//         TS bar climbs on the SAME scale at a constant speed, overtakes every bar and reaches the top of the plot.
//         No number is shown while bars move; "0.168 = 11× raw" appears once at the end of step 3
// step 3: the view pulls back slowly (y max 0.016 → 0.20, log-interpolated) while the TS bar keeps growing to
//         its value; a faint band keeps the previous view's range visible as it shrinks; then a dashed line at
//         the raw level and the label "0.168 = 11× raw"
DECK.define("m-bars", class extends DECK.MotionElement {
  static steps = 3;
  static props = {
    cue:   {type: "number", default: 1.6, doc: "step 2: when the TS bar starts to climb (s); cues(2) = [cue]"},
    climb: {type: "number", default: 3.2, doc: "step 2: seconds for the TS bar to reach the top of the plot"},
    zoom:  {type: "number", default: 4.0, doc: "step 3: seconds of the pull-back"},
    y1:    {type: "number", default: 0, doc: "y max before the pull-back (0 = automatic)"},
    y2:    {type: "number", default: 0, doc: "y max after the pull-back (0 = automatic)"},
  };
  mount(){
    var D = DECK, d = this.data, G = d.groups, self = this;
    this.classList.add("plot"); this.style.display = "block";
    var nice = function(v){ var e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e;
      return (m <= 1 ? 1 : m <= 1.2 ? 1.2 : m <= 1.6 ? 1.6 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * e; };
    var first = G.slice(0, -1), last = this.lastG = G[G.length - 1];
    var maxOf = function(gs){ return Math.max.apply(null, gs.map(function(g){ return Math.max(g.raw, g.ts); })); };
    this.Y1 = this.props.y1 || nice(Math.max(maxOf(first), last.raw) * 1.08);
    this.Y2 = this.props.y2 || nice(maxOf(G) * 1.12);
    var p = this.p = D.Plot(this, {xr: [0, 1], yr: [0, 1], xt: [], yt: [], yl: d.metric || "", m: {l: 92, r: 16, t: 56, b: 52}});
    this.h = p.H - p.m.t - p.m.b; this.base = p.H - p.m.b; this.x0 = p.m.l; this.w = p.W - p.m.l - p.m.r;
    // the previous view's range during the pull-back (behind everything)
    this.band = D.el("rect", {x: this.x0, width: this.w, fill: "var(--term-tint)", opacity: 0}, p.svg);
    // y ticks: candidate step sets cross-fade as the scale moves
    var steps = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5]   // nested sets only, so cross-fading never mixes 0.04 with 0.05
     .filter(function(s){ return s <= self.Y2 && s * 12 >= self.Y1 / 2; });
    this.tsteps = steps;
    var vals = {}, fine = steps[0];
    for (var i = 0; i * fine <= this.Y2 * 1.0001; i++) vals[+(i * fine).toFixed(6)] = 1;
    var gT = D.el("g", {}, p.svg);
    this.ticks = Object.keys(vals).map(Number).sort(function(a, b){ return a - b; }).map(function(v){
      return {v: v, mult: steps.filter(function(s){ return Math.abs(v / s - Math.round(v / s)) < 1e-6; }),
              grid: D.el("line", {x1: self.x0, x2: self.x0 + self.w, stroke: "var(--line)", "stroke-width": 1.2}, gT),
              tick: D.el("line", {x1: self.x0 - 6, x2: self.x0, stroke: "var(--fg)", "stroke-width": 1.5}, gT),
              text: D.mtext(gT, self.x0 - 10, 0, "", {"text-anchor": "end", style: "font-variant-numeric:tabular-nums"})};
    });
    this.decimals = function(s){ var k = 0; while (Math.abs(s * Math.pow(10, k) - Math.round(s * Math.pow(10, k))) > 1e-6 && k < 6) k++; return k; };
    var gB = D.el("g", {}, p.svg);
    p.svg.appendChild(p.svg.querySelector("g.axes"));
    this.groups = G.map(function(g, i){
      var isLast = i === G.length - 1;
      return {g: g, last: isLast,
        raw: D.el("rect", {fill: "var(--muted)", rx: 3}, gB),
        ts:  D.el("rect", {fill: isLast ? "var(--emph)" : "var(--term)", rx: 3}, gB),
        lab: D.mtext(p.svg, 0, p.H - p.m.b + 32, g.label, {"text-anchor": "middle", "font-size": 24})};
    });
    var g0 = this.groups[0];
    g0.rawLab = D.mtext(p.svg, 0, 0, "raw", {"text-anchor": "middle", fill: "var(--muted)", "font-size": 24, "font-weight": 700});
    g0.tsLab = D.mtext(p.svg, 0, 0, "TS", {"text-anchor": "middle", fill: "var(--term)", "font-size": 24, "font-weight": 700});
    this.rawLine = D.el("line", {stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "6 6", opacity: 0}, p.svg);
    this.valLab = D.mtext(p.svg, 0, 0, "", {"text-anchor": "end", fill: "var(--emph)", "font-size": 28, "font-weight": 700, style: "font-variant-numeric:tabular-nums"});
    this.ratio = Math.round(last.ts / last.raw);
  }
  duration(k){ var P = this.props; return k === 1 ? 1.5 : k === 2 ? P.cue + P.climb + 0.3 : k === 3 ? P.zoom + 1.2 : 0; }
  cues(k){ return k === 2 ? [this.props.cue] : null; }
  render(k, t){
    var D = DECK, P = this.props, self = this, n = this.groups.length, L = this.lastG;
    var tt = function(step){ return k > step ? Infinity : k === step ? t : -1; };   // time within a given step (-1 = not yet)
    var at = function(step, start, dur){ var x = tt(step); return x < 0 ? 0 : D.prog(x, start, dur); };
    var lin = function(step, start, dur){ var x = tt(step); if (x < 0) return 0; if (x === Infinity) return 1; return D.clamp01((x - start) / dur); };
    // scale: fixed until step 3, then a slow pull-back
    var zp = at(3, 0, P.zoom);
    var ymax = Math.exp(D.lerp(Math.log(this.Y1), Math.log(this.Y2), zp));
    var Y = function(v){ return self.base - Math.min(v, ymax * 1.06) / ymax * self.h; };
    // ticks: weight each step set by its pixel spacing; a finer visible set hides coarser ones
    var W = {}, hide = 0;
    this.tsteps.forEach(function(s){ var a = D.clamp01((s / ymax * self.h - 46) / 10), w = a * (1 - hide); W[s] = w; hide += w; });
    var dom = this.tsteps.reduce(function(a, s){ return W[s] > W[a] ? s : a; }, this.tsteps[0]), dec = Math.max(2, this.decimals(dom));
    this.ticks.forEach(function(o){
      o.text.textContent = o.v === 0 ? "0" : o.v.toFixed(dec);
      var op = 0; o.mult.forEach(function(s){ op += W[s] || 0; });
      if (o.v > ymax * 1.001) op = 0;
      if (o.v === 0) op = 1;
      op = Math.min(1, op);
      var y = Y(o.v).toFixed(1);
      o.grid.setAttribute("y1", y); o.grid.setAttribute("y2", y); o.grid.setAttribute("opacity", (o.v === 0 ? 0 : 0.7 * op).toFixed(3));
      o.tick.setAttribute("y1", y); o.tick.setAttribute("y2", y); o.tick.setAttribute("opacity", op.toFixed(3));
      o.text.setAttribute("y", (+y + 8).toFixed(1)); o.text.setAttribute("opacity", op.toFixed(3));
    });
    // the previous view (0 … Y1) as a band while pulling back
    var bandOp = k < 3 ? 0 : 0.55 * at(3, 0, 0.4) * (1 - at(3, P.zoom + 0.2, 0.8));
    this.band.setAttribute("y", Y(this.Y1).toFixed(1)); this.band.setAttribute("height", (this.base - Y(this.Y1)).toFixed(1));
    this.band.setAttribute("opacity", bandOp.toFixed(3));
    // layout: the last slot opens in step 2
    var room = at(2, 0, 1.0), slots = D.lerp(n - 1, n, room), sw = this.w / slots, bw = Math.min(54, sw * 0.3);
    // the outlier TS value: constant-speed climb to the top in step 2, then grows with the pull-back in step 3
    var vTs = 0;
    if (k >= 2) vTs = this.Y1 * lin(2, P.cue, P.climb);
    if (k >= 3) vTs = Math.min(L.ts, Math.max(this.Y1, ymax * 0.97));
    if (k >= 3 && zp >= 1) vTs = L.ts;
    this.groups.forEach(function(o, i){
      var gx = o.last ? self.x0 + self.w - sw * 0.5 + (1 - room) * sw * 0.5 : self.x0 + sw * (i + 0.5);
      var vRaw, vT;
      if (!o.last){
        var t1 = tt(1);
        vRaw = t1 < 0 ? 0 : o.g.raw * D.prog(t1, 0.15 * i, 1.0);
        vT = t1 < 0 ? 0 : o.g.ts * D.prog(t1, 0.15 * i + 0.2, 1.0);
      } else {
        vRaw = o.g.raw * at(2, 0.3, 1.2);
        vT = vTs;
      }
      bar(o.raw, gx - bw - 2, vRaw); bar(o.ts, gx + 2, vT);
      o.lab.setAttribute("x", gx.toFixed(1));
      o.lab.setAttribute("opacity", (o.last ? at(2, 0.3, 0.6) : 1).toFixed(3));
      if (o.rawLab){
        o.rawLab.setAttribute("x", (gx - bw / 2 - 2).toFixed(1)); o.rawLab.setAttribute("y", (Y(vRaw) - 10).toFixed(1));
        o.tsLab.setAttribute("x", (gx + bw / 2 + 2).toFixed(1)); o.tsLab.setAttribute("y", (Y(vT) - 10).toFixed(1));
        var lo = at(1, 1.0, 0.5) * (1 - at(3, 0, 0.6));
        o.rawLab.setAttribute("opacity", lo.toFixed(3)); o.tsLab.setAttribute("opacity", lo.toFixed(3));
      }
      if (o.last){
        // running value above the bar; at the end of step 3 the ratio to raw
        var done = k >= 3 && zp >= 1;
        // no running number or arrow while the bar moves (intermediate values would read as data):
        // the value appears once, when the pull-back has finished
        self.valLab.textContent = L.ts.toFixed(3) + "  = " + self.ratio + "× raw";
        self.valLab.setAttribute("x", (gx + bw + 2).toFixed(1));
        self.valLab.setAttribute("y", (Y(vTs) - 12).toFixed(1));
        self.valLab.setAttribute("opacity", at(3, P.zoom + 0.1, 0.6).toFixed(3));
        // dashed line at the raw level, from the first group to the outlier
        var lineOp = at(3, P.zoom + 0.1, 0.6);
        self.rawLine.setAttribute("x1", self.x0); self.rawLine.setAttribute("x2", (gx + bw + 6).toFixed(1));
        self.rawLine.setAttribute("y1", Y(o.g.raw).toFixed(1)); self.rawLine.setAttribute("y2", Y(o.g.raw).toFixed(1));
        self.rawLine.setAttribute("opacity", lineOp.toFixed(3));
      }
    });
    function bar(r, x, v){
      var y = Y(v);
      r.setAttribute("x", x.toFixed(1)); r.setAttribute("width", bw.toFixed(1));
      r.setAttribute("y", y.toFixed(1)); r.setAttribute("height", Math.max(0, self.base - y).toFixed(1));
    }
  }
});
