// m-svgout: test part for partSvgOut (tools/test-part-svg-out.mjs, backlog #208). A working-folder part written with DECK.MotionElement
// whose root <svg> has a viewBox but no width or height: it takes the full width of its parent and a height from the viewBox's aspect ratio,
// so it sticks out of the element the slide sized (display:block; width 300px; height 100px)
DECK.define("m-svgout", class extends DECK.MotionElement {
  static steps = 1;
  mount(){
    this.style.display = "block";
    var g = DECK.el("svg", {viewBox: "0 0 400 400"}, this);
    DECK.el("circle", {cx: 200, cy: 200, r: 180, style: "fill:none;stroke:var(--term);stroke-width:4"}, g);
  }
});
