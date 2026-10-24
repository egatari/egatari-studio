// テーマを変更…（スライド ▾）：開いたデッキのテーマ（原稿の <html data-theme>）を後から替える
// 書き換えるのは原稿の <html> の data-theme（ほかの属性は data-egatari-seed も含めてそのまま。スライドには触らない）と、
// 設定のファイル（egatari.json）の themes（kit/core/config-file.mjs の updateConfig を通る。ほかの項目はバイトのまま）だけ。
// 流れはスライド一覧の操作と同じ（app/slides-panel.js の apply）：書く前に控え、組み直し、保存していない変更（●）になり、「元に戻す」で戻る。
// 版の固定：新しいテーマはその今の版（同梱のテーマは themes.lock.json の current、ほかは theme.json の version か "local"。1 ファイルの書き出しと同じ）。
// 新しいテーマが土台にするテーマ（extends）も、前の版に固定されていても今の版にする（変えるのは利用者が選んだときだけなので、新しいテーマの今の見た目にする）。
// 前のテーマ（と土台）で新しいテーマが使わないものは固定を外す。
// 開いた 1 ファイルが記録した版（P.themePins・P.index.themes。プレビューと段 B の保存が使う）も同じに替え、元に戻すときは戻す
//
//   themeOf(src)              原稿の <html> の data-theme（なければ 'default'）
//   withTheme(src, name)      <html> の data-theme だけを name にした原稿
//   createThemeSwitch(ctx)    ctx = {T, el, ask, close(id)（窓を閉じる）, toast, apply(fn)（スライド一覧の apply）, at()（今の枚）, ws(), deckFile(), portable(),
//                                    themeOptions()（新規作成の ③ と同じ一覧。自分のテーマは user: true）, loadOtherTheme()（「テーマを読み込む」の窓。読み込んだら true）,
//                                    userThemes()（組み立てに渡す自分のテーマの作業場所：テーマのフォルダとこのブラウザに保存したテーマ（app/my-themes.js の mergedThemeWorkspace）か null）,
//                                    bundled(path)（同梱のファイルの文字列か null）, why()（変えられない理由か null）}
//                             → {open(), why()}
import { configObject, updateConfig, merge as configMerge } from '../kit/core/config-file.mjs';
import { parseThemesLock, currentThemeVersion } from '../kit/core/themes-lock.mjs';
import { VERSION_RE } from '../kit/core/components-lock.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HTML_TAG = /<html\b[^>]*>/i;
const ATTR = /(\sdata-theme\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)/i;

