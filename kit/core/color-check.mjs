// 色の検査の計算（テーマの検査 tools/test-themes.mjs と、テーマを作る画面 #58 が使う）。外の名前を使わない（ブラウザでも Node でも動く）。
// handoff/theme-builder の colorlib.js（design-theme/tools/colorcheck.py を移したもの。Python と照らして一致を確かめた）から、要るものだけ：
//   コントラスト比（WCAG 2.x）、色覚の模擬（Machado ほか 2009、強さ 1.0、線形 RGB で。1 型 protan・2 型 deutan・3 型 tritan）、
//   CIELAB（D65）、色差 ΔE*ab（CIE76。テーマの見比べ 2026-10-27 とペンの色 #132 の数字はこれ）と CIEDE2000（テーマの工房の C4・C5 の基準）
// 色は '#rrggbb' か [r, g, b]（0〜1）
export const hex2rgb = (h) => { if (Array.isArray(h)) return h.slice(0, 3); let s = String(h).trim().replace(/^#/, ''); if (s.length === 3) s = s.replace(/./g, '$&$&'); return [0, 2, 4].map((i) => parseInt(s.substr(i, 2), 16) / 255); };
const clip = (v) => Math.min(1, Math.max(0, v));
export const rgb2hex = (c) => '#' + c.map((v) => ('0' + Math.round(clip(v) * 255).toString(16)).slice(-2)).join('').toUpperCase();
const lin1 = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const delin1 = (v) => { v = clip(v); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
const lin = (c) => c.map(lin1), delin = (c) => c.map(delin1);
const mul = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
export const relLum = (c) => { const l = lin(hex2rgb(c)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
export const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
export const VISION = ['normal', 'protan', 'deutan', 'tritan'];
export const simulate = (c, kind) => { c = hex2rgb(c); return kind === 'normal' ? c : delin(mul(MACHADO[kind], lin(c))); };
const M_XYZ = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]], WHITE = [0.95047, 1.0, 1.08883];
export function lab(c) {
  const xyz = mul(M_XYZ, lin(hex2rgb(c))).map((v, i) => v / WHITE[i]), d = 6 / 29;
  const f = xyz.map((t) => (t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29));
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}
export const de76 = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
const R = Math.PI / 180;
export function de2000(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = ((Math.atan2(b1, a1p) / R) % 360 + 360) % 360, h2p = ((Math.atan2(b2, a2p) / R) % 360 + 360) % 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) dhp = 0; else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p; else dhp = h2p > h1p ? h2p - h1p - 360 : h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * R), Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p; else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2; else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * R) + 0.24 * Math.cos(2 * hbp * R) + 0.32 * Math.cos((3 * hbp + 6) * R) - 0.20 * Math.cos((4 * hbp - 63) * R);
  const dth = 30 * Math.exp(-(((hbp - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dth * R) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}
// 色覚の型 kind で模擬した 2 色の差（metric：'de76' か 'de2000'）
export const deUnder = (a, b, kind, metric = 'de76') => (metric === 'de2000' ? de2000 : de76)(simulate(a, kind), simulate(b, kind));
