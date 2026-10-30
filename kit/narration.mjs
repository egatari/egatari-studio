// 口述原稿（narration.md）の読み書き。build・TTS・開発サーバーが共有する
// 書式は docs/contract.md §4。解析と書き換えの本体は kit/core/narration-core.mjs（ブラウザの編集アプリと共有）
import fs from 'node:fs';
import crypto from 'node:crypto';
import { readRegular, READ_LIMITS } from './bounded-read.mjs';
import { parseNarration } from './core/narration-core.mjs';

export { NOTE, stripNotes, noteProblems, presenterParts, normalizeKey, MARK_EFFECTS, parseBound, renderText, joinLines, parseNarration, narrationMap, marksMap,
  rewriteNarration, narrationRev, rawTurns, splitKey, SLIDE_ID, isSlideId, newSlideId, STEP_KEY, isStepKey, parseHeading,
  headingText, headingLine, EXT_LINE, parseExtLine } from './core/narration-core.mjs';

// 通常のファイルだけを、READ_LIMITS.narration（16 MiB）まで読む（kit/bounded-read.mjs。超えるなら読まずに ReadOverError）
export function readNarration(path, { max = READ_LIMITS.narration } = {}) {
  if (!fs.existsSync(path)) return Object.assign([], { warnings: [] });
  return parseNarration(readRegular(path, { max }).toString('utf8'));
}

// 音声キャッシュの鍵：話者・TTS 用の文字列・声の設定から作る（marp2mp4 の turns_digest と同じ考え方）
export function segDigest(seg, voice = {}) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify({ turns: seg.turns.map((t) => [t.role, t.ttsParts]), voice }));
  return h.digest('hex').slice(0, 12);
}
