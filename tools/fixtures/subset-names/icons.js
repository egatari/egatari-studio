// icons 1.0.0 (test fixture: the published part with its block cut to 10 icons by hand, layout kept): line icons by name (Tabler Icons outline, MIT; a library part, Egatari spec §6.1). Parts that draw an icon the
// lesson names (m-cards) require it as `requires: {icons: "1.0.0"}` and receive {svg, has, near, names, build}:
//   svg(name, {x, y, size, cls, missing}) -> an SVG <g> (aria-hidden) of the icon, its top left at (x, y), size px square
//     (default 24); stroke currentColor, 2 units of the 24-unit box, round caps and joins, so the colour comes from the
//     caller's class (term, emph, muted) and nothing is hard-coded. An unknown name draws an empty dashed box of the same
//     size and calls missing("unknown icon 'x' (did you mean …)") once per call, if given
//   has(name), names() (the names this copy carries), near(name) (up to 3 carried names by edit distance)
// Its build (subset by name) is a member of the value the factory returns (spec §6.2, egatari-spec 3d4ead0).
// The data block is written by tools/icons-import.mjs (do not edit it by hand). The producer keeps only the icons a lesson
// names (spec §6.2, match: "name"), so in a lesson `names()` lists only those; the full list is names.txt next to this file.
egatariParts.define({name: "icons", version: "1.0.0", requires: {}}, function(){
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  /* MIT data: Tabler Icons (https://tabler.io/icons), Copyright (c) 2020-2026 Paweł Kuna; see LICENSE-tabler.txt */
  var DATA = /*@egatari-block icons*/{"_notice":"Tabler Icons 3.49.0 (https://tabler.io/icons, npm @tabler/icons), outline style, brand icons left out. Copyright (c) 2020-2026 Paweł Kuna. MIT License; see LICENSE-tabler.txt next to this file. Egatari: only each path's d is kept (\"+\": also filled, \"*\": filled, not stroked).",
"a-b":["M3 16v-5.5a2.5 2.5 0 0 1 5 0v5.5m0 -4h-5","M12 6l0 12","M16 16v-8h3a2 2 0 0 1 0 4h-3m3 0a2 2 0 0 1 0 4h-3"],
"accessible":["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M10 16.5l2 -3l2 3m-2 -3v-2l3 -1m-6 0l3 1","+M11.5 7.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0"],
"arrow-right":["M5 12l14 0","M13 18l6 -6","M13 6l6 6"],
"chart-bar":["M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6","M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10","M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14","M4 20h14"],
"chart-bar-popular":["M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6","M9 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10","M15 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14","M4 20h14"],
"home":["M5 12l-2 0l9 -9l9 9l-2 0","M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7","M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"],
"percentage-10":["*M12 3c1.92 0 3.7 .601 5.16 1.626l-5.16 7.374v-9","M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"],
"table":["M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14","M3 10h18","M10 3v18"],
"user":["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0","M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"],
"x":["M18 6l-12 12","M6 6l12 12"]}/*@egatari-block-end*/;

  function names(){ return Object.keys(DATA).filter(function(k){ return k.charAt(0) !== "_"; }); }
  function has(name){ return typeof name === "string" && name.charAt(0) !== "_" && Object.prototype.hasOwnProperty.call(DATA, name); }
  function dist(a, b){
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev.push(j);
    for (i = 1; i <= a.length; i++){
      cur = [i];
      for (j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
      prev = cur;
    }
    return prev[b.length];
  }
  function near(name){
    var s = String(name), lim = Math.max(2, Math.floor(s.length / 3));
    return names().map(function(n){ return {n: n, d: dist(s, n)}; }).filter(function(x){ return x.d <= lim; })
      .sort(function(a, b){ return a.d - b.d || (a.n < b.n ? -1 : 1); }).slice(0, 3).map(function(x){ return x.n; });
  }
  function svg(name, opt){
    opt = opt || {};
    var size = opt.size || 24, g = document.createElementNS(NS, "g");
    g.setAttribute("transform", "translate(" + (opt.x || 0) + " " + (opt.y || 0) + ") scale(" + (size / 24) + ")");
    g.setAttribute("aria-hidden", "true");
    g.setAttribute("class", "icon" + (opt.cls ? " " + opt.cls : ""));
    g.setAttribute("style", "fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;");
    if (!has(name)){
      var r = document.createElementNS(NS, "rect");
      r.setAttribute("x", "3"); r.setAttribute("y", "3"); r.setAttribute("width", "18"); r.setAttribute("height", "18"); r.setAttribute("rx", "2");
      r.setAttribute("style", "stroke-dasharray:3 3;opacity:0.5;");
      g.appendChild(r);
      g.setAttribute("data-missing", String(name));
      if (opt.missing){ var m = near(name); opt.missing("unknown icon '" + name + "'" + (m.length ? " (did you mean " + m.join(", ") + "?)" : " (not a Tabler outline name, or not in this lesson's subset)")); }
      return g;
    }
    DATA[name].forEach(function(d){
      var p = document.createElementNS(NS, "path"), c = d.charAt(0);
      if (c === "+" || c === "*"){ d = d.slice(1); p.setAttribute("style", c === "+" ? "fill:currentColor;" : "fill:currentColor;stroke:none;"); }
      p.setAttribute("d", d);
      g.appendChild(p);
    });
    return g;
  }
  return {svg: svg, has: has, near: near, names: names,
    build: {subset: [{data: "block:icons", key: "name", match: "name"}]}};
});
