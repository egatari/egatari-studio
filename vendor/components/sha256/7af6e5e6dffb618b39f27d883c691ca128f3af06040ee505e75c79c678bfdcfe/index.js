// m-scroll 2.0.0: puts a tall figure (inline SVG, HTML) in a frame of fixed height and moves it with the steps.
// <m-scroll style="height:440px"> … children … </m-scroll>: the children go into the frame as they are. A child with
// data-scroll-step="k" is the place the frame shows from step k on (k = 1, 2, …); steps = the largest k (the steps attribute
// wins). Inside the frame the wheel, touch, ↑ ↓ and PageUp / PageDown scroll the frame and do not move the slides; ← → and
// Space stay the player's. A viewer who scrolled by hand keeps their place until the next step (viewer input, spec §8.4);
// entering the slide again (ctx.entered) or a reset (ctx.reset) gives the frame back to the steps.
// Video (ctx.mode "video") and print show the author's place for the step. Under prefers-reduced-motion the player gives
// t = Infinity, so the frame jumps. The frame is cut on purpose (data-clip); the part draws nothing of its own.
// Origin: a student of the lab made it inside a progress-report file (scroll 0.1.0); taken in for 2.17 (handoff #66).
egatariParts.define({name: "scroll", version: "2.0.0", requires: {base: "1.3.0"}, element: "m-scroll"}, function(deps){
"use strict";
var base = deps.base;
var LINE = 40;   // px per ↑ ↓; PageUp / PageDown move 0.9 of the frame
var CSS_ID = "scroll-2-0-0-css";
var CSS = [
  "m-scroll{display:block;position:relative;overflow:hidden}",
  "m-scroll .sc-frame{position:relative;height:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;border:2px solid var(--line);border-radius:6px;box-sizing:border-box}",
  "m-scroll .sc-frame:focus-visible{outline:3px solid var(--emph);outline-offset:-3px}",
  "@media print{m-scroll .sc-frame{scrollbar-width:none}}",
].join("\n");
return class extends base.MotionElement {
  static partName = "scroll";
  static interactive = true;   // the viewer can scroll the frame (docs/conventions.md §6)
  static preview = "none";     // nothing lies ahead to show faint: the figure is all there, only its place changes
  static viewerInput = true;   // a place scrolled by hand is the viewer's state until the next step (spec §8.4)
  // no JSON: the children are the figure. The example is how to write it (as m-sweep's attribute-only shape)
  static shape = {schema: null, example: '<m-scroll style="height:440px" aria-label="年表"><svg viewBox="0 0 1000 1300" width="1000" height="1300">… <g data-scroll-step="1">…</g> …</svg></m-scroll>'};
  static props = {
    dur: {type: "number", default: 0.8, doc: "秒数：ステップが変わったときに枠が動く時間"},
    margin: {type: "number", default: 12, doc: "px：data-scroll-step の要素の上に空ける余白"},
  };
  get steps(){
    var a = this.getAttribute("steps");
    if (a !== null) return +a;
    var n = 0;
    [].forEach.call(this.querySelectorAll("[data-scroll-step]"), function(e){
      var k = parseInt(e.getAttribute("data-scroll-step"), 10);
      if (k > n) n = k;
    });
    return n;
  }
  mount(ctx){
    var doc = this.ownerDocument, self = this;
    if (!doc.getElementById(CSS_ID)) {
      var st = doc.createElement("style");
      st.id = CSS_ID; st.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(st);
    }
    this.video = ctx.mode === "video";
    var ja = /^ja\b/i.test(ctx.lang || "");
    this.setAttribute("data-clip", "");   // what lies outside the frame is shown by scrolling (cut on purpose)
    var fr = this._fr = doc.createElement("div");
    fr.className = "sc-frame";
    fr.setAttribute("data-clip", "");
    fr.setAttribute("tabindex", "0");
    fr.setAttribute("role", "region");
    fr.setAttribute("aria-label", this.getAttribute("aria-label") || (ja ? "縦に送る図" : "Scrolling figure"));
    [].slice.call(this.childNodes).forEach(function(n){ if (!(n.nodeType === 1 && n.localName === "script")) fr.appendChild(n); });
    this.appendChild(fr);
    var stop = function(e){ e.stopPropagation(); };
    ["wheel", "touchstart", "touchmove", "pointerdown", "click", "dblclick"].forEach(function(n){ fr.addEventListener(n, stop, {passive: true}); });
    fr.addEventListener("keydown", function(e){
      var d = e.key === "ArrowUp" ? -LINE : e.key === "ArrowDown" ? LINE
        : e.key === "PageUp" ? -fr.clientHeight * 0.9 : e.key === "PageDown" ? fr.clientHeight * 0.9 : null;
      if (d === null) return;
      e.preventDefault(); e.stopPropagation();
      fr.scrollBy({top: d, behavior: "auto"});
    });
    // scroll events come later than the write, so a flag cannot tell the steps' scroll from the viewer's:
    // a place more than 2 px from the one the steps wrote is the viewer's
    fr.addEventListener("scroll", function(){
      if (!self.video && (self._expect === undefined || Math.abs(fr.scrollTop - self._expect) > 2)) self._user = true;
    }, {passive: true});
    var view = doc.defaultView;
    if (view) view.addEventListener("beforeprint", function(){ self._user = false; if (self._k !== undefined) self.place(self._at(self._k)); });
  }
  // the scrollTop that shows the element of step k, or null when no child has data-scroll-step="k"
  _target(k){
    var fr = this._fr, a = fr.querySelector('[data-scroll-step="' + k + '"]');
    if (!a) return null;
    // the slide's scale from the border box (getBoundingClientRect and offsetHeight both include the border)
    var r = fr.getBoundingClientRect(), s = fr.offsetHeight ? r.height / fr.offsetHeight : 1;
    var top = (a.getBoundingClientRect().top - r.top) / (s || 1) - fr.clientTop + fr.scrollTop - this.props.margin;
    return Math.round(Math.max(0, Math.min(top, fr.scrollHeight - fr.clientHeight)));
  }
  // the place for step k: the element of the largest step ≤ k, else the top (so the result does not depend on the call order)
  _at(k){
    for (var j = k; j >= 1; j--) { var y = this._target(j); if (y !== null) return y; }
    return 0;
  }
  place(y){ this._expect = y; this._fr.scrollTop = y; }
  duration(k){ return k >= 1 ? this.props.dur : 0; }
  render(k, t, ctx){
    if (!this._fr) return;
    if (ctx && (ctx.entered === true || ctx.reset)) this._user = false;
    if (this._k !== k) { this._k = k; this._user = false; }   // a new step takes the frame back
    if (this._user) return;
    var to = this._at(k), from = k >= 1 ? this._at(k - 1) : to;
    // whole pixels: a fractional scrollTop can land a few px apart depending on the call order
    this.place(Math.round(base.lerp(from, to, base.prog(t, 0, this.props.dur))));
  }
};
});
