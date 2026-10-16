// node:path の posix の一部（ブラウザの編集アプリで kit/core/build-core.mjs に渡す）。場所は / から始まる仮の場所
// 使うもの：sep join resolve dirname basename extname relative parse normalize isAbsolute
export const sep = '/';
export function normalize(p) {
  const abs = p.startsWith('/');
  const out = [];
  for (const s of p.split('/')) {
    if (!s || s === '.') continue;
    if (s === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..'); }
    else out.push(s);
  }
  const r = out.join('/');
  return abs ? '/' + r : r || '.';
}
export const isAbsolute = (p) => p.startsWith('/');
export function join(...parts) { const j = parts.filter((x) => x !== '').join('/'); return j ? normalize(j) : '.'; }
export function resolve(...parts) {
  let r = '';
  for (let i = parts.length - 1; i >= 0 && !r.startsWith('/'); i--) if (parts[i]) r = parts[i] + (r ? '/' + r : '');
  return normalize(r.startsWith('/') ? r : '/' + r);
}
export function dirname(p) {
  const n = normalize(p);
  const i = n.lastIndexOf('/');
  if (i < 0) return '.';
  return i === 0 ? '/' : n.slice(0, i);
}
export function basename(p, ext) {
  const b = normalize(p).split('/').pop();
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
}
export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i);
}
export function relative(from, to) {
  const a = resolve(from).split('/').filter(Boolean), b = resolve(to).split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}
export function parse(p) {
  const dir = dirname(p), base = basename(p), ext = extname(p);
  return { root: p.startsWith('/') ? '/' : '', dir, base, ext, name: ext ? base.slice(0, -ext.length) : base };
}
export default { sep, normalize, isAbsolute, join, resolve, dirname, basename, extname, relative, parse };
