// 参照音声（AI 音声が声をまねる元の録音）：教材に入れない（format spec §5 の recipe。持ち主の決定 2026-10-28）。
// 教材（Egatari ファイル）が運ぶのは、その声で合成した台本の音声だけ。人の声の録音が教材の写しと一緒に広がらないように。
// node: も fs も使わない（Node とブラウザの編集アプリが共有する。読み書きは渡された env を通す）
//
//   referenceVoices(env, deckDir, {refDir?})  → [{abs, rel, size, load()}]：作業フォルダの中にある参照音声
//     voice.json の expert・novice（tts/synth.py と同じ読み方）：パス（/ を含むか .wav で終わる。相対なら作業フォルダから）はそのファイル。
//     名前（bob）は <refDir>/<名前>.wav と <名前>_<言語>.wav（refDir は IRODORI_REF_DIR。コマンドだけ）。役がなければ既定の名前（bob・alice）。
//     作業フォルダの外のものは数えない（そもそも組み立ても書き出しも読まない）
//   matchReference(refs, rel, bytes?)        → 当たった参照音声（場所が同じか、中身のバイトが同じ）か null
//   REFERENCE_VOICE_RULE                     知らせに添える決まりの言葉（英語。画面は app/i18n.js・kit/check-messages.mjs）

export const REFERENCE_VOICE_RULE = 'a lesson does not carry the reference recording a voice was cloned from, only the narration audio made with it (Egatari §5, recipe)';
const DEFAULT_NAMES = Object.freeze({ expert: 'bob', novice: 'alice' });
const isPathForm = (v) => /[\\/]/.test(v) || /\.wav$/i.test(v);
const fold = (p) => p.normalize('NFC').toLowerCase();

export function referenceVoices(env, deckDir, opts = {}) {
  const P = env.path;
  const root = P.resolve(deckDir);
  const inDeck = (p) => env.within(p, root);
  const rel = (p) => P.relative(root, p).split(P.sep).join('/');
  let vj = {};
  const vPath = P.join(root, 'voice.json');
  try { if (env.exists(vPath) && inDeck(vPath)) { const v = JSON.parse(env.readText(vPath)); if (v && typeof v === 'object' && !Array.isArray(v)) vj = v; } } catch { /* 読めない voice.json：声の指定はないものとする */ }
  const roles = {};
  for (const [k, v] of Object.entries(vj)) if ((k.toLowerCase() === 'expert' || k.toLowerCase() === 'novice') && typeof v === 'string' && v.trim()) roles[k.toLowerCase()] = v.trim();
  for (const r of Object.keys(DEFAULT_NAMES)) if (!roles[r]) roles[r] = DEFAULT_NAMES[r];
  const cands = new Set();
  const refDir = typeof opts.refDir === 'string' && opts.refDir ? P.resolve(root, opts.refDir) : null;
  for (const v of Object.values(roles)) {
    if (isPathForm(v)) {
      if (/^~/.test(v)) continue;   // 家のフォルダ：作業フォルダの外
      cands.add(P.resolve(root, v));
    } else if (refDir && inDeck(refDir)) {
      cands.add(P.join(refDir, v + '.wav'));
      // 言語の付いた声（<名前>_<言語>.wav。tts/synth.py は日本語以外の教材でこれを選ぶ）
      if (typeof env.listFiles === 'function') {
        try {
          const re = new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_[A-Za-z]{2,3}\\.wav$`, 'i');
          for (const f of env.listFiles(refDir) || []) if (P.dirname(f) === refDir && re.test(P.basename(f))) cands.add(f);
        } catch { /* 一覧できない */ }
      }
    }
  }
  const out = [];
  for (const abs of [...cands].sort()) {
    if (!inDeck(abs) || abs === root) continue;
    let ok = false;
    try { ok = env.exists(abs) && (typeof env.isFile !== 'function' || env.isFile(abs)); } catch { ok = false; }
    if (!ok) continue;
    // 中身は比べるときにだけ読む（同じ大きさのファイルがあったとき。名前を変えた写しも見つける）
    let size = null, bytes;
    try { const n = typeof env.size === 'function' ? env.size(abs) : null; size = Number.isFinite(n) ? n : null; } catch { size = null; }
    const load = () => {
      if (bytes === undefined) {
        try { bytes = env.readBytes ? env.readBytes(abs) : Uint8Array.from(atob(env.readBase64(abs)), (c) => c.charCodeAt(0)); } catch { bytes = null; }
      }
      return bytes;
    };
    out.push({ abs, rel: rel(abs), size, load });
  }
  return out;
}

const sameBytes = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
export function matchReference(refs, relPath, bytes = null) {
  const f = fold(relPath);
  for (const r of refs) if (fold(r.rel) === f) return r;
  if (bytes) for (const r of refs) if ((r.size === null || r.size === bytes.length) && sameBytes(r.load(), bytes)) return r;
  return null;
}
