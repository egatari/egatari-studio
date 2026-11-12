// m-tally：品質チェックの種まきの教材（tools/test-seeded-defects.mjs）のための、わざと呼び出し順で絵が変わるパーツ（C-repro の compOrder）。
// render が呼ばれた回数を字にするので、開き直して 1 回 seek した絵と、飛び回ってから seek した絵が違う
egatariParts.define({name: "tally", version: "0.1.0", requires: {base: "1.0.0"}, element: "m-tally"}, function(deps){
  var base = deps.base;
  return class extends base.MotionElement {
    static partName = "tally";
    static steps = 1;
    mount(){ this._n = 0; this.style.display = "block"; }
    render(k){ this._n += 1; this.textContent = "描いた回数 " + this._n; }
  };
});
