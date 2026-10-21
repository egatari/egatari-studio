// m-annotfix: test component for data-annot (tools/test-check-overflow.mjs). Renders into its own light DOM: a small span and a small SVG text,
// both marked data-annot, and keeps whatever the deck put inside it (an author's hand-written light-DOM children)
DECK.define("m-annotfix", class extends DECK.MotionElement {
  static steps = 1;
  mount(){
    this.style.display = "block";
    var s = document.createElement("span");
    s.setAttribute("data-annot", ""); s.style.fontSize = "18px"; s.textContent = "部品の注記";
    this.appendChild(s);
    var g = DECK.el("svg", {viewBox: "0 0 1000 200", width: 500, height: 100}, this);
    var a = DECK.el("g", {"data-annot": ""}, g);
    DECK.el("text", {x: 20, y: 100, "font-size": 30, style: "fill:var(--fg)"}, a).textContent = "部品の小さい注記";
  }
});
