// 位置の置き場（PositionStore）：(スライド i, 段階 k, 段階の t) と再生の状態、リンクの「戻る」の跡（trail）を 1 か所に持ち、
// 知らせるときに購読者へ配る純ロジック。窓（ペイン）の仕組みの Phase 0（挙動を変えない抽出）
// - DOM・時計（performance.now・setTimeout・requestAnimationFrame）・node: に触れない（kit/core の約束。編集アプリと共有する）
// - 実行系では build（kit/core/build-core.mjs の classicModule）が deck.js の前に入れ、DECK.PositionStore（この関数）になる。
//   Node からはそのまま import する（tools/test-position.mjs）
// - いまの持ち主は舞台（kit/deck.js）：描いた位置（i, k）は seek のたびに at() で書き（知らせない。1 コマごとには配らない）、
//   知らせる（publish）のは、deck.js がこれまで位置を送っていた時（段階を決めたとき・自動再生を止めたとき・発表者ビューがつながったとき）だけ。
//   購読者（deck.js の broadcast：発表者ビュー・埋め込みの親・deck:pos）は、そのときの写し（snapshot）を受け取る
// - t は位置の知らせに載せる段階の t：動きの初めから描くなら 0、最終状態なら null（format spec §9.4 の position の t）
// - cause は位置が変わったわけ（control・link・seek・play）。null なら知らせでは control
// - trail の項目は中身を見ない（deck.js は {i, k, el} を積む。el はキーボードで押したリンク）
export function createPositionStore() {
  let i = 0, k = 0, t = null, playing = false, cause = null;
  const trail = [], subs = [];
  function top() { return trail.length ? trail[trail.length - 1] : null; }
  function snapshot() { return { i, k, t, playing, cause, depth: trail.length, top: top() }; }
  const store = {
    get i() { return i; },
    get k() { return k; },
    get t() { return t; },
    get playing() { return playing; },
    get cause() { return cause; },
    get depth() { return trail.length; },
    // 描いた位置（知らせない）
    at(ni, nk) { i = ni; k = nk; },
    setT(v) { t = v; },
    setPlaying(on) { playing = !!on; },
    setCause(c) { cause = c == null ? null : c; },
    // リンクの「戻る」の跡（Store に 1 本だけ。どの窓・ペインも共有する）
    push(entry) { trail.push(entry); return trail.length; },
    pop() { return trail.length ? trail.pop() : null; },
    top,
    snapshot,
    // 購読：fn(snapshot)。戻り値で購読をやめる
    subscribe(fn) {
      subs.push(fn);
      return function () { const j = subs.indexOf(fn); if (j >= 0) subs.splice(j, 1); };
    },
    // 今の位置を購読者に配る（登録の順。例外はそのまま呼んだ側へ）
    publish() {
      const p = snapshot();
      subs.slice().forEach(function (fn) { fn(p); });
    },
  };
  return store;
}
