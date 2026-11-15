// m-rdcode: test part for the parts' readable content (tools/test-readable-parts.mjs, backlog #216). Like m-code 2.2.0 it shows a window
// of 2 lines on the slide and keeps the full text in a hidden <pre data-readable>; it also marks a table (colspan, a class to drop, a <b>
// that becomes text) and puts a marked element inside the marked table (copied once, as part of the table)
DECK.define("m-rdcode", class extends DECK.MotionElement {
  static steps = 1;
  mount(){
    this.style.display = "block";
    var w = document.createElement("div"); w.textContent = "line 1\nline 2 ⋮ 2 more"; this.appendChild(w);
    var pre = document.createElement("pre"); pre.className = "sr-only"; pre.setAttribute("data-readable", "");
    pre.textContent = "line 1\nline 2\nif (a < b && c) {}\nline 4"; this.appendChild(pre);
    var t = document.createElement("table"); t.setAttribute("data-readable", ""); t.className = "grid";
    t.innerHTML = '<tr><th colspan="2" onclick="x()">head <b>bold</b></th></tr><tr><td data-readable lang="en">cell</td><td><img src="x.png" alt="pic">img</td></tr>';
    this.appendChild(t);
  }
});
