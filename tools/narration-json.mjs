// 口述原稿（narration.md）を JSON で出す。TTS（tts/synth.py）が parser を二重に持たないための口
//
//   node tools/narration-json.mjs <narration.md> [--voice '<json>']
//
// 出力: {warnings: [文字列…（雛形の仮の行のままの段階も）], segments: [{key, slideKey, stepKey, line, digest, inputHash, bounds, turns:[{role, raw, display, tts, ttsParts, bounds}], ext:[{name, field, value, line}]}]}
// ext は拡張の行（@x-名前-欄 値）。発言にも digest にも入らない
// bounds は段階の区切り（{cue} と {mark:…}）の並び。synth.py が記録する cues と 1 対 1 に対応する（docs/contract.md §4）
// digest は kit/narration.mjs の segDigest(seg, voice)。voice には声の設定・正規化の目標値・
// 読み辞書の版など「音声を変えるものすべて」を入れる（呼び出し側が決める）
import crypto from 'node:crypto';
import { readNarration, segDigest } from '../kit/narration.mjs';
import { inputCanonical } from '../kit/core/portable.mjs';
import { isPlaceholder } from '../kit/core/template-text.mjs';

const a = process.argv.slice(2);
let file = null, voice = {};
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--voice') voice = JSON.parse(a[++i]);
  else file = a[i];
}
if (!file) { console.error('usage: node tools/narration-json.mjs <narration.md> [--voice json]'); process.exit(1); }
const segs = readNarration(file);
// inputHash：その段階の口述原稿の hash（format spec §5.4。音声が古いかを決める。synth.py が manifest に書く）
const out = segs.map((s) => ({ key: `${s.slideKey}:${s.stepKey}`, slideKey: s.slideKey, stepKey: s.stepKey, line: s.line, digest: segDigest(s, voice),
  inputHash: crypto.createHash('sha256').update(inputCanonical(s)).digest('hex'), bounds: s.bounds, turns: s.turns, ext: s.ext || [] }));
// 雛形の仮の行（「✎ 」で始まる。kit/core/template-text.mjs）が残っている段階：TTS はそのまま読むので、合成の前に知らせる（止めない）
const warnings = [...(segs.warnings || [])];
for (const s of segs) if (s.turns.some((t) => isPlaceholder(t.raw))) warnings.push(`narration.md ${s.line} 行目: 段階「${s.slideKey}:${s.stepKey}」の口述原稿が雛形の仮の行（✎）のまま。TTS はこのまま読む / still the template placeholder (✎); TTS reads it as is`);
for (const w of warnings) console.error(`⚠ ${w}`);
process.stdout.write(JSON.stringify({ warnings, segments: out }));
