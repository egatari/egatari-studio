// m-probe：部品庫 2.0 の受け口の試験（tools/test-parts-host.mjs）のための埋め込みのパーツ。base の MotionElement に乗り、
// 受け取った ctx・layout の呼ばれ方を window.__probe に書く。fail="mount" | "render" | "layout" | "steps" で、そこで投げる。
// report="<code>" なら mount で ctx.report(code, …) を 1 回呼ぶ。グローバルの DECK は読まない
egatariParts.define({name: "probe", version: "0.1.0", requires: {base: "1.0.0"}, element: "m-probe"}, function(deps){
  var base = deps.base;
  var log = (globalThis.__probe = globalThis.__probe || {mounts: [], renders: [], layouts: [], reports: []});
  return class extends base.MotionElement {
    static partName = "probe";
    static steps = 2;
    static clock = true;
    events(k){ return this.hasAttribute("sound-events") ? (k === 1
      ? [{t: 0, sound: "note", pitch: "C4", dur: 5, vel: .5}, {t: .2, sound: "bell"}, {t: .1, sound: "unknown"}]
      : [{t: 0, sound: "chime"}]) : []; }
    duration(k){ if (this.hasAttribute("sound-events")) return .4; return this.hasAttribute("input-clock") && k > 0 ? .2 : 0; }
    get steps(){ if (this.getAttribute("fail") === "steps") throw new Error("probe steps failed"); return 2; }
    mount(ctx){
      var id = this.id || "";
      log.mounts.push({id: id, keys: Object.keys(ctx).sort(), lang: ctx.lang, slide: ctx.slide, hasDeck: "deck" in ctx,
        slides: (ctx.slides || []).map(function(s){ return [s.key, s.title, s.steps, s.concl]; }), frozen: Object.isFrozen(ctx.slides)});
      if (this.getAttribute("fail") === "mount") throw new Error("probe mount failed");
      var r = this.getAttribute("report");
      if (r) ctx.report(r, "[probe] reported " + r);
      this.textContent = "probe " + id;
      this._ctx = ctx;
      if (this.hasAttribute("input-clock")) [60, -60, 0].forEach((seconds) => {
        var b = document.createElement("button"); b.type = "button"; b.dataset.extend = String(seconds); b.textContent = String(seconds);
        b.onclick = () => { var v = ctx.extend(seconds); (log.inputs || (log.inputs = [])).push(v); };
        this.appendChild(b);
      });
    }
    render(k, t, ctx){
      if (this.getAttribute("fail") === "render" && k >= 1) throw new Error("probe render failed");
      this._ctx = ctx;
      log.renders.push({extension: ctx.extend(0), counts: ctx.live ? ctx.live.poll("p1") : null, id: this.id || "", k: k, t: t === Infinity ? "inf" : t, entered: ctx.entered, instant: ctx.instant, reset: !!ctx.reset});
      this.setAttribute("data-k", String(k));
    }
    layout(ctx){
      if (this.getAttribute("fail") === "layout") throw new Error("probe layout failed");
      log.layouts.push({id: this.id || "", w: Math.round(this.getBoundingClientRect().width), slide: ctx.slide});
    }
  };
});
