// 版の案内（#32）：公開のサイトは根に最新版を、/vX.Y.Z/ に各リリースの凍結した写しを置く（tools/site-versions.mjs が組む。docs/editor.md）。
//   凍結した写し（URL が …/vX.Y.Z/ か …/vX.Y.Z/index.html・editor.html）：上に「v0.4.2（凍結した版）を使っています」と最新版（根）へのリンク
//   根：はじめの画面の下に、この版の番号と、前の版の一覧（サイトの versions.json にあるもの）
// 編集アプリ（main.js）が組み込み、凍結した写しのうちこの部品を持たない古い版（v0.4.1・v0.4.2）には、組み立て（site-versions.mjs）が
// 根の version-notice.js（この部品だけを組んだもの）を読み込ませる。file:// とサイトの外（開発のサーバーなど、versions.json のないところ）では何も出さない
// どの版も同じサイト（origin）なので、最近開いたもの（IndexedDB）・言語（localStorage）・TTS のモデル（Cache Storage）は版のあいだで共有する
import { fetchBounded, READ_LIMITS } from './bounded-read.js';

export const MARK = 'egatari-version-ui';
const VER = /^v(\d+\.\d+\.\d+)$/;

// URL のパス → 凍結した写しの版（"0.4.2"）か null（根）
export function siteVersionOf(pathname) {
  const parts = String(pathname || '').split('/');
  const last = parts.pop();
  if (last !== '' && !/^(index|editor)\.html$/.test(last)) return null;
  const m = VER.exec(parts.pop() || '');
  return m ? m[1] : null;
}
// 版の並び（新しいものが先）
export const cmpVersion = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };

const TEXT = {
  en: {
    frozen: (v) => `You are using Egatari Studio v${v}, a frozen copy of that release.`,
    latest: (v) => (v ? `Open the latest version (v${v})` : 'Open the latest version'),
    isLatest: ' This is also the latest release.',
    close: 'Hide this notice',
    root: (v) => `Egatari Studio v${v}`,
    older: 'Other versions:', pick: 'Choose a version',
  },
  ja: {
    frozen: (v) => `Egatari Studio v${v}（そのリリースのまま凍結した写し）を使っています。`,
    latest: (v) => (v ? `最新版（v${v}）を開く` : '最新版を開く'),
    isLatest: 'これが最新のリリースでもあります。',
    close: 'この案内を隠す',
    root: (v) => `Egatari Studio v${v}`,
    older: 'ほかの版：', pick: '版を選ぶ',
  },
};
function langOf(lang) {
  if (lang === 'en' || lang === 'ja') return lang;
  try { const q = new URLSearchParams(location.search).get('lang'); if (q === 'en' || q === 'ja') return q; } catch { /* なし */ }
  try { const s = localStorage.getItem('motion-editor-lang'); if (s === 'en' || s === 'ja') return s; } catch { /* 使えない環境 */ }   // i18n.js の LANG_KEY（この部品は依存なしで組むので写す）
  return /^ja\b/i.test(navigator.language || '') ? 'ja' : 'en';
}
// サイトの versions.json：{root: "0.4.3", versions: ["0.4.3", "0.4.2", …]}（なければ null）
export async function readVersions(url) {
  try {
    const j = JSON.parse(new TextDecoder().decode(await fetchBounded(url, { max: READ_LIMITS.json, what: 'versions.json' })));
    const vs = Array.isArray(j.versions) ? j.versions.filter((v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v)).sort(cmpVersion) : [];
    return { root: typeof j.root === 'string' && /^\d+\.\d+\.\d+$/.test(j.root) ? j.root : null, versions: vs };
  } catch { return null; }
}
// 問い合わせ（?lang=en）は残し、# は落とす（# は開いたファイルの位置ではない）
const keepQuery = (href) => { const u = new URL(href, location.href); u.search = location.search; return u.href; };

function versionSelect(L, versions, current, base) {
  const sel = document.createElement('select');
  sel.id = 'version-pick';
  sel.setAttribute('aria-label', L.pick);
  for (const v of versions) {
    const o = document.createElement('option');
    o.value = v; o.textContent = 'v' + v; o.selected = v === current;
    sel.append(o);
  }
  sel.onchange = () => { if (sel.value !== current) location.href = keepQuery(new URL(`v${sel.value}/`, base).href); };
  return sel;
}

// version：この編集アプリの版（根で使う。凍結した写しでは URL の版）。lang：'ja' | 'en'（省けば ?lang・前に選んだもの・ブラウザ）
export async function mountVersionUi({ version = '', lang } = {}) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol) || document.documentElement.hasAttribute('data-' + MARK)) return;
  document.documentElement.setAttribute('data-' + MARK, '');
  const L = TEXT[langOf(lang)];
  const frozen = siteVersionOf(location.pathname);
  const base = new URL(frozen ? '../' : './', location.href).href;   // サイトの根
  const site = await readVersions(new URL('versions.json', base).href);
  if (!site) return;   // 版を並べたサイトではない（開発のサーバー・ほかの置き場所）
  if (frozen) {
    const bar = document.createElement('div');
    bar.id = 'version-note'; bar.setAttribute('role', 'note');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:5px 14px;font-size:13px;line-height:1.4;' +
      'background:var(--panel,#fff7e0);color:var(--fg,#222);border-bottom:1px solid var(--line,#d8c690)';
    const msg = document.createElement('span');
    msg.textContent = L.frozen(frozen) + (site.root === frozen ? L.isLatest : '');
    const a = document.createElement('a');
    a.id = 'version-latest'; a.href = keepQuery(base); a.textContent = L.latest(site.root);
    bar.append(msg, a);
    if (site.versions.length > 1) {
      const lab = document.createElement('span'); lab.textContent = L.older;
      bar.append(lab, versionSelect(L, site.versions, frozen, base));
    }
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '✕'; x.title = L.close; x.setAttribute('aria-label', L.close);
    x.style.cssText = 'margin-left:auto;border:0;background:none;color:inherit;cursor:pointer;font-size:13px';
    x.onclick = () => bar.remove();
    bar.append(x);
    document.body.prepend(bar);
    return;
  }
  // 根：はじめの画面の下に、版と前の版の一覧（凍結した写しが 1 つもなければ出さない）
  const w = document.getElementById('welcome');
  if (!w || !site.versions.length) return;
  const p = document.createElement('p');
  p.id = 'version-line'; p.className = 'note';
  p.append(document.createTextNode(L.root(version || site.root || '') + ' · ' + L.older + ' '));
  const list = site.versions.includes(version) ? site.versions : [version, ...site.versions].filter(Boolean);
  p.append(versionSelect(L, list, version, base));
  w.append(p);
}
