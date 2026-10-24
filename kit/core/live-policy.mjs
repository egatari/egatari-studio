// 授業の部屋（拡張 live。format spec の extensions/live.md と egatari/live の PROTOCOL.md）の決まりごとの純ロジック。
// 再生器（kit/live.js。build が DECK.LivePolicy にする）・編集アプリ（app/live-panel.js）・Node（kit/core/live.mjs・試験）が共有する
// - DOM・時計・node: に触れない（今の時刻は呼ぶ側が渡す）。export function 1 つで import なし（kit/core/build-core.mjs の classicModule）
// - 識別子の形と切断の番号は、写し（FORMAT.LIVE_VENDOR_DIR の schema.json・close-codes.json）と同じ（tools/test-live.mjs が比べる）
//
//   const LP = LivePolicy();
//   LP.validate(live, {key: true|false})   → 誤りの配列（[] なら正しい。1 つずつ {code, path, …引数, text}、toString() は英語の text）。key: true は書き出す派生（鍵が要る）、false は教材に残す設定（鍵があってはいけない）
//   LP.inWindow(live.window, nowMs)         窓の中か（両端に SKEW_MS のゆとり）
//   LP.closeInfo(code)                      {code, name, retry, kind}（kind：'retry' | 'stop'）
//   LP.plan(code, attempt, nowMs, window, rand) → {retry: true, delayMs} | {retry: false, reason}（つなぎ直すか、いつ）
//   LP.socketUrl(live, pid)                 学ぶ人の WebSocket の URL（endpoint と同じ origin。違えば null）
//   LP.sameEndpoint(url, endpoint)          URL の origin が endpoint の origin と同じか（http(s) と ws(s) を対応させる）
//   LP.activitiesFor(live, stepKey)         その段階で出す活動（"*" の後にその段階のもの）
//   LP.docContext(doc, endpoint)            この文書からつないでよいか：'' | 'framed' | 'scheme' | 'sandboxed' | 'preview' | 'policy'（迷ったら否）
//                                          doc：{framed, protocol, origin, pathname, csp: [CSP の <meta> の content…]}（再生器が location と DOM から集める）
//   LP.joinUrl(live)                        参加用のページ（egatari/live の /join#room=…&key=…）。鍵は # の後ろだけ（アドレスとしてサーバーに送られない）
//   LP.offerJoinLink(ctx, doc)              つなげない文書で「ブラウザで参加する」を出すか（編集アプリのプレビュー・この派生の決まりでない文書では出さない）
//   LP.normStrokes(v)                       質問に付ける「囲んだところ」の線を、Studio の手書きメモ（docs/contract.md §12）と同じ規則で整える。
//                                          [[[x, y], …], …]（舞台の座標 1280 × 720、0.1 に丸め、続く同じ点なし、1 本 2〜500 点・20 本・合わせて 2000 点まで）か null
// opts.allowLoopback：ループバックの http: の endpoint を許す（Node の試験と開発版の書き出しだけ。kit/core/live.mjs）
export function LivePolicy(opts) {
  // 開発版の再生器だけ true（kit/core/live.mjs の liveRuntime(…, {devLoopback: true}) が書き換える）。配る写しの再生器では常に false
  var LOOPBACK = false;
  var allowLoopback = LOOPBACK || !!(opts && opts.allowLoopback === true);
  var RE = {
    room: /^r-[a-z2-7]{8}$/,
    key: /^[A-Za-z0-9_-]{22,64}$/,
    pid: /^[A-Za-z0-9_-]{16,43}$/,
    activity: /^[A-Za-z0-9_-]{1,32}$/,
    ref: /^[A-Za-z0-9_-]{1,32}$/,
    step: /^(\*|[^\u0000-\u001f\u007f:]{1,80}:[^\u0000-\u001f\u007f:]{1,16})$/,
    datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/,
    sha256: /^[0-9a-f]{64}$/,
  };
  // windowRoomMs：部屋のサービス（egatari/live v1）が作れる窓の長さの上限（3 時間）。再生器は長い窓も読む（windowMs）
  // stroke*：質問に付ける「囲んだところ」（egatari/live の limits.js と Studio の手書きメモ §12 と同じ）。reply：ホストの返事の長さ
  var LIMITS = { prompt: 300, choice: 100, label: 80, question: 500, name: 40, reply: 200, choicesMin: 2, choicesMax: 12, activities: 64, windowMs: 7 * 24 * 3600 * 1000, windowRoomMs: 3 * 3600 * 1000,
    stageW: 1280, stageH: 720, strokes: 20, strokePoints: 500, strokesPoints: 2000 };
  // 窓の両端のゆとり（サーバーと同じ 2 分。仕様は 5 分まで許す）
  var SKEW_MS = 2 * 60 * 1000;
  // 切断の番号（egatari/live の protocol/close-codes.json）。retry はサーバーの表の値。この再生器のふるまいは plan が決める
  var CODES = {
    4400: ['bad_message', false], 4401: ['unauthorized', false], 4403: ['bad_key', false], 4404: ['room_not_found', false],
    4409: ['superseded', false], 4410: ['room_expired', false], 4423: ['room_closed', true], 4425: ['too_early', true],
    4429: ['rate_limited', true], 4430: ['room_full', true], 4440: ['key_replaced', false], 4441: ['not_approved', false],
  };
  // 自分からつなぎ直す番号と、その最短の待ち（egatari/live の PROTOCOL.md §5 の表と同じ）：4423（閉じた）は 30 秒、4429（送りすぎ）・4430（満員）は 60 秒より後。
  // 4425（まだ早い）は window.from に。ほかの 44xx は止めて、わけを見せる（4441 は先生がはっきり断ったもの。学ぶ人が押せば試し直せる）
  var RETRY_MIN_MS = { 4423: 30000, 4429: 60000, 4430: 60000, 4425: 0 };
  var BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];
  var own = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  var isObj = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };
  var str = function (v) { return typeof v === 'string'; };
  function parseEndpoint(s) {
    if (!str(s)) return null;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return null;
    if (u.protocol === 'https:') return u;
    // 開発版だけ：ループバックの http（ws）。配る写し・既定の書き出し・編集アプリでは断る（format spec の extensions/live.md：endpoint は https: でなければならない）
    if (allowLoopback && u.protocol === 'http:' && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) return u;
    return null;
  }
  function timeOf(s) { return str(s) && RE.datetime.test(s) ? Date.parse(s) : NaN; }
  // opts.key：鍵が要る（書き出す派生）か、あってはいけない（教材）か。opts.maxWindowMs：窓の長さの上限（編集アプリは部屋のサービスの上限 3 時間。既定 7 日）
  // 誤りは {code, path, …引数, text} の形（text は今までの英語の文。toString() も text なので、文字列として join・正規表現にかけられる）。
  // 画面の言葉への写しは呼ぶ側（編集アプリは app/i18n.js の liveProblem）が code と引数から作る
  function problem(code, path, params, text) {
    var o = { code: code, path: path, text: text, toString: function () { return this.text; } };
    for (var k in params) if (own(params, k)) o[k] = params[k];
    return o;
  }
  function validate(live, opts) {
    var wantKey = !!(opts && opts.key), maxW = opts && opts.maxWindowMs > 0 ? opts.maxWindowMs : LIMITS.windowMs, e = [];
    var add = function (code, path, params, text) { e.push(problem(code, path, params, text)); };
    if (!isObj(live)) return [problem('notObject', 'live', {}, 'live: not an object')];
    // sourceSha256：書き出す派生にだけ（教材の版。play-only の deck-meta からは消えるので、質問を教材のその版に結び付けるために拡張に入れる）
    var known = { v: 1, endpoint: 1, room: 1, key: 1, window: 1, activities: 1, sourceSha256: 1 };
    for (var k in live) if (own(live, k) && !own(known, k)) add('unknownMember', 'live.' + k, { member: k }, 'live.' + k + ': unknown member');
    if (live.v !== 1) add('version', 'live.v', {}, 'live.v: must be 1');
    if (!parseEndpoint(live.endpoint)) add('endpoint', 'live.endpoint', {}, 'live.endpoint: not an https origin (e.g. https://live.example.org)');
    if (!str(live.room) || !RE.room.test(live.room)) add('room', 'live.room', {}, 'live.room: not a room id (r- and 8 characters a-z, 2-7)');
    if (wantKey) { if (!str(live.key) || !RE.key.test(live.key)) add('key', 'live.key', {}, 'live.key: not a key (22 or more characters A-Z a-z 0-9 _ -)'); }
    else if (own(live, 'key')) add('keyStored', 'live.key', {}, 'live.key: the key must not be stored in the lesson (it goes only into the exported file)');
    if (own(live, 'sourceSha256')) {
      if (!wantKey) add('unknownMember', 'live.sourceSha256', { member: 'sourceSha256' }, 'live.sourceSha256: only in the exported file (the lesson has its own sourceSha256)');
      else if (!str(live.sourceSha256) || !RE.sha256.test(live.sourceSha256)) add('sourceSha256', 'live.sourceSha256', {}, 'live.sourceSha256: not 64 lowercase hex digits');
    }
    var w = live.window;
    if (!isObj(w)) add('windowMissing', 'live.window', {}, 'live.window: missing');
    else {
      var f = timeOf(w.from), t = timeOf(w.to);
      if (isNaN(f)) add('windowFrom', 'live.window.from', {}, 'live.window.from: not an RFC 3339 time with an offset');
      if (isNaN(t)) add('windowTo', 'live.window.to', {}, 'live.window.to: not an RFC 3339 time with an offset');
      if (!isNaN(f) && !isNaN(t) && !(t > f)) add('windowOrder', 'live.window', {}, 'live.window: "to" must be after "from"');
      if (!isNaN(f) && !isNaN(t) && t - f > maxW) {
        var hours = maxW % 86400000 ? Math.round(maxW / 3600000) : 0, days = hours ? 0 : maxW / 86400000;
        add('windowTooLong', 'live.window', { hours: hours, days: days }, 'live.window: at most ' + (hours ? hours + ' hours' : days + ' days') + ' long');
      }
      for (var wk in w) if (own(w, wk) && wk !== 'from' && wk !== 'to') add('unknownMember', 'live.window.' + wk, { member: wk }, 'live.window.' + wk + ': unknown member');
    }
    var a = live.activities;
    if (!isObj(a)) { add('activitiesMissing', 'live.activities', {}, 'live.activities: missing'); return e; }
    var ids = {}, n = 0;
    for (var sk in a) {
      if (!own(a, sk)) continue;
      var sp = 'live.activities["' + sk + '"]';
      if (!RE.step.test(sk)) { add('step', sp, { step: sk }, sp + ': not a step key or "*"'); continue; }
      if (!Array.isArray(a[sk])) { add('stepNotList', sp, { step: sk }, sp + ': not a list'); continue; }
      for (var i = 0; i < a[sk].length; i++) {
        var x = a[sk][i], at = sp + '[' + i + ']', P = { step: sk, index: i };
        n++;
        if (!isObj(x)) { add('activityNotObject', at, P, at + ': not an object'); continue; }
        if (str(x.id)) P.id = x.id;
        if (!str(x.id) || !RE.activity.test(x.id)) add('activityId', at + '.id', P, at + '.id: 1-32 characters A-Z a-z 0-9 _ -');
        else if (own(ids, x.id)) add('activityIdTwice', at + '.id', P, at + '.id: "' + x.id + '" is used twice');
        else ids[x.id] = 1;
        if (x.kind === 'confused') {
          // 「わからない」の一押し：文も選択肢もない
          if (own(x, 'choices') || own(x, 'prompt')) add('confusedMembers', at, P, at + ': a confused activity has no prompt or choices');
        } else if (x.kind === 'qa') {
          if (own(x, 'choices')) add('qaChoices', at, P, at + ': a qa has no choices');
          if (own(x, 'prompt') && (!str(x.prompt) || x.prompt.length > LIMITS.prompt)) add('qaPrompt', at + '.prompt', { step: sk, index: i, id: P.id, n: LIMITS.prompt }, at + '.prompt: at most ' + LIMITS.prompt + ' characters');
        } else if (x.kind === 'poll') {
          if (!str(x.prompt) || !x.prompt.trim() || x.prompt.length > LIMITS.prompt) add('pollPrompt', at + '.prompt', { step: sk, index: i, id: P.id, n: LIMITS.prompt }, at + '.prompt: 1-' + LIMITS.prompt + ' characters');
          if (!Array.isArray(x.choices) || x.choices.length < LIMITS.choicesMin || x.choices.length > LIMITS.choicesMax) add('pollChoices', at + '.choices', { step: sk, index: i, id: P.id, min: LIMITS.choicesMin, max: LIMITS.choicesMax }, at + '.choices: ' + LIMITS.choicesMin + '-' + LIMITS.choicesMax + ' choices');
          else for (var c = 0; c < x.choices.length; c++) if (!str(x.choices[c]) || !x.choices[c].trim() || x.choices[c].length > LIMITS.choice) add('pollChoice', at + '.choices[' + c + ']', { step: sk, index: i, id: P.id, c: c, n: LIMITS.choice }, at + '.choices[' + c + ']: 1-' + LIMITS.choice + ' characters');
        } else add('activityKind', at + '.kind', P, at + '.kind: "qa", "confused" or "poll"');
        // label：ステップの表示名（任意。「4 枚目『…』・ステップ 1」。表示だけの字で、鍵ではない）
        if (own(x, 'label') && (!str(x.label) || x.label.length > LIMITS.label)) add('activityLabel', at + '.label', { step: sk, index: i, id: P.id, n: LIMITS.label }, at + '.label: at most ' + LIMITS.label + ' characters');
        for (var xk in x) if (own(x, xk) && !own({ id: 1, kind: 1, prompt: 1, choices: 1, label: 1 }, xk)) add('unknownMember', at + '.' + xk, { step: sk, index: i, id: P.id, member: xk }, at + '.' + xk + ': unknown member');
      }
    }
    if (n > LIMITS.activities) add('tooManyActivities', 'live.activities', { n: LIMITS.activities }, 'live.activities: at most ' + LIMITS.activities + ' activities');
    return e;
  }
  function inWindow(w, now) {
    if (!isObj(w)) return false;
    var f = timeOf(w.from), t = timeOf(w.to);
    if (isNaN(f) || isNaN(t) || !isFinite(now)) return false;
    return now >= f - SKEW_MS && now <= t + SKEW_MS;
  }
  function windowEnd(w) { var t = isObj(w) ? timeOf(w.to) : NaN; return isNaN(t) ? NaN : t + SKEW_MS; }
  function windowStart(w) { var f = isObj(w) ? timeOf(w.from) : NaN; return isNaN(f) ? NaN : f - SKEW_MS; }
  function closeInfo(code) {
    var c = CODES[code];
    if (c) return { code: code, name: c[0], retry: c[1], kind: own(RETRY_MIN_MS, code) ? 'retry' : 'stop' };
    // 44xx の知らない番号は止める。ほか（1000 番台：通信が切れた・サーバーの再起動など）はつなぎ直す
    if (code >= 4000 && code <= 4999) return { code: code, name: 'unknown', retry: false, kind: 'stop' };
    return { code: code, name: 'network', retry: true, kind: 'retry' };
  }
  function plan(code, attempt, now, w, rand) {
    var info = closeInfo(code);
    if (info.kind !== 'retry') return { retry: false, reason: info.name };
    var r = typeof rand === 'number' ? rand : 0.5;
    var base = BACKOFF[Math.min(Math.max(attempt | 0, 0), BACKOFF.length - 1)];
    var d = Math.max(base, RETRY_MIN_MS[code] || 0);
    d = Math.round(d * (0.8 + 0.4 * r));   // ゆらぎ ±20%（大勢が同時につなぎ直さないように）
    if (own(RETRY_MIN_MS, code)) d = Math.max(d, RETRY_MIN_MS[code]);
    // まだ早い：窓の始まり（サーバーの時計で from − 2 分）に、ゆらぎ 0〜5 秒。もう過ぎているなら（時計のずれ）30 秒より後
    if (code === 4425) { var f = timeOf(w && w.from); d = (isNaN(f) || f - now < 5000 ? 30000 : f - now) + Math.round(5000 * r); }
    var end = windowEnd(w);
    if (!inWindow(w, now) || !(now + d <= end)) return { retry: false, reason: 'window_over' };
    return { retry: true, delayMs: d };
  }
  function wsBase(endpoint) {
    var u = parseEndpoint(endpoint);
    if (!u) return null;
    return (u.protocol === 'https:' ? 'wss://' : 'ws://') + u.host;
  }
  function socketUrl(live, pid) {
    if (!isObj(live) || !str(live.room) || !RE.room.test(live.room) || !str(live.key) || !RE.key.test(live.key) || !str(pid) || !RE.pid.test(pid)) return null;
    var b = wsBase(live.endpoint);
    if (!b) return null;
    var url = b + '/ws?room=' + encodeURIComponent(live.room) + '&key=' + encodeURIComponent(live.key) + '&pid=' + encodeURIComponent(pid);
    return sameEndpoint(url, live.endpoint) ? url : null;
  }
  function sameEndpoint(url, endpoint) {
    var e = parseEndpoint(endpoint), u;
    if (!e) return false;
    try { u = new URL(url); } catch (x) { return false; }
    var scheme = { 'wss:': 'https:', 'ws:': 'http:', 'https:': 'https:', 'http:': 'http:' }[u.protocol];
    return scheme === e.protocol && u.host === e.host && !u.username && !u.password;
  }
  function hostOf(endpoint) { var u = parseEndpoint(endpoint); return u ? u.host : ''; }
  // CSP の connect-src：endpoint の両方の形（https: の源を wss: に効かせないブラウザがある）
  function connectSrc(endpoint) {
    var u = parseEndpoint(endpoint);
    if (!u) return null;
    return u.protocol === 'https:' ? 'https://' + u.host + ' wss://' + u.host : 'http://' + u.host + ' ws://' + u.host;
  }
  function activitiesFor(live, stepKey) {
    var a = isObj(live) && isObj(live.activities) ? live.activities : {}, out = [];
    var add = function (sk) { if (own(a, sk) && Array.isArray(a[sk])) for (var i = 0; i < a[sk].length; i++) if (isObj(a[sk][i])) out.push({ step: sk, a: a[sk][i] }); };
    add('*');
    if (stepKey && stepKey !== '*') add(stepKey);
    return out;
  }
  // 学ぶ人が自分で開いたファイル：file: と、Android のファイルのアプリが渡す content:（Origin は null）。ほかの条件（枠でない・CSP・窓・「参加する」）は同じ
  var LOCAL = { 'file:': 1, 'content:': 1 };
  function cspOk(csp, endpoint) {
    if (!Array.isArray(csp) || csp.length !== 1 || !str(csp[0])) return false;
    var want = connectSrc(endpoint), cs = /(?:^|;)\s*connect-src\s+([^;]*)/i.exec(csp[0]);
    return !!want && !!cs && cs[1].trim().split(/\s+/).sort().join(' ') === want.split(' ').sort().join(' ');
  }
  function docContext(doc, endpoint) {
    if (!isObj(doc) || doc.framed !== false) return 'framed';
    var p = doc.protocol;
    if (!own(LOCAL, p) && p !== 'https:' && p !== 'http:') return 'scheme';
    if (!own(LOCAL, p) && doc.origin === 'null') return 'sandboxed';
    if (p === 'http:' && /^\/(preview|deck)(\/|$)/.test(str(doc.pathname) ? doc.pathname : '')) return 'preview';
    // この派生の決まり：CSP の <meta> がちょうど 1 つで、connect-src が endpoint だけ
    if (!cspOk(doc.csp, endpoint)) return 'policy';
    return '';
  }
  function joinUrl(live) {
    if (!isObj(live) || !str(live.room) || !RE.room.test(live.room) || !str(live.key) || !RE.key.test(live.key)) return null;
    var u = parseEndpoint(live.endpoint);
    if (!u) return null;
    return u.protocol + '//' + u.host + '/join#room=' + encodeURIComponent(live.room) + '&key=' + encodeURIComponent(live.key);
  }
  // 編集アプリのプレビュー（信頼する先頭部分の CSP は connect-src 'none'）・開発用のプレビュー・決まりの違う文書では出さない
  function offerJoinLink(ctx, doc) {
    if (ctx !== 'framed' && ctx !== 'scheme' && ctx !== 'sandboxed') return false;
    var csp = isObj(doc) && Array.isArray(doc.csp) ? doc.csp : [];
    for (var i = 0; i < csp.length; i++) if (/(?:^|;)\s*connect-src\s+'none'\s*(;|$)/i.test(str(csp[i]) ? csp[i] : '')) return false;
    return true;
  }
  // ---- 囲んだところ（docs/contract.md §12 の normStrokes と同じ規則。kit/core/comment-core.mjs と同じ答え）
  var r1 = function (v) { return Math.round(v * 10) / 10; };
  function cleanStroke(s) {
    if (!Array.isArray(s) || s.length > 5000) return null;
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var p = s[i];
      if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !isFinite(p[0]) || !isFinite(p[1])) continue;
      var x = r1(Math.min(LIMITS.stageW, Math.max(0, p[0]))), y = r1(Math.min(LIMITS.stageH, Math.max(0, p[1])));
      var q = out[out.length - 1];
      if (!q || q[0] !== x || q[1] !== y) out.push([x, y]);
    }
    return out.length >= 2 ? out : null;
  }
  // Ramer–Douglas–Peucker（両端を残す）
  function rdp(P, eps) {
    if (P.length <= 2) return P.slice();
    var keep = new Array(P.length), stack = [[0, P.length - 1]];
    keep[0] = keep[P.length - 1] = true;
    while (stack.length) {
      var se = stack.pop(), a = se[0], b = se[1], ax = P[a][0], ay = P[a][1], dx = P[b][0] - ax, dy = P[b][1] - ay, L = Math.hypot(dx, dy), best = -1, bi = -1;
      for (var i = a + 1; i < b; i++) {
        var d = L > 0 ? Math.abs(dy * (P[i][0] - ax) - dx * (P[i][1] - ay)) / L : Math.hypot(P[i][0] - ax, P[i][1] - ay);
        if (d > best) { best = d; bi = i; }
      }
      if (best > eps) { keep[bi] = true; stack.push([a, bi], [bi, b]); }
    }
    var out = [];
    for (var j = 0; j < P.length; j++) if (keep[j]) out.push(P[j]);
    return out;
  }
  function simplify(P, max) { var r = P; for (var eps = 0.25; r.length > max; eps *= 2) r = rdp(P, eps); return r; }
  function normStrokes(v) {
    if (!Array.isArray(v) || v.length > 200) return null;
    var seen = 0;
    for (var i = 0; i < v.length; i++) if (Array.isArray(v[i])) seen += v[i].length;
    if (seen > 20000) return null;
    var raw = [];
    for (var j = 0; j < v.length && raw.length < LIMITS.strokes; j++) { var c = cleanStroke(v[j]); if (c) raw.push(simplify(c, LIMITS.strokePoints)); }
    if (!raw.length) return null;
    var total = function (a) { var n = 0; for (var k = 0; k < a.length; k++) n += a[k].length; return n; };
    var r = raw;
    for (var eps = 0.25; total(r) > LIMITS.strokesPoints; eps *= 2) r = raw.map(function (P) { return P.length > 2 ? rdp(P, eps) : P; });
    return r;
  }
  return { RE: RE, LIMITS: LIMITS, normStrokes: normStrokes, SKEW_MS: SKEW_MS, CODES: CODES, BACKOFF: BACKOFF, RETRY_MIN_MS: RETRY_MIN_MS,
    validate: validate, inWindow: inWindow, windowStart: windowStart, windowEnd: windowEnd, closeInfo: closeInfo, plan: plan,
    socketUrl: socketUrl, sameEndpoint: sameEndpoint, parseEndpoint: parseEndpoint, hostOf: hostOf, connectSrc: connectSrc, activitiesFor: activitiesFor,
    docContext: docContext, cspOk: cspOk, joinUrl: joinUrl, offerJoinLink: offerJoinLink };
}