export function themeOf(src) {
  const m = HTML_TAG.exec(src || '');
  const a = m && ATTR.exec(m[0]);
  const v = a ? a[2].replace(/^["']|["']$/g, '') : '';
  return v || 'default';
}
export function withTheme(src, name) {
  if (!NAME_RE.test(name)) throw new Error('bad theme name: ' + name);
  const m = HTML_TAG.exec(src);
  if (!m) throw new Error('no <html> element');
  const tag = m[0];
  const next = ATTR.test(tag) ? tag.replace(ATTR, (_, pre) => `${pre}"${name}"`) : tag.replace(/\s*(\/?)>$/, (x, sl) => ` data-theme="${name}"${sl}>`);
  return src.slice(0, m.index) + next + src.slice(m.index + tag.length);
}

// テーマの色見本：tokens.css の --base と --emph（色の直書き、なければ --emph-hue から default と同じ式）。どちらもなければ土台のテーマ
const HEX = '(#[0-9A-Fa-f]{3,8})\\b';
function tokenColors(css) {
  const out = {};
  const b = new RegExp('--base\\s*:\\s*' + HEX).exec(css);
  if (b) out.base = b[1];
  const e = new RegExp('--emph\\s*:\\s*(?:var\\(--emph-from-hue\\s*,\\s*)?' + HEX).exec(css);
  const h = /--emph-hue\s*:\s*(-?\d+(?:\.\d+)?)\s*;/.exec(css);
  if (h) out.emph = `oklch(0.52 0.21 ${h[1]})`;
  else if (e) out.emph = e[1];
  return out;
}

export function createThemeSwitch(ctx) {
  const { T, el } = ctx;
  let lock = null;
  try { const t = ctx.bundled('/repo/themes.lock.json'); lock = t ? parseThemesLock(t) : null; } catch { lock = null; }

  // 自分のテーマの作業場所の一覧（フォルダをたどるので、窓を出す間・1 回の変更の間は 1 回だけ読む。fresh() で読み直す）
  let userList = null;
  const fresh = () => { userList = null; };
  async function userTheme(name, file) {
    const u = ctx.userThemes();
    if (!u) return null;
    try {
      if (!userList) userList = u.list().then((L) => ({ ws: u, L }));
      const { ws, L } = await userList;
      if (!L.files.has(`${name}/tokens.css`)) return null;
      let text = null;
      try { text = L.files.has(`${name}/${file}`) ? new TextDecoder().decode(await ws.readBytes(`${name}/${file}`, { max: READ_LIMITS.json })) : null; } catch { text = null; }
      return { where: 'user', text };
    } catch { userList = null; return null; }
  }
  // テーマを探す（組み立てと同じ順：原稿のフォルダ → その themes/ → 自分のテーマ（フォルダ・このブラウザに保存したテーマ。組み立てと同じ作業場所）→ 同梱）。読めたファイルの文字列を返す
  async function themeFile(name, file) {
    const ws = ctx.ws(), deckDir = (ctx.deckFile() || '').split('/').slice(0, -1).join('/');
    const pre = deckDir ? deckDir + '/' : '';
    for (const rel of [`${pre}${name}/${file}`, `${pre}themes/${name}/${file}`]) {
      try { if (ws && (await ws.exists(`${rel.slice(0, -file.length)}tokens.css`))) return { where: 'deck', text: await ws.readText(rel, { max: READ_LIMITS.json }) }; } catch { /* 次へ */ }
    }
    const u = await userTheme(name, file);
    if (u) return u;
    const b = ctx.bundled(`/repo/themes/${name}/tokens.css`);
    if (b !== null) return { where: 'bundled', text: file === 'tokens.css' ? b : ctx.bundled(`/repo/themes/${name}/${file}`) };
    return null;
  }
  // テーマとその土台（extends）：[{name, where, version}]。見つからないテーマは where: null（版を固定しない）
  async function chain(name) {
    const out = [];
    for (let n = name, depth = 0; n && depth < 4 && !out.some((x) => x.name === n); depth++) {
      const f = await themeFile(n, 'theme.json');
      let j = null;
      try { j = f && f.text ? JSON.parse(f.text) : null; } catch { j = null; }
      const own = j && typeof j.version === 'string' && VERSION_RE.test(j.version) ? j.version : null;
      const where = f ? f.where : null;
      out.push({ name: n, where, version: where === 'bundled' && lock && currentThemeVersion(lock, n) ? currentThemeVersion(lock, n) : where ? own || 'local' : null });
      n = j && typeof j.extends === 'string' && NAME_RE.test(j.extends) ? j.extends : null;
    }
    return out;
  }
  async function colors(name) {
    const out = {};
    for (const t of await chain(name)) {
      const f = await themeFile(t.name, 'tokens.css');
      const c = f && f.text ? tokenColors(f.text) : {};
      if (!out.base && c.base) out.base = c.base;
      if (!out.emph && c.emph) out.emph = c.emph;
      if (out.base && out.emph) break;
    }
    return out;
  }
  function swatch(c) {
    const e = el('span', { cls: 'swatch', 'aria-hidden': 'true' });
    if (c && (/^#[0-9A-Fa-f]{3,8}$/.test(c) || /^oklch\([\d. -]+\)$/.test(c))) e.style.backgroundColor = c;
    return e;
  }

  const why = () => ctx.why();
  // 選ぶ窓：見せる名前の一覧（今のテーマに印。自分のテーマは「自分のテーマ」の見出しの下。新規作成の ③ と同じ）と「テーマを読み込む…」
  // （読み込みの窓。読み込んだら一覧を作り直す）。戻り値：選んだテーマの名前か null
  async function choose(current) {
    for (;;) {
      fresh();
      const opts = (await ctx.themeOptions()).slice();
      if (!opts.some((o) => o.value === current)) opts.push({ value: current, label: current });
      let picked = current;
      const rows = [];
      let mineHead = false;
      for (const o of opts) {
        if (o.user && !mineHead) { mineHead = true; rows.push(el('p', { cls: 'theme-group hint', id: 'theme-switch-mine', text: T.themeMineGroup })); }
        const id = 'theme-opt-' + o.value;
        const c = await colors(o.value).catch(() => ({}));
        const input = el('input', { type: 'radio', name: 'theme-switch', id, value: o.value, ...(o.value === current ? { checked: '' } : {}), ...(NAME_RE.test(o.value) ? {} : { disabled: '' }) });
        input.addEventListener('change', () => { if (input.checked) picked = o.value; });
        rows.push(el('label', { cls: 'theme-opt', for: id }, [input, swatch(c.base), swatch(c.emph),
          el('span', { text: o.label }), ...(o.value === current ? [el('span', { cls: 'hint', text: ' ' + T.themeSwitchNow })] : [])]));
      }
      const load = el('button', { type: 'button', id: 'theme-switch-load', text: T.themeLoad, onclick: () => ctx.close('load') });
      const v = await ctx.ask({ title: T.themeSwitchTitle, body: [
        el('p', { id: 'theme-switch-lead', text: T.themeSwitchLead }),
        el('div', { id: 'theme-switch-list', role: 'radiogroup', 'aria-label': T.themeSwitchTitle }, rows),
        el('p', {}, [load])],
      buttons: [{ id: 'cancel', label: T.themeSwitchCancel }, { id: 'change', label: T.themeSwitchGo, pri: true }] });
      if (v === 'load') { await ctx.loadOtherTheme(); continue; }
      if (v !== 'change') return null;
      return picked;
    }
  }
  const labelOf = async (name) => ((await ctx.themeOptions()).find((o) => o.value === name) || { label: name }).label;

  async function open() {
    const w = why();
    if (w) { ctx.toast(w, true); return false; }
    const ws = ctx.ws(), file = ctx.deckFile();
    let current = 'default';
    try { current = themeOf(await ws.readText(file, { max: READ_LIMITS.source })); } catch { /* 下の操作が読み直す */ }
    const to = await choose(current);
    if (!to || to === current) return false;
    const fromLabel = await labelOf(current), toLabel = await labelOf(to);
    const at = ctx.at();
    return ctx.apply(async (b) => {
      fresh();
      const from = themeOf(b.deck);
      if (from === to) return null;
      const deck = withTheme(b.deck, to);
      const conf = configObject(b.cfg);   // 読めない設定のファイルは上書きせずに断る（code 'bad-config'）
      const raw = conf.themes && typeof conf.themes === 'object' && !Array.isArray(conf.themes) ? conf.themes : {};
      const P = ctx.portable();
      const oldChain = await chain(from), newChain = await chain(to);
      const keep = new Set(newChain.map((t) => t.name));
      const patch = {}, drop = [];
      for (const t of oldChain) if (!keep.has(t.name)) { drop.push(t.name); if (Object.prototype.hasOwnProperty.call(raw, t.name)) patch[t.name] = undefined; }
      newChain.forEach((t) => {
        if (!t.version) return;
        if (raw[t.name] !== t.version) patch[t.name] = t.version;
      });
      const cfg = Object.keys(patch).length ? updateConfig(b.cfg, { themes: configMerge(patch) }) : undefined;
      // 開いた 1 ファイル：記録した版（プレビューと段 B の保存が使う）からも、外したテーマと新しいテーマ（と土台）を除く（設定のファイルの今の版で組む）
      let applied, revert;
      if (P) {
        const pins0 = P.themePins, index0 = P.index;
        const gone = new Set([...drop, ...newChain.map((t) => t.name)]);
        applied = () => {
          const pins = Object.fromEntries(Object.entries(P.themePins || {}).filter(([k]) => !gone.has(k)));
          P.themePins = Object.keys(pins).length ? pins : null;
          if (Array.isArray(P.index.themes)) P.index = { ...P.index, themes: P.index.themes.filter((t) => !gone.has(t.name)) };
        };
        revert = () => { P.themePins = pins0; P.index = index0; };
      }
      return { deck, narr: b.narr, man: b.man, cfg, at, undoAt: at, label: T.themeSwitchUndo(fromLabel, toLabel), done: T.themeSwitchDone(fromLabel, toLabel), applied, revert };
    });
  }
  return { open, why };
}
