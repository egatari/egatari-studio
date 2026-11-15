// m-svgfit: test part for partSvgOut (tools/test-part-svg-out.mjs, backlog #208). The same drawing as m-svgout, but the root <svg> is
// sized with width:100%;height:100%, so it stays inside the element (no warning)
DECK.define("m-svgfit", class extends DECK.MotionElement {
  static steps = 1;
  mount(){
    this.style.display = "block";
    var g = DECK.el("svg", {viewBox: "0 0 400 400", style: "width:100%;height:100%"}, this);
    DECK.el("circle", {cx: 200, cy: 200, r: 180, style: "fill:none;stroke:var(--term);stroke-width:4"}, g);
  }
});
