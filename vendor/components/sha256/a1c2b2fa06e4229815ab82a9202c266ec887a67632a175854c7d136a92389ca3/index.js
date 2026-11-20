// contour-core 1.0.0: contour lines of a field sampled on a grid (a library part, Egatari spec §6.1), by marching squares.
// Pure functions of their arguments: no DOM, no state. m-classify2d requires it now and m-contour will. The values come from
// the author's script; this only draws where a level crosses them (linear interpolation along each cell edge).
//   values: ny rows of nx numbers; values[j][i] is the field at column i, row j. Coordinates out are in grid units:
//   x = i (0 … nx−1), y = j (0 … ny−1). The caller maps them to its axes.
//   returns {segments, lines, labelAt, rangeOf}
egatariParts.define({name: "contour-core", version: "1.0.0", requires: {}}, function(){
  "use strict";
  // Each cell's crossing segments. Saddle cells (two opposite corners above) are split by the cell's mean, the usual rule.
  function segments(values, level){
    var out = [], ny = values.length, nx = ny ? values[0].length : 0;
    for (var j = 0; j + 1 < ny; j++) for (var i = 0; i + 1 < nx; i++){
      var a = values[j][i], b = values[j][i + 1], c = values[j + 1][i + 1], d = values[j + 1][i];
      if (![a, b, c, d].every(Number.isFinite)) continue;
      var k = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
      if (k === 0 || k === 15) continue;
      var t = function(p, q){ return q === p ? 0.5 : (level - p) / (q - p); };
      var top = [i + t(a, b), j], right = [i + 1, j + t(b, c)], bottom = [i + t(d, c), j + 1], left = [i, j + t(a, d)];
      var mid = (a + b + c + d) / 4 >= level;
      switch (k){
        case 1: case 14: out.push([left, top]); break;
        case 2: case 13: out.push([top, right]); break;
        case 3: case 12: out.push([left, right]); break;
        case 4: case 11: out.push([right, bottom]); break;
        case 6: case 9: out.push([top, bottom]); break;
        case 7: case 8: out.push([left, bottom]); break;
        case 5: if (mid){ out.push([left, bottom], [top, right]); } else { out.push([left, top], [right, bottom]); } break;
        case 10: if (mid){ out.push([left, top], [right, bottom]); } else { out.push([left, bottom], [top, right]); } break;
      }
    }
    return out;
  }
  // Join segments that share an end into polylines (ends are compared after rounding to 1e-9 grid units).
  function lines(values, level){
    var segs = segments(values, level), key = function(p){ return Math.round(p[0] * 1e9) + "," + Math.round(p[1] * 1e9); };
    var ends = {}, used = new Array(segs.length).fill(false), out = [];
    segs.forEach(function(s, n){ [0, 1].forEach(function(e){ var k = key(s[e]); (ends[k] = ends[k] || []).push([n, e]); }); });
    var next = function(p){ var list = ends[key(p)] || []; for (var m = 0; m < list.length; m++) if (!used[list[m][0]]) return list[m]; return null; };
    for (var n = 0; n < segs.length; n++){
      if (used[n]) continue;
      used[n] = true;
      var line = [segs[n][0], segs[n][1]], h;
      while ((h = next(line[line.length - 1]))){ used[h[0]] = true; line.push(segs[h[0]][1 - h[1]]); }
      while ((h = next(line[0]))){ used[h[0]] = true; line.unshift(segs[h[0]][1 - h[1]]); }
      out.push(line);
    }
    return out;
  }
  // The point at a fraction f (default ½) of a polyline's length, with the angle (radians) of the segment there.
  function labelAt(line, f){
    var L = 0, i, seg = [];
    for (i = 1; i < line.length; i++){ var d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); seg.push(d); L += d; }
    var want = L * (f === undefined ? 0.5 : f);
    for (i = 0; i < seg.length; i++){
      if (want <= seg[i] || i === seg.length - 1){
        var u = seg[i] ? Math.min(1, want / seg[i]) : 0, p = line[i], q = line[i + 1];
        return {x: p[0] + (q[0] - p[0]) * u, y: p[1] + (q[1] - p[1]) * u, angle: Math.atan2(q[1] - p[1], q[0] - p[0]), length: L};
      }
      want -= seg[i];
    }
    return {x: line[0][0], y: line[0][1], angle: 0, length: 0};
  }
  function rangeOf(values){
    var lo = Infinity, hi = -Infinity;
    values.forEach(function(r){ r.forEach(function(v){ if (Number.isFinite(v)){ if (v < lo) lo = v; if (v > hi) hi = v; } }); });
    return [lo, hi];
  }
  return {segments: segments, lines: lines, labelAt: labelAt, rangeOf: rangeOf};
});
