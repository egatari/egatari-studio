// 試験用の「悪意のあるデッキ」：examples/minimal に、原稿を書き換えようとする部品（components/evil/index.js）と
// インラインのスクリプトを足したもの。tools/test-dev-server.mjs と tools/test-app.mjs が使う（プレビューから書き込めないことを確かめる）
//   hostileFiles() → {相対パス: 中身}（deck.html・narration.md・components/evil/index.js）
// デッキの中のコードが試すこと（window.__attack(opts) が結果を返す。部品とスクリプトは読み込んだときにも一部を試す）：
//   古い書き込みの知らせ（app-api の edit・narration・comment）を偽の本文で親に送る、
//   合言葉（window.__DECK_DEV_TOKEN）を読む、親の文書（parent.document）に触る、
//   fetch・XHR・sendBeacon で /__dev/edit・/__dev/narration・/__dev/comment に POST（合言葉なし・当て推量の合言葉）
// window.__hint(kind) は偽の本文を付けた知らせ（edit・comment・key）を送る。comment-pin は範囲の外の点と長すぎる近くの字を付けた comment
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PWNED = 'PWNED';

const COMPONENT = `// m-evil：試験用。読み込んだときに書き込みを試みる（成功してはいけない）
DECK.define("m-evil", class extends DECK.MotionElement {
  static steps = 0;
  mount(){
    this.textContent = "m-evil";
    window.__evilMounted = true;
    try { parent.postMessage({type: "app-api", id: 7001, method: "POST", url: "/__dev/comment", body: {comment: "${PWNED}-COMPONENT"}}, "*"); } catch (e) {}
    try { fetch("/__dev/comment", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({comment: "${PWNED}-COMPONENT"})}).catch(function(){}); } catch (e) {}
  }
});
`;

// インラインのスクリプト（デッキの原稿の中）
const SCRIPT = `<script>
(function(){
  var W = "${PWNED}", V = [];
  window.__origOpen = window.open;   // 編集の部品（hints.js）が window.open を差し替える前の本物（外へ移る試みに使う）
  // 決まり（CSP）に止められたもの
  document.addEventListener("securitypolicyviolation", function(e){ V.push(e.effectiveDirective + " " + e.blockedURI); });
  function el(){ return document.querySelector("#stage [data-src]"); }
  function oldApi(){
    var e = el(), D = window.DECK, s = D && D.slides && D.slides[0];
    var sk = s ? s._key : "x";
    [["POST", "/__dev/edit", {range: e ? e.getAttribute("data-src") : "0-1", h: e ? e.getAttribute("data-src-h") : "", text: W + "-EDIT"}],
     ["POST", "/__dev/narration", {slideKey: sk, stepKey: "0", turns: [{role: "expert", text: W + "-NARR"}], rev: ""}],
     ["POST", "/__dev/comment", {key: sk + ":0", comment: W + "-COMMENT"}],
     ["POST", "/__dev/comment/resolve", {id: "x"}]].forEach(function(x, i){
      try { parent.postMessage({type: "app-api", id: 9000 + i, method: x[0], url: x[1], body: x[2]}, "*"); } catch (err) {}
    });
  }
  // 読み込んだときに古い書き込みの知らせを送る（この版では受け取る相手がいない）
  window.addEventListener("load", function(){ setTimeout(oldApi, 50); });
  window.__hint = function(kind){
    var e = el(), r = {l: 40, t: 40, r: 200, b: 80};
    if (kind === "edit") parent.postMessage({type: "edit-hint", kind: "edit", src: e.getAttribute("data-src"), h: e.getAttribute("data-src-h"), tag: "h2", text: W + "-HINT", body: {text: W + "-HINT"}, rect: r}, "*");
    else if (kind === "comment-pin") parent.postMessage({type: "edit-hint", kind: "comment", key: window.DECK.state().key, src: null, quote: W + "-QUOTE", near: (W + "-NEAR ").repeat(30), pin: {x: 99999, y: -3, evil: W}, rect: r}, "*");
    else if (kind === "comment") parent.postMessage({type: "edit-hint", kind: "comment", key: window.DECK.state().key, src: null, quote: W + "-QUOTE", comment: W + "-HINT-COMMENT", rect: r}, "*");
    else parent.postMessage({type: "edit-hint", kind: "key", key: kind}, "*");
  };
  window.__attack = function(o){
    o = o || {};
    var R = {}, base = o.base || "", urls = ["/__dev/edit", "/__dev/narration", "/__dev/comment"];
    R.token = typeof window.__DECK_DEV_TOKEN;
    R.tokenInDoc = document.documentElement.outerHTML.indexOf(o.token || "\\u0000-none") >= 0;
    try { R.parentDoc = !!window.parent.document.body; } catch (e) { R.parentDoc = "blocked"; }
    try { R.topDoc = !!window.top.document.body; } catch (e) { R.topDoc = "blocked"; }
    try { R.parentToken = String(window.parent.__DECK_DEV_TOKEN); } catch (e) { R.parentToken = "blocked"; }
    try { R.storage = typeof window.localStorage.length; } catch (e) { R.storage = "blocked"; }
    oldApi();
    var body = JSON.stringify({range: "0-1", h: "00000000", text: W + "-NET", comment: W + "-NET", slideKey: "x", stepKey: "0", turns: [], rev: ""});
    var jobs = [];
    urls.forEach(function(u){
      [null, o.guess || "0".repeat(48)].forEach(function(tok){
        var hd = {"content-type": "application/json"}; if (tok) hd["x-deck-token"] = tok;
        jobs.push(fetch(base + u, {method: "POST", headers: hd, body: body}).then(function(r){ return "fetch " + u + " " + r.status; }, function(){ return "fetch " + u + " blocked"; }));
        jobs.push(new Promise(function(res){
          try {
            var x = new XMLHttpRequest(); x.open("POST", base + u); x.setRequestHeader("content-type", "application/json"); if (tok) x.setRequestHeader("x-deck-token", tok);
            x.onload = function(){ res("xhr " + u + " " + x.status); }; x.onerror = function(){ res("xhr " + u + " blocked"); }; x.send(body);
          } catch (e) { res("xhr " + u + " blocked"); }
        }));
      });
      try { R["beacon " + u] = navigator.sendBeacon(base + u, new Blob([body], {type: "application/json"})); } catch (e) { R["beacon " + u] = "blocked"; }
    });
    return Promise.all(jobs).then(function(x){ R.net = x; return new Promise(function(r){ setTimeout(r, 300); }); }).then(function(){ R.violations = V.slice(); return R; });
  };
})();
</script>`;

export function hostileFiles() {
  const min = path.join(ROOT, 'examples', 'minimal');
  let deck = fs.readFileSync(path.join(min, 'deck.html'), 'utf8');
  // 1 枚目に部品を置き、</body> の前にスクリプトを入れる
  const at = deck.indexOf('</section>');
  if (at < 0 || !deck.includes('</body>')) throw new Error('unexpected examples/minimal/deck.html');
  deck = deck.slice(0, at) + '  <m-evil></m-evil>\n' + deck.slice(at);
  deck = deck.replace('</body>', SCRIPT + '\n</body>');
  return { 'deck.html': deck, 'narration.md': fs.readFileSync(path.join(min, 'narration.md'), 'utf8'), 'components/evil/index.js': COMPONENT };
}
export function writeHostileDeck(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [rel, text] of Object.entries(hostileFiles())) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return path.join(dir, 'deck.html');
}
