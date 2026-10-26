// m-srlist: test component for the readable layer (tools/test-check-overflow.mjs). Like m-map-japan, it draws a small visible box and appends
// a visually hidden <ul> (1×1, overflow:hidden, clip-path: inset(50%), inline style and no .sr-only class) with many small <li>. Unclipped,
// the <li> boxes run far below the slide; the layout scan must not count them (bodyBottom, smallText, textOverlap)
DECK.define("m-srlist", class extends DECK.MotionElement {
  static steps = 1;
  mount(){
    this.style.display = "block";
    this.style.position = "relative";
    var p = document.createElement("div");
    p.style.cssText = "height:120px;border:2px solid var(--rule)";
    this.appendChild(p);
    var ul = document.createElement("ul");
    ul.setAttribute("style", "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0");
    for (var i = 1; i <= 40; i++){ var li = document.createElement("li"); li.style.fontSize = "16px"; li.textContent = "読み上げの行 " + i; ul.appendChild(li); }
    this.appendChild(ul);
  }
});
