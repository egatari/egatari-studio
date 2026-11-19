// テーマを作る画面（新規作成の ③ で「オリジナル」を選ぶと開く。#58・handoff/theme-builder-v2-2026-10-27.md の第 1 段：表示の試作）。
// 既定の入力は基調色 1 つ（ロゴの画像から拾うこともできる）とフォントだけ。ほかの色は基調色から導く（kit/core/theme-derive.mjs）。
// 色は裏で確かめ、通らないものがあるときだけ、何が・どれだけ・どう直すかと「#…… にする」（通るいちばん近い色）を出す。
// 「詳しく」（たたむ）：導いた色を替える・基調色から決め直す・表紙の背景画像（data: URI で tokens.css に入る。テーマの hash と 1 ファイルに入る。#171(b)）。
// プレビュー：表紙と本文の 2 枚。組み込みの体裁（kit/layouts.css）と default の tokens.css に、作ったテーマの tokens.css を重ねて、影の木（shadow DOM）の中に描く
// （編集アプリの決まりは iframe を許さない。部品・KaTeX・字は入れない。フォントはこの端末にあるもので出る）。
// 「テーマを保存」：自分のテーマ（このブラウザ。app/my-themes.js、source: 'builder'）に入れ、この教材のテーマにする。「ZIP ファイルでダウンロード」：<名前>/tokens.css・theme.json
//
//   createThemeWorkshop({el, lang, bundled(path) → 文字列 | null, myThemeFiles(name) → Map | null, save(name, files) → Promise<{replaced}>,
//                        toast(msg, bad), download(name, bytes, type), onSaved(name)}) → {node, open(fromTheme), close(), isOpen(), saved, words}
import { deriveTheme, checkInput, fixFor, pickColours, themeFiles, readBuilder, startFrom, fontStack, FONT_CHOICES, EDITABLE, isHex, normHex } from '../kit/core/theme-derive.mjs';
import { writeZip } from '../kit/core/zip-write.mjs';
import { readFileBounded } from './bounded-read.js';

