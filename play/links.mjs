// Egatari Viewer: links the lesson asks the page to open (format spec §11: "Hosts that play lessons apply the same rule to links
// the lesson asks them to open"). The rule is the player's own, kit/core/link-policy.mjs (DECK.LinkPolicy on main).
// The box is in the page's chrome, outside the lesson's frame, so the lesson cannot draw over it or press it.
// Opening is always an ordinary <a target="_blank" rel="noopener noreferrer"> that the viewer taps in this page: the page never
// opens anything on a message alone (spec §9.4 openLink), and Safari would not open a tab without a fresh tap here anyway.
// A host already agreed to (plain https:, in memory for this viewing session, §11 (f)) gets a plain box: the host name and an
// 「開く」 button, without the warning (on such platforms, one tap without the warning counts as not asking again).
//
//   const LB = linkBox({words, dialog elements})  → {request({href, text}), hosts}
import { LinkPolicy } from '../kit/core/link-policy.mjs';

export const LP = LinkPolicy();
const ABS = /^[a-z][a-z0-9+.-]*:/i;

// The lesson's href as written: absolute, protocol-relative (//host) or relative. A srcdoc lesson's relative links would resolve
// against this page's address, so they are not resolved here: a file next to the lesson is not reachable from this page.
export function decideLink(link, hosts) {
  const raw = String(link.href == null ? '' : link.href).trim();
  if (raw && !ABS.test(raw) && !raw.startsWith('//')) return { verdict: 'refuse', reason: 'relative' };
  if (link.download === true) {   // the lesson's frame has no allow-downloads: saving a file from the lesson is refused (§9.4 download)
    const u = (() => { try { return new URL(raw.startsWith('//') ? 'https:' + raw : raw); } catch { return null; } })();
    return { verdict: 'refuse', reason: 'download', host: u && /^https?:$/.test(u.protocol) ? u.hostname : '' };
  }
  const href = raw.startsWith('//') ? 'https:' + raw : raw;
  return LP.decide({ href, text: link.text, download: false }, { hosts });
}

export function linkBox({ words, dlg }) {
  const hosts = new Set();
  let from = null;
  const W = () => words();
  function close() { if (dlg.box.open) dlg.box.close(); }
  dlg.cancel.addEventListener('click', close);
  dlg.box.addEventListener('close', () => { if (from && from.isConnected) try { from.focus({ preventScroll: true }); } catch { /* gone */ } from = null; });
  dlg.box.addEventListener('click', (e) => { if (e.target === dlg.box) close(); });
  let current = null;
  dlg.open.addEventListener('click', () => { if (current) LP.remember(hosts, current); setTimeout(close, 0); });
  function show(title, host, url, notes, open, openLabel) {
    const S = W();
    dlg.title.textContent = title;
    dlg.host.textContent = host; dlg.host.hidden = !host;
    dlg.url.textContent = url; dlg.url.hidden = !url;
    dlg.notes.textContent = '';
    for (const n of notes) { const li = document.createElement('li'); li.textContent = n; dlg.notes.appendChild(li); }
    dlg.cancel.textContent = open ? S.linkCancel : S.linkClose;
    dlg.open.hidden = !open;
    if (open) { dlg.open.href = open; dlg.open.textContent = openLabel || S.linkOpen; } else dlg.open.removeAttribute('href');
    from = document.activeElement;
    dlg.box.showModal();
    dlg.cancel.focus();   // the default is Cancel (Enter or Space pressed once too often does not open)
  }
  // a lesson cannot keep the box up: one box at a time, and a pause after each in which requests are ignored
  // (time for the viewer to reach 「閉じる」 in the bar)
  const PAUSE_MS = 1500;
  let quietUntil = 0;
  // the open attribute, not the close event: some browsers deliver close late (headless Chromium), which would pause the wrong request
  let wasOpen = false;
  new MutationObserver(() => { const o = dlg.box.open; if (wasOpen && !o) quietUntil = Date.now() + PAUSE_MS; wasOpen = o; }).observe(dlg.box, { attributes: true, attributeFilter: ['open'] });
  function request(link) {
    if (dlg.box.open || Date.now() < quietUntil) return { shown: false, verdict: 'busy' };
    const S = W();
    const d = decideLink(link, hosts);
    current = null;
    if (d.verdict === 'refuse') {
      if (d.reason === 'download') { show(S.linkNoSave, d.host, '', [], null); return { shown: true, verdict: 'refuse', reason: 'download' }; }
      const note = d.reason === 'relative' ? S.linkRelative : d.reason === 'scheme' ? S.linkScheme : S.linkInvalid;
      show(S.linkCannot, '', String(link.href || '').slice(0, 300), [note], null);
      return { shown: true, verdict: 'refuse', reason: d.reason };
    }
    if (d.verdict === 'open') {   // remembered: the host and 「開く」 only
      show(d.host, '', '', [], d.url, S.linkOpenPlain);
      return { shown: true, verdict: 'open', url: d.url };
    }
    current = d;
    show(d.must ? S.linkCheck : S.linkLeave, d.host || d.scheme + ':', d.url, (d.reasons || []).map((r) => S.why[r] || r), d.url);
    return { shown: true, verdict: d.verdict, url: d.url, must: !!d.must };
  }
  return { request, hosts, close, quietMs: () => Math.max(0, quietUntil - Date.now()) };
}
