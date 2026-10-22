// Egatari Play: Live (questions and polls) held by the page for the sandboxed lesson (format spec extensions/live.md §2A).
// The lesson never connects (its frame has connect-src 'none' and is framed, §2.1). The page:
//   - reads extensions.live with a parser that runs nothing (play/scan.mjs) and validates it (kit/core/live-policy.mjs, key required);
//   - follows §2 itself: no request outside the window or before the viewer presses Join (one tap, the destination host shown),
//     a visible indicator, only what an activity needs (question, vote, a name if typed, a random id made on this device, ping),
//     connections only to the declared endpoint and only to endpoints this page's own policy allows (connect-src), and the
//     retry rules of the protocol (LivePolicy.plan);
//   - learns the current step from the lesson's position events (spec §9.4) to show that step's poll, outside the lesson's frame.
// An endpoint this page does not allow gets the join page link instead (live §4 /join; a link the page makes itself, §11 (h)).
// Nothing is relayed into the lesson. Text from the room is shown as text (textContent), never as markup.
//
//   const L = startLive({live, words, lang, allowed, policy, el, onOpen})  → {setStep(key), stop(), state()}
//     allowed   Set of endpoint origins this page may connect to (the build writes them into its CSP too)
//     policy    a LivePolicy() instance
//     el        the elements of #live (see play/index.html)
//     onOpen(true, 'poll')  a poll step came on screen (announced); onOpen('polls', n): the number of polls the viewer can answer now changed
import { FORMAT } from '../kit/core/format.mjs';

const REJOIN = { room_closed: 1, too_early: 1, room_full: 1, rate_limited: 1, superseded: 1, not_approved: 1, network: 1, unknown: 1, window_over: 0 };