const MiB = 1048576;
export const COVER_MAX = MiB;   // 表紙の背景画像の上限（テーマに入るので小さく）
const LOGO_MAX = 4 * MiB;      // ロゴ（色を拾うだけで、テーマには入れない。テーマの ZIP ファイルのロゴの上限と同じ）
const COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const TX = {
  ja: {
    original: 'オリジナル',
    head: 'オリジナルのテーマ',
    lead: '基調色とフォントを選びます。ほかの色は、基調色から自動で作ります',
    base: '基調色', baseHex: '基調色（16 進数）',
    logo: 'ロゴから色を取得…', logoColours: 'ロゴの色（押すと基調色にします）', logoUse: (h) => `${h} を基調色にする`,
    logoNone: 'ロゴから色を拾えませんでした（白・黒・灰色だけの画像です）。基調色を選んでください',
    imageBroken: (n) => `画像を読めませんでした：${n}。PNG・JPEG・WebP・SVG の画像を選んでください`,
    logoTooLarge: (sz) => `画像が大きすぎます（${sz}。4 MB まで）。小さくしてから選んでください`,
    font: 'フォント', fontGroup: { ja: '日本語', en: '欧文' },
    previewCover: 'プレビュー：表紙', previewBody: 'プレビュー：本文', previewNote: 'プレビューは、この端末にあるフォントで出します',
    checksHead: (n) => `色を直したほうがよい所があります（${n} 件）`,
    use: (h) => `${h} にする`, useLabel: (name, h) => `${name}を ${h} にする`,
    name: { base: '基調色', term: '用語の色', title: '見出しの色', accent2: '補色', emph: '結論の色', 'base-tint': '淡い色', 'base-wash': 'ごく淡い色', cover: '表紙の背景画像' },
    who: { normal: 'だれにとっても', protan: '1 型色覚の人には', deutan: '2 型色覚の人には', tritan: '3 型色覚の人には' },
    msg: {
      text: (n, v) => `${n}の文字が白い地の上で読みにくい色です（コントラスト比 ${v}:1。4.5:1 以上が必要です）。${n}を濃くしてください`,
      sec: (v) => `章の扉の白い文字が、基調色の地の上で読みにくくなります（コントラスト比 ${v}:1。4.5:1 以上が必要です）。基調色を濃くしてください`,
      concl: (v) => `結論の行の文字が、灰色の地の上で読みにくくなります（コントラスト比 ${v}:1。4.5:1 以上が必要です）。結論の色を濃くしてください`,
      cover: (v) => `表紙のタイトルが背景画像の上で読みにくくなります（コントラスト比 ${v}:1。4.5:1 以上が必要です）。明るい画像にするか、画像を外してください`,
      cvd: (who, v, need, n) => `用語の色と結論の色が、${who}見分けにくくなります（色差 ${v}。${need} 以上が必要です）。${n}の色合いを変えてください`,
      redHue: '基調色が結論の赤に近い色合いで、結論が目立たなくなります。基調色を赤から離してください',
      grey: (n, v) => `白黒で印刷すると、用語の文字と本文の黒い文字が同じに見えます（明るさの差 ${v}。8 以上が必要です）。${n}を明るくしてください`,
      washout: (n, v) => `明るい場所で投影して画面が白っぽく見えるとき、${n}の文字が読みにくくなります（コントラスト比 ${v}:1。3:1 以上が必要です）。${n}を濃くしてください`,
    },
    more: '詳しく', hexOf: (n) => `${n}（16 進数）`, reset: '基調色から決め直す',
    cover: '表紙の背景画像', coverPick: '画像を選ぶ…', coverRemove: '外す', coverNone: 'なし', coverNote: 'PNG・JPEG・WebP、1 MB まで。画像はテーマに入ります',
    coverTooLarge: (s) => `画像が大きすぎます（${s}。1 MB まで）。小さくしてから選んでください`, coverType: 'PNG・JPEG・WebP の画像を選んでください',
    themeName: 'テーマの名前', themeNamePh: '例：理科',
    save: 'テーマを保存', zip: 'ZIP ファイルでダウンロード',
    saveNote: '保存すると「自分のテーマ」に入り、この教材に使います。保存するまで次へは進めません', nameNeeded: 'テーマの名前を入力してください',
    saved: (t) => `テーマを保存しました：${t}`, replaced: '（同じ名前のテーマを置き換えました）', saveFailed: 'テーマを保存できませんでした。このブラウザの保存領域を使えないときは「ZIP ファイルでダウンロード」を使ってください',
    sample: { venue: '小学 6 年 理科', title: 'てこのはたらき', au: '6 年 2 組', h2: 'てこの 3 つの点', items: [['支点', '：棒を支える点'], ['力点', '：力を加える点'], ['作用点', '：ものに力がはたらく点']], concl: '支点から力点が遠いほど、小さな力で持ち上がる' },
  },
  en: {
    original: 'Custom',
    head: 'Custom theme',
    lead: 'Choose a main colour and a font. The other colours are made from the main colour automatically',
    base: 'Main colour', baseHex: 'Main colour (hex)',
    logo: 'Pick colours from a logo…', logoColours: 'Colours in the logo (press one to use it as the main colour)', logoUse: (h) => `Use ${h} as the main colour`,
    logoNone: 'No colours could be picked from the logo (it has only white, black or grey). Choose the main colour yourself',
    imageBroken: (n) => `Could not read the image: ${n}. Choose a PNG, JPEG, WebP or SVG image`,
    logoTooLarge: (sz) => `The image is too large (${sz}; up to 4 MB). Make it smaller and choose it again`,
    font: 'Font', fontGroup: { ja: 'Japanese', en: 'Latin script' },
    previewCover: 'Preview: cover', previewBody: 'Preview: body', previewNote: 'The preview uses the fonts on this device',
    checksHead: (n) => `Some colours should be changed (${n})`,
    use: (h) => `Use ${h}`, useLabel: (name, h) => `Set the ${name} to ${h}`,
    name: { base: 'main colour', term: 'term colour', title: 'heading colour', accent2: 'complementary colour', emph: 'conclusion colour', 'base-tint': 'light tint', 'base-wash': 'lightest tint', cover: 'cover background image' },
    who: { normal: 'for anyone', protan: 'for people with protan colour vision', deutan: 'for people with deutan colour vision', tritan: 'for people with tritan colour vision' },
    msg: {
      text: (n, v) => `Text in the ${n} is hard to read on white (contrast ratio ${v}:1; 4.5:1 or more is needed). Make the ${n} darker`,
      sec: (v) => `White text on section dividers is hard to read on the main colour (contrast ratio ${v}:1; 4.5:1 or more is needed). Make the main colour darker`,
      concl: (v) => `The conclusion line is hard to read on its grey background (contrast ratio ${v}:1; 4.5:1 or more is needed). Make the conclusion colour darker`,
      cover: (v) => `The title on the cover is hard to read over the background image (contrast ratio ${v}:1; 4.5:1 or more is needed). Use a lighter image or remove it`,
      cvd: (who, v, need, n) => `The term colour and the conclusion colour are hard to tell apart ${who} (colour difference ${v}; ${need} or more is needed). Change the hue of the ${n}`,
      redHue: 'The main colour is close to the red used for conclusions, so conclusions stop standing out. Move the main colour away from red',
      grey: (n, v) => `Printed in black and white, terms look the same as the black body text (lightness difference ${v}; 8 or more is needed). Make the ${n} lighter`,
      washout: (n, v) => `When the projected screen looks washed out in bright light, text in the ${n} is hard to read (contrast ratio ${v}:1; 3:1 or more is needed). Make the ${n} darker`,
    },
    more: 'More', hexOf: (n) => `${n} (hex)`, reset: 'Work out from the main colour again',
    cover: 'Cover background image', coverPick: 'Choose image…', coverRemove: 'Remove', coverNone: 'None', coverNote: 'PNG, JPEG or WebP, up to 1 MB. The image becomes part of the theme',
    coverTooLarge: (s) => `The image is too large (${s}; up to 1 MB). Make it smaller and choose it again`, coverType: 'Choose a PNG, JPEG or WebP image',
    themeName: 'Theme name', themeNamePh: 'e.g. Science',
    save: 'Save theme', zip: 'Download as ZIP file',
    saveNote: 'The saved theme goes into My themes and is used for this lesson. Save it to go on to the next step', nameNeeded: 'Enter a name for the theme',
    saved: (t) => `Saved the theme: ${t}`, replaced: ' (replaced the theme with the same name)', saveFailed: 'Could not save the theme. If this browser cannot store it, use “Download as ZIP file”',
    sample: { venue: 'Year 6 science', title: 'How levers work', au: 'Class 6B', h2: 'The three points of a lever', items: [['Fulcrum', ': where the bar rests'], ['Effort', ': where you push'], ['Load', ': where the bar pushes the object']], concl: 'Push far from the fulcrum and you need less force' },
  },
};
export const workshopWords = (lang) => (lang === 'en' ? TX.en : TX.ja);

