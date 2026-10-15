// 口述原稿（narration.md）を JSON で出す。TTS（tts/synth.py）が parser を二重に持たないための口
//
//   node tools/narration-json.mjs <narration.md> [--voice '<json>']
//
// 出力: {warnings: [文字列…], segments: [{key, slideKey, stepKey, line, digest, bounds, turns:[{role, raw, display, tts, ttsParts, bounds}]}]}
// bounds は段階の区切り（{cue} と {mark:…}）の並び。synth.py が記録する cues と 1 対 1 に対応する（docs/contract.md §4）
// digest は kit/narration.mjs の segDigest(seg, voice)。voice には声の設定・正規化の目標値・
// 読み辞書の版など「音声を変えるものすべて」を入れる（呼び出し側が決める）
import { readNarration, segDigest } from '../kit/narration.mjs';

const a = process.argv.slice(2);
let file = null, voice = {};
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--voice') voice = JSON.parse(a[++i]);
  else file = a[i];
}
if (!file) { console.error('usage: node tools/narration-json.mjs <narration.md> [--voice json]'); process.exit(1); }
const segs = readNarration(file);
const out = segs.map((s) => ({ key: `${s.slideKey}:${s.stepKey}`, slideKey: s.slideKey, stepKey: s.stepKey, line: s.line, digest: segDigest(s, voice), bounds: s.bounds, turns: s.turns }));
for (const w of segs.warnings || []) console.error(`⚠ ${w}`);
process.stdout.write(JSON.stringify({ warnings: segs.warnings || [], segments: out }));
