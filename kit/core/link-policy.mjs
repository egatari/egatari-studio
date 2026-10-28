// 授業の外へ出るリンクの決まり（format spec §11「Links that leave the lesson」）の純ロジック。
// 再生器（kit/deck.js。build が DECK.LinkPolicy にする）・Node の試験・将来の再生ページ（play.egatari.org）が共有する
// - DOM・時計・node: に触れない。export function 1 つで import なし（kit/core/build-core.mjs の classicModule）
// - 授業の中へのリンク（# だけ。§9.1A）はここでは扱わない（呼ぶ側が先に分ける）
//
//   const LP = LinkPolicy();
//   LP.decide({href, text, download}, {base, hosts})   → 判定（下）
//     href      aタグの href 属性の値（相対でもよい）。text：見える字（textContent と aria-label をつなげたもの）。download：download 属性があるか
//     base      相対リンクを解く文書のアドレス（location.href）。hosts：同じ閲覧のあいだに同意した host の集合（Set 相当：has だけ使う）
//   判定：{verdict: 'refuse', reason}                      開かない（reason：'invalid' | 'scheme'）
//         {verdict: 'confirm', url, host, scheme, reasons, must}   確かめる。url は行き先の全体、host は行き先の host（mailto: などは ''）
//                                                          reasons：'mismatch'（見える字が別の host を名指す）| 'insecure'（https: でない）| 'download' | 'userinfo' | 'punycode' | 'local'
//                                                          must：true なら host の記憶に関わらず毎回確かめる。false（https: の普通のリンク）は同じ host に同意済みなら verdict が 'open'
//         {verdict: 'open', url, host}                      同じ host に同意済み：そのまま開く
//   LP.remember(hosts, decision)        確かめて同意したあとに呼ぶ。must でない判定の host だけ記憶する（must の同意は次回へ持ち越さない）
//   LP.OPEN_FEATURES                    window.open の第 3 引数（'noopener,noreferrer'）。第 2 引数は '_blank'
//   LP.textHosts(text)                  見える字が名指す host の配列（小文字、www. と末尾の . を除く）
// 保守的な読み：spec が決めていない点（http(s)・mailto・tel 以外の scheme の扱い、file:、punycode・userinfo、host の一致の幅）は
// 確かめる側・開かない側に倒す（docs/contract.md §9）
export function LinkPolicy() {
  var OPEN = {http: true, https: true, mailto: true, tel: true};
  function normHost(h) {
    return String(h || '').toLowerCase().replace(/\.+$/, '').replace(/^www\./, '');
  }
  // 見える字の中の host らしいもの：URL（scheme://host）と、ドットでつながった語（example.org、sub.example.co.jp）
  function textHosts(text) {
    var out = [], t = String(text || '').normalize('NFKC');
    var re = /(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^\s/@:?#"'<>()\[\]、。，．]*@)?((?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+\p{L}{2,})/giu;
    var m;
    while ((m = re.exec(t))) {
      var h = normHost(m[1]);
      if (h && out.indexOf(h) < 0) out.push(h);
    }
    return out;
  }
  function parse(href, base) {
    var u;
    try { u = base ? new URL(String(href), String(base)) : new URL(String(href)); } catch (e) { return null; }
    return u;
  }
  function decide(link, ctx) {
    link = link || {}; ctx = ctx || {};
    var raw = String(link.href == null ? '' : link.href).trim();
    if (!raw) return {verdict: 'refuse', reason: 'invalid'};
    var u = parse(raw, ctx.base);
    if (!u) return {verdict: 'refuse', reason: 'invalid'};
    var scheme = u.protocol.replace(/:$/, '').toLowerCase();
    var local = false;
    if (scheme === 'file') {
      // file: は開かない。ただし file: の文書から相対で書いた隣のファイル（次の教材など）は、毎回確かめて開く
      var rel = !/^[a-z][a-z0-9+.-]*:/i.test(raw);
      var bs = ctx.base ? String(ctx.base).slice(0, 5).toLowerCase() : '';
      if (!(rel && bs === 'file:')) return {verdict: 'refuse', reason: 'scheme'};
      local = true;
    } else if (!OPEN[scheme]) return {verdict: 'refuse', reason: 'scheme'};
    var host = scheme === 'http' || scheme === 'https' ? u.hostname.toLowerCase() : '';
    if ((scheme === 'http' || scheme === 'https') && !host) return {verdict: 'refuse', reason: 'invalid'};
    var reasons = [];
    if (scheme !== 'https') reasons.push(local ? 'local' : 'insecure');
    if (link.download) reasons.push('download');
    if (u.username || u.password) reasons.push('userinfo');
    if (/(^|\.)xn--/.test(host)) reasons.push('punycode');
    if (host) {
      var want = normHost(host), th = textHosts(link.text);
      for (var i = 0; i < th.length; i++) if (th[i] !== want) { reasons.push('mismatch'); break; }
    }
    var must = reasons.length > 0;
    var url = u.href;
    if (!must && ctx.hosts && ctx.hosts.has && ctx.hosts.has(host)) return {verdict: 'open', url: url, host: host};
    return {verdict: 'confirm', url: url, host: host, scheme: scheme, reasons: reasons, must: must};
  }
  function remember(hosts, d) {
    if (hosts && hosts.add && d && d.verdict === 'confirm' && !d.must && d.host) hosts.add(d.host);
  }
  return {decide: decide, remember: remember, textHosts: textHosts, OPEN_FEATURES: 'noopener,noreferrer'};
}