export function startLive({ live, words: S, lang, allowed, policy: LP, el, onOpen, announce }) {
  const HOST = LP.hostOf(live.endpoint);
  const origin = (() => { try { return new URL(live.endpoint).origin; } catch { return ''; } })();
  const DIRECT = allowed.has(origin);
  const JOIN_URL = DIRECT ? null : LP.joinUrl(live);
  const fmt = (s) => { try { return new Date(s).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
  let ST = 'off', ws = null, attempt = 0, retryTimer = null, retryAt = 0, tickTimer = null, pingTimer = null, endTimer = null, startTimer = null;
  let lastPolls = 0;
  let admitted = false, stepKey = '*', refN = 0, pending = {}, votes = {}, shown = [], nameSent = '', stopReason = '', left = false, info = '', stopped = false, lastCode = 0;
  const MEM = {};
  const store = () => { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } };
  const PID_KEY = FORMAT.LIVE_STORE_PREFIX + 'pid:' + live.room;
  function newPid() { const b = crypto.getRandomValues(new Uint8Array(16)); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function pid() {
    const s = store();
    let p = null;
    try { p = s ? s.getItem(PID_KEY) : MEM[PID_KEY]; } catch { p = MEM[PID_KEY]; }
    if (!p || !LP.RE.pid.test(p)) { p = newPid(); try { if (s) s.setItem(PID_KEY, p); } catch { /* memory only */ } MEM[PID_KEY] = p; }
    return p;
  }
  const now = () => Date.now();
  const phase = () => { const t = now(); if (t < LP.windowStart(live.window)) return 'before'; if (t > LP.windowEnd(live.window)) return 'after'; return 'open'; };
  const setState = (s, why) => { ST = s; stopReason = why || ''; render(); };
  const say = (t) => { if (announce) announce(t); };

  el.notice.textContent = DIRECT ? S.notice(HOST) : S.noDirect(HOST);
  el.window.textContent = S.windowText(fmt(live.window.from), fmt(live.window.to));
  el.dest.textContent = S.dest(HOST);
  el.dest.classList.add('dest');
  if (JOIN_URL) { el.joinLink.href = JOIN_URL; el.linkDest.textContent = S.dest(new URL(JOIN_URL).host); el.linkDest.classList.add('dest'); }
  el.name.maxLength = LP.LIMITS.name;
  el.q.maxLength = LP.LIMITS.question;

  const current = (kind) => LP.activitiesFor(live, stepKey).filter((x) => x.a.kind === kind);
  function render() {
    if (stopped) return;
    const ph = phase(), conn = ST === 'connected' || ST === 'waiting';
    const label = ST === 'connected' ? S.connected : ST === 'waiting' ? S.waiting : ST === 'connecting' ? S.connecting
      : ST === 'retrying' ? S.retrying(Math.max(1, Math.ceil((retryAt - now()) / 1000))) : ST === 'stopped' ? (S.stop[stopReason] || S.stop.unknown)
        : ph === 'before' ? S.before(fmt(live.window.from)) : ph === 'after' ? S.after : S.off;
    el.root.setAttribute('data-state', ST);
    el.button.setAttribute('data-state', ST);
    el.state.textContent = label; el.state.title = label;
    el.buttonState.textContent = (lang === 'ja' ? '：' : ': ') + label;
    el.leave.hidden = !(conn || ST === 'connecting' || ST === 'retrying');
    const canJoin = DIRECT && ph === 'open' && (ST === 'off' || (ST === 'stopped' && REJOIN[stopReason] === 1));
    el.join.hidden = !DIRECT || ph !== 'open' || conn || ST === 'connecting' || ST === 'retrying' || (ST === 'stopped' && REJOIN[stopReason] !== 1);
    el.join.disabled = !canJoin;
    el.join.textContent = ST === 'stopped' ? S.again : S.join;
    el.linkRow.hidden = !JOIN_URL || ph !== 'open';
    el.msg.textContent = ST === 'stopped' ? (S.stop[stopReason] || S.stop.unknown) : info;
    el.nameRow.hidden = !DIRECT || ph !== 'open';
    renderActivities(conn && admitted);
    const np = conn && admitted ? current('poll').length : 0;
    el.pollBtn.hidden = np === 0;
    if (np !== lastPolls) { lastPolls = np; onOpen('polls', np); }
    el.shown.hidden = !(conn && shown.length);
    el.shownList.textContent = '';
    for (const it of shown) { const li = document.createElement('li'); li.textContent = it.text; el.shownList.appendChild(li); }
  }
  function renderActivities(on) {
    el.qa.hidden = !on || !current('qa').length;
    el.send.disabled = !on;
    const want = on ? current('poll').filter((x) => Array.isArray(x.a.choices)) : [];
    const sig = want.map((x) => x.step + '/' + x.a.id).join('|');
    if (el.polls.getAttribute('data-sig') === sig) {
      for (const x of want) { const n = el.polls.querySelector(`[data-poll="${CSS.escape(x.a.id)}"] .note`); if (n) n.textContent = votes[x.a.id] && votes[x.a.id].ok ? S.voted + ' · ' + S.revote : ''; }
      return;
    }
    el.polls.setAttribute('data-sig', sig);
    el.polls.textContent = '';
    for (const x of want) {
      const fs = document.createElement('fieldset'); fs.setAttribute('data-poll', x.a.id);
      const lg = document.createElement('legend'); lg.textContent = x.a.prompt; fs.appendChild(lg);
      x.a.choices.forEach((c, j) => {
        const l = document.createElement('label'), r = document.createElement('input'), sp = document.createElement('span');
        r.type = 'radio'; r.name = 'lv-poll-' + x.a.id; r.value = String(j);
        if (votes[x.a.id] && votes[x.a.id].choice === j) r.checked = true;
        sp.textContent = c; l.appendChild(r); l.appendChild(sp); fs.appendChild(l);
      });
      const row = document.createElement('div'); row.className = 'row';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'vote'; b.textContent = S.vote;
      const note = document.createElement('span'); note.className = 'note small'; note.textContent = votes[x.a.id] && votes[x.a.id].ok ? S.voted + ' · ' + S.revote : '';
      b.addEventListener('click', () => { const sel = fs.querySelector('input:checked'); if (sel) vote(x, +sel.value); });
      row.appendChild(b); row.appendChild(note); fs.appendChild(row);
      el.polls.appendChild(fs);
    }
  }
  function send(o) { if (!ws || ws.readyState !== 1) return false; try { ws.send(JSON.stringify(o)); return true; } catch { return false; } }
  const nextRef = () => { refN = (refN + 1) % 1e6; return 'r' + refN; };
  function ask() {
    const text = el.q.value.trim();
    if (!text) { info = S.err.empty_text; render(); return; }
    const a = current('qa')[0];
    if (!a) return;
    const step = a.step === '*' ? (LP.RE.step.test(stepKey) ? stepKey : '*') : a.step;
    const ref = nextRef();
    if (send({ v: 1, t: 'ask', ref, activity: a.a.id, step, text: text.slice(0, LP.LIMITS.question) })) { pending[ref] = { kind: 'ask' }; el.send.disabled = true; }
  }
  function vote(x, choice) {
    const ref = nextRef();
    if (send({ v: 1, t: 'vote', ref, activity: x.a.id, step: x.step, choice })) { pending[ref] = { kind: 'vote', id: x.a.id, choice }; votes[x.a.id] = { choice, ok: false }; }
  }
  function sendName() {
    const n = el.name.value.trim().slice(0, LP.LIMITS.name);
    if (n === nameSent || (!n && !nameSent)) return;
    const ref = nextRef();
    if (send({ v: 1, t: 'name', ref, name: n })) pending[ref] = { kind: 'name', name: n };
  }
  const items = (l) => (Array.isArray(l) ? l.filter((x) => x && typeof x.text === 'string').slice(0, 50).map((x) => ({ text: x.text.slice(0, 1000) })) : []);
  function onMessage(ev) {
    if (typeof ev.data !== 'string' || ev.data.length > 262144) return;
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (!m || typeof m !== 'object' || m.v !== 1 || typeof m.t !== 'string') return;
    if (m.t === 'welcome') {
      attempt = 0; admitted = m.status === 'admitted'; shown = items(m.shown); info = '';
      setState(admitted ? 'connected' : 'waiting'); say(admitted ? S.connected : S.waiting);
      if (el.name.value.trim()) sendName();
    } else if (m.t === 'admitted') { admitted = true; shown = items(m.shown); setState('connected'); say(S.connected); }
    else if (m.t === 'shown') { shown = items(m.items); render(); }
    else if (m.t === 'ack') {
      const p = typeof m.ref === 'string' ? pending[m.ref] : null;
      if (!p) return;
      delete pending[m.ref];
      if (p.kind === 'ask') { el.q.value = ''; info = S.sent; say(S.sent); }
      else if (p.kind === 'vote') { votes[p.id] = { choice: p.choice, ok: true }; info = ''; say(S.voted); }
      else if (p.kind === 'name') nameSent = p.name;
      render();
    } else if (m.t === 'error') {
      if (typeof m.ref === 'string') delete pending[m.ref];
      info = S.err[typeof m.code === 'string' ? m.code : ''] || S.err.other; say(info); render();
    }
  }
  function clearTimers() { clearTimeout(retryTimer); clearInterval(tickTimer); clearInterval(pingTimer); retryTimer = tickTimer = pingTimer = null; }
  function connect() {
    clearTimers();
    if (stopped || !DIRECT || left || phase() !== 'open') { render(); return; }
    const url = LP.socketUrl(live, pid());
    if (!url || !LP.sameEndpoint(url, live.endpoint)) { setState('stopped', 'bad_endpoint'); return; }
    let s;
    try { s = new WebSocket(url); } catch { onClose({ code: 1006 }); return; }
    ws = s; admitted = false; pending = {};
    setState('connecting');
    s.onmessage = (ev) => { if (ws === s) onMessage(ev); };
    s.onopen = () => { if (ws !== s) return; pingTimer = setInterval(() => send({ v: 1, t: 'ping' }), 45000); };
    s.onclose = (ev) => { if (ws !== s) return; ws = null; onClose(ev); };
    s.onerror = () => {};
    scheduleEnd();
  }
  function onClose(ev) {
    clearTimers(); admitted = false;
    if (left || stopped) return;
    const code = ev && typeof ev.code === 'number' ? ev.code : 1006;
    lastCode = code;
    const p = LP.plan(code, attempt, now(), live.window, Math.random());
    if (!p.retry) { setState('stopped', p.reason); say(S.stop[p.reason] || S.stop.unknown); return; }
    attempt++;
    retryAt = now() + p.delayMs;
    setState('retrying');
    tickTimer = setInterval(render, 1000);
    retryTimer = setTimeout(connect, p.delayMs);
  }
  function scheduleEnd() {
    clearTimeout(endTimer);
    const ms = LP.windowEnd(live.window) - now();
    if (!(ms > 0)) return;
    endTimer = setTimeout(() => {
      clearTimers();
      if (ws) { const s = ws; ws = null; try { s.close(1000, 'window'); } catch { /* gone */ } }
      if (ST !== 'off') setState('stopped', 'window_over'); else render();
    }, Math.min(ms + 500, 2147483000));
  }
  function join() { if (!DIRECT || phase() !== 'open') return; left = false; attempt = 0; info = ''; connect(); }
  function leave() {
    left = true; clearTimers();
    if (ws) { const s = ws; ws = null; try { s.close(1000, 'bye'); } catch { /* gone */ } }
    admitted = false; info = S.leftMsg; setState('off'); say(S.leftMsg);
  }
  const on = [[el.join, 'click', join], [el.leave, 'click', leave], [el.send, 'click', ask], [el.name, 'change', sendName],
    [el.q, 'keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } }]];
  for (const [t, n, f] of on) t.addEventListener(n, f);
  // a step with a poll opens the pane (inside the window, where the viewer can join or follow the join link); not for "*"
  let autoOpened = false;
  const pollHere = () => LP.activitiesFor(live, stepKey).some((x) => x.step !== '*' && x.a.kind === 'poll');
  function syncAuto() {
    const want = phase() === 'open' && pollHere();
    if (want && !autoOpened) { autoOpened = true; onOpen(true, 'poll'); say(S.pollOpen); }
    else if (!want && autoOpened) autoOpened = false;
  }
  const ms0 = LP.windowStart(live.window) - now();
  if (ms0 > 0) startTimer = setTimeout(() => { syncAuto(); render(); scheduleEnd(); }, Math.min(ms0 + 200, 2147483000));
  scheduleEnd();
  render();
  return {
    setStep(key) { if (typeof key === 'string' && key !== stepKey) { stepKey = key; render(); syncAuto(); } },
    pinned() { autoOpened = false; },
    join,
    canJoin() { return DIRECT && phase() === 'open'; },
    phase,
    host: HOST,
    joinUrl: JOIN_URL,
    hasPolls: Object.values(live.activities || {}).some((l) => Array.isArray(l) && l.some((a) => a && a.kind === 'poll')),
    stop() {
      stopped = true; left = true; clearTimers(); clearTimeout(endTimer); clearTimeout(startTimer);
      if (ws) { const s = ws; ws = null; try { s.close(1000, 'bye'); } catch { /* gone */ } }
      for (const [t, n, f] of on) t.removeEventListener(n, f);
      el.polls.textContent = ''; el.polls.removeAttribute('data-sig');
    },
    state() { return { state: ST, reason: stopReason, code: lastCode, direct: DIRECT, joinLink: JOIN_URL, admitted, step: stepKey, attempt }; },
  };
}