// 見せる数：コントラスト比は小数 1 桁に切り捨て（4.48 を 4.5 と見せない）、色差は整数
const ratio = (v) => (Math.floor(v * 10) / 10).toFixed(1);
const whole = (v) => String(Math.floor(v));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const kb = (n) => (n >= MiB ? `${(n / MiB).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
// テーマの名前（フォルダの名前。RE.registryName：英小文字で始まる英小文字・数字・-）：見せる名前から。英字がなければ見せる名前の hash
export function themeNameOf(title) {
  const s = String(title).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  if (s.length >= 3) return s;
  let h = 0x811c9dc5;
  for (const ch of String(title)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return 'theme-' + h.toString(16).padStart(8, '0').slice(0, 6);
}
// 画像を読む（blob の URL。編集アプリの決まりは img-src blob: を許す）→ canvas（長い辺 size まで）の ImageData
async function imageData(file, size) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('image')); img.src = url; });
    const k = Math.min(1, size / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || size) * k)), h = Math.max(1, Math.round((img.naturalHeight || size) * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  } finally { URL.revokeObjectURL(url); }
}
// 表紙の背景画像の平均の色（地の白の上に重ねた色。タイトルの下の帯 y 25〜50% を数える）
function averageColour(d) {
  let r = 0, g = 0, b = 0, n = 0;
  const y0 = Math.floor(d.height * 0.25), y1 = Math.max(y0 + 1, Math.ceil(d.height * 0.5));
  for (let y = y0; y < y1; y++) for (let x = 0; x < d.width; x++) {
    const i = (y * d.width + x) * 4, a = d.data[i + 3] / 255;
    r += d.data[i] * a + 255 * (1 - a); g += d.data[i + 1] * a + 255 * (1 - a); b += d.data[i + 2] * a + 255 * (1 - a); n++;
  }
  const hex = (v) => ('0' + Math.round(v / n).toString(16)).slice(-2);
  return n ? ('#' + hex(r) + hex(g) + hex(b)).toUpperCase() : null;
}
// 選んだ画像（信頼しない）は上限つきの読み取りの口で読み、data: URI にする
async function readDataUrl(file, max) {
  const b = await readFileBounded(file, { max, what: file.name });
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return `data:${file.type};base64,${btoa(bin)}`;
}

export function createThemeWorkshop(app) {
  const { el, bundled } = app;
  const L = app.lang === 'en' ? 'en' : 'ja';
  const X = TX[L];
  const fallbackFont = FONT_CHOICES.find((f) => f.group === L && f.default) || FONT_CHOICES[0];
  const S = { base: '#1D4F91', font: fallbackFont.family, overrides: {}, cover: '', coverBg: null, logo: null, open: false };
  const input = () => ({ base: S.base, font: S.font, overrides: { ...S.overrides } });

  // ---------------------------------------------------------------- 基調色・ロゴ・フォント
  const baseIn = el('input', { type: 'color', id: 'shop-base', value: S.base.toLowerCase() });
  const baseHex = el('input', { type: 'text', id: 'shop-base-hex', 'aria-label': X.baseHex, maxlength: '7', spellcheck: 'false', autocomplete: 'off', inputmode: 'text' });
  baseIn.addEventListener('input', () => setBase(baseIn.value));
  baseHex.addEventListener('input', () => { const ok = isHex(baseHex.value); baseHex.toggleAttribute('aria-invalid', !ok); if (ok) setBase(baseHex.value, true); });
  const logoFile = el('input', { type: 'file', id: 'shop-logo-file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', 'aria-label': X.logo, hidden: '' });
  const logoBtn = el('button', { type: 'button', id: 'shop-logo', text: X.logo, onclick: () => logoFile.click() });
  const logoOut = el('div', { id: 'shop-logo-colours', cls: 'shop-swatches', role: 'group', 'aria-label': X.logoColours, hidden: '' });
  const logoNote = el('p', { id: 'shop-logo-note', cls: 'hint', role: 'status', hidden: '' });
  logoFile.addEventListener('change', async () => {
    const f = logoFile.files && logoFile.files[0];
    logoFile.value = '';
    if (!f) return;
    if (f.size > LOGO_MAX) { app.toast(X.logoTooLarge(kb(f.size)), true); return; }
    let cols = [];
    try { cols = pickColours((await imageData(f, 96)).data); } catch { app.toast(X.imageBroken(f.name), true); return; }
    logoOut.replaceChildren(...cols.map((h) => el('button', { type: 'button', cls: 'shop-swatch', 'data-hex': h, 'aria-label': X.logoUse(h), title: X.logoUse(h), onclick: () => setBase(h) },
      [el('span', { cls: 'chip', style: `background:${h}` }), h])));
    logoOut.hidden = !cols.length;
    logoNote.textContent = cols.length ? '' : X.logoNone;
    logoNote.hidden = !!cols.length;
  });
  const fontSel = el('select', { id: 'shop-font' }, ['ja', 'en'].map((g) => el('optgroup', { label: X.fontGroup[g] },
    FONT_CHOICES.filter((f) => f.group === g).map((f) => el('option', { value: f.family, text: f.family })))));
  fontSel.addEventListener('change', () => { S.font = fontSel.value; render(); });

  // ---------------------------------------------------------------- プレビュー（影の木）
  const slideHost = (label) => {
    const host = el('div', { cls: 'shop-slide', role: 'img', 'aria-label': label });
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'), stage = document.createElement('div');
    stage.className = 'stage';
    root.append(style, stage);
    return { host, style, stage };
  };
  const pvCover = slideHost(X.previewCover), pvBody = slideHost(X.previewBody);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sm = X.sample;
  pvCover.stage.innerHTML = `<section class="slide cover"><p class="venue">${esc(sm.venue)}</p><h1>${esc(sm.title)}</h1><p class="au">${esc(sm.au)}</p></section>`;
  pvBody.stage.innerHTML = `<section class="slide"><h2>${esc(sm.h2)}</h2><div class="body"><div class="cols"><ul>${sm.items.map(([t, d]) => `<li><span class="term">${esc(t)}</span>${esc(d)}</li>`).join('')}</ul>`
    + '<div class="fig"><svg viewBox="0 0 300 200" aria-hidden="true"><path d="M20 180h260" stroke="var(--line)" stroke-width="2"/>'
    + [1, 2, 3, 4].map((k, i) => `<rect x="${36 + i * 62}" y="${180 - [90, 150, 120, 60][i]}" width="44" height="${[90, 150, 120, 60][i]}" fill="var(--series-${k})"/>`).join('')
    + `</svg></div></div></div><div class="concl"><span>${esc(sm.concl)}</span></div></section>`;
  const host = (css) => String(css || '').replace(/:root\b/g, ':host');
  const FRAME = ':host{display:block;--s:.25}.stage{position:absolute;left:0;top:0;width:1280px;height:720px;transform-origin:0 0;transform:scale(var(--s));font-family:var(--font-sans);color:var(--fg)}'
    + '.slide{position:absolute;inset:0;width:1280px;height:720px;background:var(--bg);overflow:hidden;box-sizing:border-box}*,*::before,*::after{box-sizing:border-box}';
  const baseCss = () => [host(bundled('/repo/kit/layouts.css')), host(bundled('/repo/themes/default/tokens.css'))].join('\n');
  // 縮める倍率：枠の幅 / 1280（隠れている間の幅 0 は使わない。開いたときは render が測る）
  const scaleTo = (h, w) => { if (w > 0) h.style.setProperty('--s', String(w / 1280)); };
  const fit = new ResizeObserver((es) => { for (const e of es) scaleTo(e.target, e.contentRect.width); });
  fit.observe(pvCover.host); fit.observe(pvBody.host);

  // ---------------------------------------------------------------- 確かめた結果（通らないものがあるときだけ）
  const checks = el('div', { id: 'shop-checks', cls: 'shop-checks', role: 'status', 'aria-live': 'polite' });
  const message = (c) => {
    const n = X.name[c.token] || X.name.base, M = X.msg;
    switch (c.id) {
      case 'term-contrast': return M.text(c.token === 'base' ? X.name.base : X.name.term, ratio(c.value));
      case 'title-contrast': return M.text(c.token === 'base' ? X.name.base : X.name.title, ratio(c.value));
      case 'accent2-contrast': return M.text(c.token === 'base' ? X.name.base : X.name.accent2, ratio(c.value));
      case 'emph-contrast': return M.text(X.name.emph, ratio(c.value));
      case 'concl-contrast': return M.concl(ratio(c.value));
      case 'sec-contrast': return M.sec(ratio(c.value));
      case 'cover-title': return M.cover(ratio(c.value));
      case 'cvd': return M.cvd(X.who[c.kind], whole(c.value), c.need, n);
      case 'red-hue': return M.redHue;
      case 'grey': return M.grey(n, whole(c.value));
      case 'washout': return M.washout(n, ratio(c.value));
      default: return c.id;
    }
  };
  // 画面に出すのは fail だけ（作者の方針：通らないときだけ知らせる）。warn は書き出す tokens.css の頭にだけ書く
  function showChecks(res) {
    const fails = res.filter((c) => c.level === 'fail');
    checks.hidden = !fails.length;
    if (!fails.length) { checks.replaceChildren(); return; }
    const fixes = new Map();
    const items = fails.map((c) => {
      let fix = null;
      // 直す色は入力ごとに 1 つ（同じ入力の 2 つ目からはボタンを出さない）
      if (c.token !== 'cover' && !fixes.has(c.token)) { fix = fixFor(input(), c.token, { coverBg: S.coverBg }); fixes.set(c.token, fix); }
      const name = X.name[c.token] || X.name.base;
      return el('li', { cls: 'shop-check', 'data-id': c.id, 'data-token': c.token }, [el('span', { cls: 'shop-check-msg', text: message(c) }),
        fix ? el('button', { type: 'button', cls: 'shop-fix', 'data-hex': fix, 'aria-label': X.useLabel(name, fix), onclick: () => applyFix(c.token, fix) }, [el('span', { cls: 'chip', style: `background:${fix}` }), X.use(fix)]) : null]);
    });
    checks.replaceChildren(el('p', { cls: 'shop-checks-head', text: X.checksHead(fails.length) }), el('ul', {}, items));
  }
  function applyFix(token, hex) {
    if (token === 'base') setBase(hex);
    else { S.overrides[token] = hex; render(); }
  }

  // ---------------------------------------------------------------- 詳しく：導いた色・表紙の背景画像
  const rows = {};
  const moreBody = el('div', { cls: 'shop-colours' }, EDITABLE.map((k) => {
    const c = el('input', { type: 'color', id: `shop-c-${k}`, 'aria-label': X.name[k] });
    const h = el('input', { type: 'text', id: `shop-h-${k}`, 'aria-label': X.hexOf(X.name[k]), maxlength: '7', spellcheck: 'false', autocomplete: 'off' });
    c.addEventListener('input', () => { S.overrides[k] = normHex(c.value); render(); });
    h.addEventListener('input', () => { const ok = isHex(h.value); h.toggleAttribute('aria-invalid', !ok); if (ok) { S.overrides[k] = normHex(h.value); render({ keep: h }); } });
    rows[k] = { c, h };
    return el('div', { cls: 'shop-colour', 'data-token': k }, [el('label', { for: `shop-c-${k}`, text: cap(X.name[k]) }), c, h]);
  }));
  const reset = el('button', { type: 'button', id: 'shop-reset', text: X.reset, onclick: () => { S.overrides = {}; render(); } });
  const coverFile = el('input', { type: 'file', id: 'shop-cover-file', accept: COVER_TYPES.join(','), 'aria-label': X.cover, hidden: '' });
  const coverNow = el('span', { id: 'shop-cover-now', cls: 'hint', text: X.coverNone });
  const coverRemove = el('button', { type: 'button', id: 'shop-cover-remove', text: X.coverRemove, hidden: '', onclick: () => { S.cover = ''; S.coverBg = null; coverNow.textContent = X.coverNone; coverRemove.hidden = true; render(); } });
  coverFile.addEventListener('change', async () => {
    const f = coverFile.files && coverFile.files[0];
    coverFile.value = '';
    if (!f) return;
    if (!COVER_TYPES.includes(f.type)) { app.toast(X.coverType, true); return; }
    if (f.size > COVER_MAX) { app.toast(X.coverTooLarge(kb(f.size)), true); return; }
    try { S.coverBg = averageColour(await imageData(f, 160)); S.cover = await readDataUrl(f, COVER_MAX); }
    catch { app.toast(X.imageBroken(f.name), true); return; }
    coverNow.textContent = L === 'en' ? `${f.name} (${kb(f.size)})` : `${f.name}（${kb(f.size)}）`;
    coverRemove.hidden = false;
    render();
  });
  const more = el('details', { id: 'shop-more', cls: 'paste-fold shop-more' }, [el('summary', { text: X.more }), moreBody, el('div', { cls: 'shop-row' }, [reset]),
    el('div', { cls: 'shop-field shop-cover' }, [el('span', { cls: 'shop-label', id: 'shop-cover-label', text: X.cover }),
      el('div', { cls: 'shop-row' }, [el('button', { type: 'button', id: 'shop-cover', 'aria-describedby': 'shop-cover-label shop-cover-note', text: X.coverPick, onclick: () => coverFile.click() }), coverNow, coverRemove, coverFile]),
      el('small', { id: 'shop-cover-note', cls: 'hint', text: X.coverNote })])]);

  // ---------------------------------------------------------------- 保存
  const nameIn = el('input', { type: 'text', id: 'shop-name', maxlength: '60', placeholder: X.themeNamePh, autocomplete: 'off' });
  const saveBtn = el('button', { type: 'button', id: 'shop-save', cls: 'pri', text: X.save, 'aria-describedby': 'shop-save-note' });
  const zipBtn = el('button', { type: 'button', id: 'shop-zip', text: X.zip });
  const saveNote = el('small', { id: 'shop-save-note', cls: 'hint', text: X.saveNote });
  const named = () => nameIn.value.trim();
  const showSave = () => { saveBtn.disabled = zipBtn.disabled = !named(); saveNote.textContent = named() ? X.saveNote : X.nameNeeded; };
  nameIn.addEventListener('input', showSave);
  const filesOf = () => {
    const title = named(), name = themeNameOf(title);
    return { title, name, files: themeFiles(input(), { name, title, coverImage: S.cover, results: checkInput(input(), { coverBg: S.coverBg }) }) };
  };
  saveBtn.addEventListener('click', async () => {
    if (!named()) return;
    const { title, name, files } = filesOf(), enc = new TextEncoder();
    let r;
    try { r = await app.save(name, new Map(Object.entries(files).map(([k, v]) => [k, enc.encode(v)]))); } catch { r = null; }
    if (!r) { app.toast(X.saveFailed, true); return; }
    app.toast(X.saved(title) + (r.replaced ? X.replaced : ''));
    api.saved = name;
    if (app.onSaved) await app.onSaved(name);
  });
  zipBtn.addEventListener('click', () => {
    if (!named()) return;
    const { name, files } = filesOf();
    app.download(`${name}.zip`, writeZip(Object.entries(files).map(([k, v]) => [`${name}/${k}`, v])), 'application/zip');
  });

  // ---------------------------------------------------------------- 全体
  const node = el('section', { id: 'theme-shop', cls: 'theme-shop', 'aria-labelledby': 'theme-shop-h', hidden: '' }, [
    el('h4', { id: 'theme-shop-h', text: X.head }),
    el('p', { cls: 'hint', text: X.lead }),
    el('div', { cls: 'shop-inputs' }, [
      el('div', { cls: 'shop-field' }, [el('label', { for: 'shop-base', text: X.base }), el('div', { cls: 'shop-row' }, [baseIn, baseHex, logoBtn, logoFile])]),
      el('div', { cls: 'shop-field' }, [el('label', { for: 'shop-font', text: X.font }), fontSel]),
    ]),
    logoOut, logoNote,
    el('div', { cls: 'shop-preview' }, [pvCover.host, pvBody.host]),
    el('small', { cls: 'hint', text: X.previewNote }),
    checks,
    more,
    el('div', { cls: 'shop-save' }, [el('div', { cls: 'shop-field' }, [el('label', { for: 'shop-name', text: X.themeName }), nameIn]), el('div', { cls: 'shop-row' }, [saveBtn, zipBtn]), saveNote]),
  ]);

  function setBase(hex, fromText = false) {
    S.base = normHex(hex);
    render({ keep: fromText ? baseHex : null });
  }
  // 入力を今の値にそろえ、プレビューと確かめた結果を描き直す（keep：打っている途中の欄は書き換えない）
  function render({ keep = null } = {}) {
    const t = deriveTheme(S.base, S.overrides);
    baseIn.value = S.base.toLowerCase();
    if (keep !== baseHex) { baseHex.value = S.base; baseHex.removeAttribute('aria-invalid'); }
    fontSel.value = S.font;
    for (const k of EDITABLE) { rows[k].c.value = t[k].toLowerCase(); if (keep !== rows[k].h) rows[k].h.value = t[k]; rows[k].c.closest('.shop-colour').toggleAttribute('data-changed', !!S.overrides[k]); }
    reset.disabled = !Object.keys(S.overrides).length;
    const css = themeFiles(input(), { name: 'preview', coverImage: S.cover, results: [] })['tokens.css'];
    const all = FRAME + baseCss() + '\n' + host(css) + `\n:host{--font-sans:${fontStack(S.font)}}`;
    pvCover.style.textContent = all; pvBody.style.textContent = all;
    for (const p of [pvCover, pvBody]) scaleTo(p.host, p.host.clientWidth);
    showChecks(checkInput(input(), { coverBg: S.coverBg }));
    showSave();
    node.dataset.base = S.base;
  }
  // 始める値：前に選んでいたテーマ（同梱のテーマは tokens.css の --base とフォント。このテーマを作る画面で作った自分のテーマは theme.json の builder）
  function startWith(from) {
    let st = null;
    const mine = from && app.myThemeFiles ? app.myThemeFiles(from) : null;
    if (mine && mine.get('theme.json')) st = readBuilder(new TextDecoder().decode(mine.get('theme.json')));
    if (!st && from) {
      const tok = bundled(`/repo/themes/${from}/tokens.css`), cfg = bundled(`/repo/themes/${from}/theme.json`);
      if (tok) {
        const s = startFrom(tok);
        let body = '';
        try { body = (JSON.parse(cfg || '{}').fonts || {}).body || ''; } catch { body = ''; }
        if (!s.font && /var\(--font-mincho\)/.test(tok)) s.font = 'BIZ UDPMincho';
        st = { base: s.base, font: FONT_CHOICES.some((f) => f.family === body) ? body : s.font, overrides: {} };
      }
    }
    S.base = st && st.base ? st.base : '#1D4F91';
    S.font = st && st.font ? st.font : fallbackFont.family;
    S.overrides = st ? { ...st.overrides } : {};
  }
  // saved：最後に保存したテーマの名前（新規作成の ③ は、そのテーマを選んでいる間は開いたままにする）
  const api = {
    node, saved: null,
    open(from) { if (!S.open) startWith(from); S.open = true; node.hidden = false; render(); },
    close() { S.open = false; api.saved = null; node.hidden = true; },
    isOpen: () => S.open,
    words: X,
  };
  return api;
}
