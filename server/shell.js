// 開発サーバーの外枠（server/dev.mjs が / で配るページ）。デッキは sandbox の iframe（/preview、origin を持たない）の中で動き、
// 編集の画面（server/editor-ui.js）と合言葉はこの外枠にだけある。デッキからは知らせ（server/hints.js）を受けるだけで、
// 読み書きはここが合言葉を付けて /__dev/ に頼む
import { createEditorUI } from './editor-ui.js';

const cfg = JSON.parse(document.getElementById('dev-cfg').textContent);
const TOKEN = cfg.token;
const frame = document.getElementById('deck');
const api = (method, url, body) => {
  const headers = { 'x-deck-token': TOKEN };
  if (body) headers['content-type'] = 'application/json';
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
    .then((r) => r.json().catch(() => ({})).then((j) => { j._status = r.status; return j; }));
};
let info = { warn: cfg.warn || [] };
const store = {
  get: (k) => JSON.parse(sessionStorage.getItem('dev:' + k) || 'null'),
  set: (k, v) => { if (v === null) sessionStorage.removeItem('dev:' + k); else sessionStorage.setItem('dev:' + k, JSON.stringify(v)); },
};
const ui = createEditorUI({
  frame: () => frame, api, lang: cfg.lang, drawerHost: document.getElementById('wrap'), store,
  modeHost: document.getElementById('dev-bar'),   // 今のモード（編集中・発表の道具）は下の帯に出す（舞台に重ねない）
  markLabel: cfg.lang === 'en' ? 'Editing — dev server' : '編集中 — 開発サーバー',
  warnings: () => info.warn, reload: () => load(true),
});
window.__DEV_UI = ui;   // 確かめ方（tools/test-dev-server.mjs）が状態を読む

// ---------------------------------------------------------------- デッキを読み込む（読み込み直すたびに _r を変える：同じ URL の # だけの移動にしない）
let n = 0;
function deckUrl(first) {
  const q = new URLSearchParams(location.search);
  q.set('cap', cfg.cap);              // 外枠ごとの /preview の印（server/dev.mjs。直接開いた最上位の文書にはデッキを出さない）
  if (!first) q.set('_r', String(++n));
  const s = q.toString();
  return '/preview' + (s ? '?' + s : '') + (first ? location.hash : '');
}
function load(keepPos) {
  ui.frameLoading(keepPos);
  frame.src = deckUrl(false);
}
const hs = parseInt((location.hash || '').slice(1), 10);
ui.restoreSaved(Number.isFinite(hs) ? hs - 1 : null);
frame.src = deckUrl(true);
window.__DEV_LOADS = 0;   // 確かめ方が読み込みを数える
frame.addEventListener('load', () => { window.__DEV_LOADS++; try { frame.focus(); } catch { /* 無視 */ } });

// 組み直されたら読み込み直す（Server-Sent Events。合言葉はこの外枠だけが持つ）
const es = new EventSource('/__dev/events?token=' + encodeURIComponent(TOKEN));
es.addEventListener('reload', () => {
  load(true);
  api('GET', '/__dev/info').then((j) => { if (j._status === 200) info = j; });
  if (pres && !pres.closed) pres.postMessage({ type: 'app-pres-reload' }, '*');
});

// ---------------------------------------------------------------- 発表者ビュー（外枠が開く窓。その中でもデッキは sandbox の iframe）
// デッキの p は入り切り（kit/deck.js の openPresenter と同じ）：開いていれば閉じて、フォーカスをプレビューに返す
let pres = null;
function togglePresenter() {
  if (pres && !pres.closed) { try { pres.close(); } catch { /* 無視 */ } pres = null; try { frame.focus(); } catch { /* 無視 */ } return; }
  pres = window.open('/?presenter=1', 'deck-presenter', 'width=1400,height=820');
}
window.addEventListener('message', (e) => {
  const m = e.data || {};
  if (e.source === frame.contentWindow) {
    if (ui.message(e)) { /* 知らせ・位置 */ }
    if (m.type === 'app-open-presenter') togglePresenter();
    if (typeof m.type === 'string' && /^deck-/.test(m.type) && pres && !pres.closed) pres.postMessage({ type: 'app-pres-down', m }, '*');
  } else if (pres && e.source === pres && m.type === 'app-pres-up' && m.m && typeof m.m.type === 'string' && /^deck-/.test(m.m.type)) {
    frame.contentWindow && frame.contentWindow.postMessage(m.m, '*');
  }
});
