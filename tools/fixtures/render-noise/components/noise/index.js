// m-noise: a test part for tools/test-render-compare.mjs. NOT a well-behaved part: once it has drawn its last step,
// it moves its circle by `amp` px through a constructed style sheet (document.adoptedStyleSheets), which is not in the DOM.
// So a later draw of the same (k, t) has the same DOM but other pixels: with a small circle and amp < 1 px only the
// anti-aliasing along the edge changes (like Chrome's renderer noise); with a big amp the circle visibly moves.
var sheet = new CSSStyleSheet(), shifts = {};
document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
DECK.define("m-noise", class extends DECK.MotionElement {
  static steps = 3;
  static props = {
    amp: {type: "number", default: 0.4, doc: "shift (px) after the last step has been drawn"},
    r: {type: "number", default: 10, doc: "circle radius (px)"},
  };
  mount(){
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), c = document.createElementNS(ns, "circle");
    this.style.display = "block";
    svg.setAttribute("viewBox", "0 0 400 300"); svg.setAttribute("width", "400"); svg.setAttribute("height", "300");
    c.setAttribute("cx", "200"); c.setAttribute("cy", "150"); c.setAttribute("r", String(this.props.r)); c.setAttribute("fill", "var(--fg)");
    svg.appendChild(c); this.appendChild(svg); this.c = c;
  }
  render(k){
    if (k >= 3 && !shifts[this.id]) {
      shifts[this.id] = this.props.amp;
      sheet.replaceSync(Object.keys(shifts).map(function(id){ return "#" + id + " circle{transform:translate(" + shifts[id] + "px,0)}"; }).join("\n"));
    }
    this.c.setAttribute("opacity", k >= 1 ? "1" : "0.5");
  }
});
