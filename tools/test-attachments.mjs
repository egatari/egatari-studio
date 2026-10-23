// 添付（format spec §3.8。kit/core/attachments.mjs・kit/core/attach-content.mjs）の試験。入力はその場で作る（tools/attach-fixtures.mjs）
//   node tools/test-attachments.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// 1. コマンド：attachments/ と egatari.json の役割・題・説明 → 1 ファイル（--portable）。index.attachments・files・塊の媒体型。.html は入れない。
//    1 ファイルの egatari.json の attachments は index.attachments と同じ（作業フォルダのものは変えない）
// 2. 展開して同じ（unpack は index.attachments を egatari.json に書く）、もう一度まとめても同じ sourceSha256 と一覧。egatari.json のない文書の展開。
//    egatari.json と index.attachments が違う文書は読まない
// 3. 再生専用（--play-only）には添付が入らない（索引も添付の塊もない）
// 4. 上限（1 つ・合わせて・数）・題・説明：外して知らせる。名前の規則（.. ・隠しファイル・リンク）。音声と動画（名前と中身）
// 4A. 役割ごとの型と中身（§3.8）：PDF（JavaScript・自動の動作・Launch・埋め込み・object stream・爆弾）、xlsx・docx（マクロ・外部リンク・DDE・
//    WEBSERVICE・ActiveX・OLE・フィールド・テンプレート）、CSV（数式として読まれる値は警告だけ）、重ねたファイル、名前を替えた実行ファイル、ZIP の爆弾、
//    役割と型の組。書き出しは外して規則の名前を添えて知らせ、品質チェックは MUST NOT をエラー、SHOULD を警告にする
// 5. 品質チェック（kit/check.mjs --json）：役割がない・役割が正しくない・ない・名前が使えない・大きすぎる
// 6. 段 A（kit/core/tier-a.mjs）：足す・消す・名前・題・説明を替える → 添付の場所と索引だけが変わる（tools/tier-a-diff.mjs）。egatari.json も一覧を揃える。
//    原稿が書いている添付・上限を超えるもの・§3.8 に合わないもの（HTML・JavaScript のある PDF・役割に合わない型）は断る
// 7. 再生器（ヘッドレス Chrome、file://）：帯のボタンと ? の一覧（説明つき）、ダウンロード（開かずに保存。ページは動かず、新しいタブもない）。
//    索引に書いてあっても §3.8 の型でないもの・役割に合わないものは出さず、中身が型と合わないもの・壊れた添付は保存しない。再生専用には出ない
// 8. 編集アプリ：1 ファイル（OPFS のハンドル）の添付の板で足す（§3.8 に合わないものは規則を言って断る）・役割・題・説明・名前を替える・消す →
//    保存は段 A（場所を見分ける差分）。作業フォルダ（OPFS）でも足す・消す（.cache/edits/ に控え）。画像（--shots）：player-attachments.png・editor-attachments.png（1280×800）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readPortable, playOnly, scanDocument, replaceIndexText } from '../kit/core/portable.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { attachmentsOf, attachmentIndexWarnings, sniffMedia, ATTACH_LIMITS, planAttachments, inspectAttachment, roleProblem } from '../kit/core/attachments.mjs';
import * as F from './attach-fixtures.mjs';
import { unpack } from './portable.mjs';
import { regionDiff } from './tier-a-diff.mjs';
import { clickUntil, clickDlg, clickCommand } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1)) || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-attach-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const enc = new TextEncoder(), dec = new TextDecoder();
const CFG = FORMAT.CONFIG_FILE, KEY = FORMAT.ATTACH_KEY;

// ---------------------------------------------------------------- 作業フォルダ
const PDF = F.PDF_OK(3000);
const EVIL = '<!doctype html><title>evil</title><script>try{window.top.__PWNED=1;parent.__PWNED=1;localStorage.setItem("pwned","1")}catch(e){}</script><h1>attachment</h1>';
function makeDeck(dir, conf) {
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  fs.mkdirSync(path.join(dir, 'attachments', 'code'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'attachments', 'paper.pdf'), PDF);
  fs.writeFileSync(path.join(dir, 'attachments', 'evil.html'), EVIL);
  fs.writeFileSync(path.join(dir, 'attachments', 'notes.txt'), 'plain notes\n');
  fs.writeFileSync(path.join(dir, 'attachments', 'data.csv'), 'x,y\n1,2\n3,4\n');
  fs.writeFileSync(path.join(dir, 'attachments', 'code', 'run.py'), 'print("hi")\n');
  fs.writeFileSync(path.join(dir, CFG), JSON.stringify(conf, null, 2) + '\n');
  return path.join(dir, 'deck.html');
}
const CONF = {
  docId: '6f2b8a3e-1c4d-4e5f-8a9b-0c1d2e3f4a5b',
  metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test Author' },
  [KEY]: [
    { path: 'attachments/paper.pdf', role: 'pdf', title: 'Paper (PDF)' },
    { path: 'attachments/evil.html', role: 'supplement', title: 'Handout (HTML)' },
    { path: 'attachments/notes.txt', role: 'supplement', title: 'Notes', description: 'Read this first.' },
    { path: 'attachments/data.csv', role: 'data', title: 'Data', note: 'kept unknown member' },
  ],
};
const LISTED = 'attachments/paper.pdf,attachments/notes.txt,attachments/data.csv';
const DECK = makeDeck(path.join(work, 'deck'), CONF);
const OUT = path.join(work, 'a' + FORMAT.FILE_EXT);

// ---------------------------------------------------------------- 1. コマンド
{
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.dirname(DECK), '--portable', '-o', OUT], { encoding: 'utf8' });
  ok(r.status === 0, 'cli: build --portable with attachments succeeds' + (r.status ? ': ' + r.stderr : ''));
  ok(/attachments\/code\/run\.py" has no role/.test(r.stderr), 'cli: a file without a role is reported (packed, not listed)');
  ok(/attachments\/evil\.html" is HTML \(by its name\), which must not be attached \(§3\.8\); not included/.test(r.stderr), 'cli: an .html attachment is skipped with a warning naming the rule (§3.8)');
  const html = fs.readFileSync(OUT, 'utf8');
  const p = await readPortable(html);
  const list = p.index[KEY];
  ok(Array.isArray(list) && list.map((e) => e.path).join() === LISTED && list[0].title === 'Paper (PDF)' && list[1].description === 'Read this first.' && list[2].note === 'kept unknown member' && list[2].title === 'Data',
    'cli: index.attachments lists the allowed entries with a role, in the order of egatari.json, with title, description and unknown members: ' + JSON.stringify(list));
  ok(['attachments/paper.pdf', 'attachments/notes.txt', 'attachments/data.csv', 'attachments/code/run.py'].every((f) => f in p.files) && !('attachments/evil.html' in p.files) && Buffer.from(p.files['attachments/paper.pdf']).equals(PDF), 'cli: allowed attachments are in files (bytes unchanged), the .html one is not');
  ok(p.index.blobs[p.index.files['attachments/paper.pdf']].mime === 'application/pdf' && p.index.blobs[p.index.files['attachments/data.csv']].mime === 'text/csv' && p.index.blobs[p.index.files['attachments/code/run.py']].mime === 'text/plain',
    'cli: attachment blobs carry the media type of their §3.8 type (application/pdf, text/csv, text/plain)');
  ok(p.index.profile === 'core' && !p.index.requires.some((f) => /article/.test(f)), `cli: attachments are ignorable, so nothing is added to requires (${p.index.requires})`);
  const cfg = JSON.parse(dec.decode(p.files[CFG]));
  ok(JSON.stringify(cfg[KEY]) === JSON.stringify(list) && /the copy in the single file lists only the attachments listed for readers \(3 of 4\)/.test(r.stderr) && JSON.parse(fs.readFileSync(path.join(path.dirname(DECK), CFG), 'utf8'))[KEY].length === 4,
    `cli: the ${CFG} in the file has attachments equal to index.attachments (§3.3); the working folder's ${CFG} is unchanged`);
  ok(attachmentsOf(p.index).length === 3 && attachmentsOf(p.index)[1].description === 'Read this first.' && p.warnings.length === 0, 'cli: attachmentsOf lists the 3 attachments (with the description), no read warnings');
}

// ---------------------------------------------------------------- 2. 展開して同じ・まとめ直しても同じ・設定のファイルの添付の一覧（§3.3・§3.8）
{
  const dir = path.join(work, 'unpacked');
  await unpack(OUT, dir);
  const src = path.dirname(DECK);
  const walk = (d, pre = '') => fs.readdirSync(d).flatMap((n) => { const p = path.join(d, n); return fs.statSync(p).isDirectory() ? walk(p, pre + n + '/') : [pre + n]; });
  const got = walk(dir).sort();
  const a = await readPortable(fs.readFileSync(OUT, 'utf8'));
  const same = got.filter((f) => f !== CFG).every((f) => fs.readFileSync(path.join(dir, f)).equals(fs.readFileSync(path.join(src, f))));
  const ucfg = JSON.parse(fs.readFileSync(path.join(dir, CFG), 'utf8'));
  ok(got.includes('attachments/notes.txt') && got.includes('attachments/code/run.py') && !got.includes('attachments/evil.html') && same && JSON.stringify(ucfg[KEY]) === JSON.stringify(a.index[KEY]) && ucfg.docId === CONF.docId,
    `roundtrip: unpack writes attachments/ byte for byte and ${CFG} with index.attachments`);
  const r2 = await buildPortable(path.join(dir, 'deck.html'), { out: path.join(work, 'b' + FORMAT.FILE_EXT) });
  ok(r2.index.sourceSha256 === a.index.sourceSha256 && JSON.stringify(r2.index[KEY]) === JSON.stringify(a.index[KEY]) && !r2.warnings.some((w) => /lists only/.test(w)), 'roundtrip: packing the unpacked folder (reading the list from egatari.json) gives the same sourceSha256 and attachment list');
  // 設定のファイルのない 1 ファイル（ほかの書き手）：展開は index.attachments（と docId）を設定のファイルに書く
  const html = fs.readFileSync(OUT, 'utf8');
  const ix = JSON.parse(scanDocument(html).byId.get(FORMAT.INDEX_ID).text);
  delete ix.files[CFG];
  const noCfg = path.join(work, 'nocfg' + FORMAT.FILE_EXT);
  fs.writeFileSync(noCfg, await replaceIndexText(html, JSON.stringify(ix)));
  const dir2 = path.join(work, 'unpacked-nocfg');
  await unpack(noCfg, dir2);
  const c2 = JSON.parse(fs.readFileSync(path.join(dir2, CFG), 'utf8'));
  ok(c2.docId === ix.docId && JSON.stringify(c2[KEY]) === JSON.stringify(ix[KEY]) && c2.metadata.license === 'CC-BY-4.0', `unpack: a file without ${CFG} unpacks into a folder whose ${CFG} has the docId, the rights and index.attachments`);
  const r3 = await buildPortable(path.join(dir2, 'deck.html'), { out: path.join(work, 'c' + FORMAT.FILE_EXT) });
  ok(JSON.stringify(r3.index[KEY]) === JSON.stringify(ix[KEY]) && r3.index.docId === ix.docId, 'unpack: packing that folder keeps the attachment list and the docId');
  // 両方あって違う：断る（§3.3 の MUST）
  const ix2 = JSON.parse(scanDocument(html).byId.get(FORMAT.INDEX_ID).text);
  ix2[KEY][0].title = 'Changed only in the index';
  let err = null;
  try { await readPortable(await replaceIndexText(html, JSON.stringify(ix2))); } catch (e) { err = e; }
  ok(err && err.code === 'attachments-mismatch', `read: ${CFG} attachments that differ from index.attachments are refused (attachments-mismatch): ${err && err.message}`);
}

// ---------------------------------------------------------------- 3. 再生専用
{
  const html = fs.readFileSync(OUT, 'utf8');
  const a = await readPortable(html);
  const po = playOnly(html);
  const ids = Object.keys(a.index.files).filter((f) => f.startsWith('attachments/')).map((f) => a.index.files[f]);
  ok(!scanDocument(po).byId.has(FORMAT.INDEX_ID) && ids.every((id) => !po.includes(FORMAT.BLOB_PREFIX + id)), 'play-only: neither the index nor any attachment blob is in the play-only file (also role source)');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.dirname(DECK), '--play-only', '-o', path.join(work, 'p' + FORMAT.PLAY_EXT)], { encoding: 'utf8' });
  const poText = fs.readFileSync(path.join(work, 'p' + FORMAT.PLAY_EXT), 'utf8');
  ok(r.status === 0 && !scanDocument(poText).byId.has(FORMAT.INDEX_ID) && ids.every((id) => !poText.includes(FORMAT.BLOB_PREFIX + id)), 'play-only: build --play-only leaves the attachments out');
}

// ---------------------------------------------------------------- 4. 上限・名前
{
  const r1 = await buildPortable(DECK, { out: path.join(work, 'l1.html'), attachLimits: { fileBytes: 1000 } });
  ok(!('attachments/paper.pdf' in r1.files) && r1.warnings.some((w) => /paper\.pdf" is \d+ bytes, over the limit of 1000/.test(w)) && r1.index[KEY].every((e) => e.path !== 'attachments/paper.pdf'), 'limits: an attachment over the per-file limit is left out and reported');
  const r2 = await buildPortable(DECK, { out: path.join(work, 'l2.html'), attachLimits: { totalBytes: 3100 } });
  ok(Object.keys(r2.files).filter((f) => f.startsWith('attachments/')).length === 3 && r2.warnings.some((w) => /together, over the limit of 3100/.test(w)), 'limits: attachments over the total limit are left out (in order) and reported');
  const r3 = await buildPortable(DECK, { out: path.join(work, 'l3.html'), attachLimits: { count: 2 } });
  ok(Object.keys(r3.files).filter((f) => f.startsWith('attachments/')).length === 2 && r3.warnings.some((w) => /more than 2 attachments/.test(w)), 'limits: more than the maximum number is reported');
  ok(ATTACH_LIMITS.fileBytes === 10 * 1048576 && ATTACH_LIMITS.totalBytes === 20 * 1048576 && ATTACH_LIMITS.count === 100 && ATTACH_LIMITS.titleChars === 120 && ATTACH_LIMITS.descriptionChars === 300, 'limits: defaults 10 MiB each, 20 MiB together, 100 files, titles up to 120 and descriptions up to 300 characters (spec §3.8 draft)');
  // 題は要る：役割があっても題のないものは入れるが一覧に出さない（知らせる）。説明は 1〜2 文（改行なし・上限まで）。違えば説明なしで一覧に出す
  {
    const d = path.join(work, 'deck-notitle');
    const dk = makeDeck(d, { ...CONF, [KEY]: [{ ...CONF[KEY][0], description: 'Line one.\nLine two.' }, { path: 'attachments/data.csv', role: 'data' }, { path: 'attachments/code/run.py', role: 'code', title: '  ' }] });
    const r = await buildPortable(dk, { out: path.join(work, 'nt.html') });
    ok(r.index[KEY].map((e) => e.path).join() === 'attachments/paper.pdf' && 'attachments/data.csv' in r.files && 'attachments/code/run.py' in r.files && r.warnings.some((w) => /data\.csv" has no title/.test(w)) && r.warnings.some((w) => /run\.py" has no title/.test(w)),
      'title: an attachment with a role but no (or a blank) title is packed but not listed, with a warning');
    ok(!('description' in r.index[KEY][0]) && r.warnings.some((w) => /paper\.pdf": the description contains a line break/.test(w)), 'description: a description with a line break is left out with a warning (the entry is still listed)');
    // 題：120 字（符号位置）まで・1 行。説明：300 字まで。Schema（vendor/egatari-spec）の maxLength・pattern と同じ
    const d2 = path.join(work, 'deck-titlelen');
    const dk2 = makeDeck(d2, { ...CONF, [KEY]: [{ ...CONF[KEY][0], title: '\u{1F600}'.repeat(120), description: 'x'.repeat(301) }, { path: 'attachments/data.csv', role: 'data', title: 'T'.repeat(121) }, { path: 'attachments/code/run.py', role: 'code', title: 'Run\r\nme' }] });
    const r2 = await buildPortable(dk2, { out: path.join(work, 'tl.html') });
    ok(r2.index[KEY].map((e) => e.path).join() === 'attachments/paper.pdf' && !('description' in r2.index[KEY][0]) && 'attachments/data.csv' in r2.files && 'attachments/code/run.py' in r2.files &&
      r2.warnings.some((w) => /data\.csv": the title longer than 120 characters/.test(w)) && r2.warnings.some((w) => /run\.py": the title contains a line break/.test(w)) && r2.warnings.some((w) => /paper\.pdf": the description longer than 300 characters/.test(w)),
      'title: a title over 120 characters or with a line break is packed but not listed (warns); 120 emoji count as 120; a description over 300 characters is dropped (warns): ' + r2.warnings.filter((w) => /title|description/.test(w)).join(' | '));
    const sch = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'egatari-spec', 'schema', 'egatari-index.schema.json'), 'utf8'));
    const findProp = (o, k) => { if (!o || typeof o !== 'object') return null; if (o.properties && o.properties[k] && o.properties.role && o.properties.path) return o.properties[k]; for (const v of Object.values(o)) { const x = findProp(v, k); if (x) return x; } return null; };
    const st = findProp(sch, 'title'), sd = findProp(sch, 'description');
    ok(st && sd && st.maxLength === ATTACH_LIMITS.titleChars && st.minLength === 1 && sd.maxLength === ATTACH_LIMITS.descriptionChars && st.pattern === '^[^\\r\\n]*$' && sd.pattern === st.pattern,
      'limits: title and description limits match the schema (maxLength, minLength, pattern): ' + JSON.stringify({ st, sd }));
    const ix = { [KEY]: [{ path: 'attachments/a.pdf', role: 'pdf' }, { path: 'attachments/b.pdf', role: 'pdf', title: 'B' }], files: { 'attachments/a.pdf': 'x', 'attachments/b.pdf': 'y' }, blobs: { x: { bytes: 1, sha256: '0', mime: 'application/pdf' }, y: { bytes: 1, sha256: '0', mime: 'application/pdf' } } };
    ok(attachmentsOf(ix).map((e) => e.path).join() === 'attachments/b.pdf' && attachmentIndexWarnings(ix).some((w) => /no title \(required\)/.test(w)), 'title: a reader does not offer an index entry without a title (warns)');
    const ix2 = { [KEY]: [{ path: 'attachments/a.html', role: 'supplement', title: 'A' }, { path: 'attachments/b.csv', role: 'pdf', title: 'B' }, { path: 'attachments/c.pdf', role: 'pdf', title: 'C' }], files: { 'attachments/a.html': 'x', 'attachments/b.csv': 'x', 'attachments/c.pdf': 'x' }, blobs: { x: { bytes: 1, sha256: '0', mime: 'text/html' } } };
    const w2 = attachmentIndexWarnings(ix2);
    ok(w2.some((w) => /a\.html" is not a type that may be attached \(html\)/.test(w)) && w2.some((w) => /b\.csv" \(csv\) is not allowed for the role pdf/.test(w)) && w2.some((w) => /c\.pdf" has the media type text\/html, expected application\/pdf/.test(w)),
      'read: index entries of a forbidden type, of a type the role does not take, or with a media type that does not match are reported: ' + w2.join(' | '));
  }
  // 音声と動画：拡張子でも中身でも入れない（知らせる）。似た先頭の画像・文字（WebP・HEIF・UTF-16 の BOM・PNG・PDF）は見逃す
  {
    const d = path.join(work, 'deck-media');
    const dk = makeDeck(d, CONF);
    const A = path.join(d, 'attachments');
    fs.writeFileSync(path.join(A, 'song.mp3'), Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00'));
    fs.writeFileSync(path.join(A, 'clip.MOV'), Buffer.alloc(32));
    fs.writeFileSync(path.join(A, 'hidden-audio.txt'), Buffer.concat([Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt '), Buffer.alloc(16)]));
    fs.writeFileSync(path.join(A, 'movie.png'), Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(20)]));
    const r = await buildPortable(dk, { out: path.join(work, 'media.html') });
    ok(!['song.mp3', 'clip.MOV', 'hidden-audio.txt', 'movie.png'].some((f) => 'attachments/' + f in r.files) && r.warnings.some((w) => /song\.mp3" is audio \(by its name\)/.test(w)) && r.warnings.some((w) => /clip\.MOV" is a video \(by its name\)/.test(w)) && r.warnings.some((w) => /hidden-audio\.txt" is audio \(by its content\)/.test(w)) && r.warnings.some((w) => /movie\.png" is a video \(by its content\)/.test(w)) && 'attachments/paper.pdf' in r.files,
      'media: audio and video files are left out by name and by content, with a warning: ' + r.warnings.filter((w) => /audio|video/.test(w)).join(' | '));
    const B = (...x) => new Uint8Array(x.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])));
    const yes = { mp3frame: B(0xff, 0xfb, 0x90, 0x44), adts: B(0xff, 0xf1, 0x50, 0x80), ogg: B('OggS', 0, 2), opus: B('OggS', 0, 2, ...new Array(20).fill(0), 'OpusHead'), flac: B('fLaC', 0), webm: B(0x1a, 0x45, 0xdf, 0xa3, 0), m4a: B(0, 0, 0, 0x20, 'ftypM4A ', 0), mov: B(0, 0, 0, 0x14, 'ftypqt  ', 0), mdat: B(0, 0, 0, 8, 'mdat'), aiff: B('FORM', 0, 0, 0, 0, 'AIFF') };
    const no = { webp: B('RIFF', 0, 0, 0, 0, 'WEBPVP8 '), heic: B(0, 0, 0, 0x18, 'ftypheic', 0), avif: B(0, 0, 0, 0x1c, 'ftypavif', 0), utf16: B(0xff, 0xfe, 0x41, 0), png: B(0x89, 'PNG\r\n', 0x1a, 0x0a), pdf: B('%PDF-1.7'), jpeg: B(0xff, 0xd8, 0xff, 0xe0), csv: B('x,y\n1,2\n'), empty: B() };
    const wrongYes = Object.entries(yes).filter(([, b]) => !sniffMedia(b)).map(([k]) => k), wrongNo = Object.entries(no).filter(([, b]) => sniffMedia(b)).map(([k]) => k);
    ok(!wrongYes.length && !wrongNo.length, `media: sniffing finds MP3, AAC, Ogg/Opus, FLAC, WebM, M4A, MOV, AIFF and not WebP, HEIF/AVIF, UTF-16 text, PNG, PDF, JPEG, CSV (missed: ${wrongYes}; false: ${wrongNo})`);
    const rc = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), dk, '--json'], { encoding: 'utf8' });
    const jc = JSON.parse(rc.stdout);
    const mc = jc.results.filter((x) => x.code === 'attachMedia' && x.sev === 'error').map((x) => x.data.path).sort().join();
    ok(mc === 'attachments/clip.MOV,attachments/hidden-audio.txt,attachments/movie.png,attachments/song.mp3', 'checker: audio and video attachments (by name and content) are errors (§3.8 MUST NOT): ' + mc);
  }
  const plan = planAttachments([{ path: 'attachments/.secret', size: 1 }, { path: 'attachments/a.bak', size: 1 }, { path: 'attachments/CON.txt', size: 1 }, { path: 'attachments/ok.txt', size: 1 }],
    { [KEY]: [{ path: 'attachments/../deck.html', role: 'pdf' }, { path: 'deck.html', role: 'pdf' }, { path: 'attachments/ok.txt', role: 'slides' }, { path: 'attachments/OK.txt', role: 'data' }] });
  const codes = plan.problems.map((x) => x.code + ':' + (x.path || ''));
  ok(plan.include.join() === 'attachments/ok.txt' && plan.list.length === 0 && ['attachBadName:attachments/../deck.html', 'attachBadName:deck.html', 'attachBadRole:attachments/ok.txt', 'attachDuplicate:attachments/OK.txt', 'attachExcluded:attachments/.secret', 'attachExcluded:attachments/a.bak', 'attachBadName:attachments/CON.txt'].every((c) => codes.includes(c)),
    'names: path traversal, outside attachments/, hidden and backup files, reserved names, case-folded duplicates and bad roles are refused: ' + codes.join(' '));
  // シンボリックリンクはたどらない（中身が外のファイルでも入れない）
  const d2 = path.join(work, 'deck-link');
  const deck2 = makeDeck(d2, CONF);
  let linked = false;
  try { fs.symlinkSync(path.join(ROOT, 'package.json'), path.join(d2, 'attachments', 'leak.json')); linked = true; } catch { /* Windows など */ }
  if (linked) { const r = await buildPortable(deck2, { out: path.join(work, 'link.html') }); ok(!('attachments/leak.json' in r.files), 'names: a symbolic link in attachments/ is not followed'); }
}

// ---------------------------------------------------------------- 4A. 役割ごとの型と中身（§3.8。kit/core/attach-content.mjs）：その場で作った入力で
{
  const rows = [];
  const lv = async (name, bytes) => (await inspectAttachment('attachments/' + name, Buffer.from(bytes))).problems;
  const sig = (ps) => ps.map((x) => `${x.level}:${x.code}${x.what ? ':' + x.what : x.kind ? ':' + x.kind : x.also ? ':' + x.also : ''}`).sort().join(' ');
  const expect = async (label, name, bytes, want) => { const got = sig(await lv(name, bytes)); rows.push([label, got === want, got, want]); };
  // pdf・supplement の PDF
  await expect('pdf: plain PDF (destination OpenAction, /JS and /AA only inside strings and streams)', 'paper.pdf', F.PDF_OK(), '');
  await expect('pdf: OpenAction that only goes to a page (/S /GoTo, as hyperref writes it)', 'a.pdf', F.PDF_OPENACTION_GOTO(), '');
  await expect('pdf: OpenAction to a destination object', 'a.pdf', F.PDF_OPENACTION_DEST_REF(), '');
  await expect('pdf: GoTo OpenAction inside a compressed object stream', 'a.pdf', F.PDF_OBJSTM_GOTO(), '');
  await expect('pdf: JavaScript action', 'a.pdf', F.PDF_JS(), 'must:attachUnsafe:javascript should:attachUnsafe:auto-action');
  await expect('pdf: JavaScript with #xx-escaped names (/J#61vaScript)', 'a.pdf', F.PDF_JS_HEX(), 'must:attachUnsafe:javascript should:attachUnsafe:auto-action');
  await expect('pdf: JavaScript hidden in a compressed object stream', 'a.pdf', F.PDF_OBJSTM_JS(), 'must:attachUnsafe:javascript should:attachUnsafe:auto-action');
  await expect('pdf: OpenAction that opens a URL', 'a.pdf', F.PDF_OPENACTION_URI(), 'should:attachUnsafe:auto-action');
  await expect('pdf: additional actions (/AA)', 'a.pdf', F.PDF_AA(), 'should:attachUnsafe:auto-action');
  await expect('pdf: Launch action', 'a.pdf', F.PDF_LAUNCH(), 'should:attachUnsafe:launch');
  await expect('pdf: /AA that only goes to a destination (/S /GoTo)', 'a.pdf', F.PDF_AA_GOTO(), '');
  await expect('pdf: /AA through references to a GoTo action', 'a.pdf', F.PDF_AA_GOTO_REF(), '');
  await expect('pdf: /AA with a GoTo and a Named action', 'a.pdf', F.PDF_AA_MIXED(), 'should:attachUnsafe:action should:attachUnsafe:auto-action');
  await expect('pdf: OpenAction GoTo with /Next', 'a.pdf', F.PDF_OPENACTION_NEXT(), 'should:attachUnsafe:auto-action');
  await expect('pdf: link annotations GoTo and URI (hyperref)', 'a.pdf', F.PDF_LINKS_OK(), '');
  for (const t of ['GoToR', 'GoToE', 'SubmitForm', 'ImportData', 'Rendition', 'Named', 'ResetForm'])
    await expect(`pdf: link annotation with a ${t} action`, 'a.pdf', F.PDF_LINK_ACTION(t), 'should:attachUnsafe:action');
  await expect('pdf: a GoToR action with an #xx-escaped name (/G#6FToR)', 'a.pdf', F.PDF_LINK_ACTION('G#6FToR'), 'should:attachUnsafe:action');
  await expect('pdf: page labels and structure /S values are not actions', 'a.pdf', F.PDF_S_NOT_ACTION(), '');
  await expect('pdf: encrypted with a user password, no object streams (cannot be checked)', 'a.pdf', F.PDF_ENCRYPTED({ password: 'secret', objStm: false }), 'should:attachUnchecked');
  await expect('pdf: encrypted with an empty user password, no object streams', 'a.pdf', F.PDF_ENCRYPTED({ objStm: false }), '');
  await expect('pdf: embedded files', 'a.pdf', F.PDF_EMBEDDED(), 'should:attachUnsafe:embedded-file');
  await expect('pdf: object stream that decompresses past the limit (decompression bomb)', 'a.pdf', F.PDF_OBJSTM_BOMB(), 'should:attachUnchecked');
  await expect('pdf: encrypted (R 4, AES-128) with an empty user password: object streams are decrypted and checked', 'a.pdf', F.PDF_ENCRYPTED(), '');
  await expect('pdf: encrypted (R 4, AES-128), JavaScript in an encrypted object stream', 'a.pdf', F.PDF_ENCRYPTED({ js: true }), 'must:attachUnsafe:javascript should:attachUnsafe:auto-action');
  await expect('pdf: encrypted (R 4, RC4), JavaScript in an encrypted object stream', 'a.pdf', F.PDF_ENCRYPTED({ js: true, aes: false }), 'must:attachUnsafe:javascript should:attachUnsafe:auto-action');
  await expect('pdf: encrypted (R 6, AES-256) with an empty user password', 'a.pdf', F.PDF_ENCRYPTED_R6(), '');
  await expect('pdf: encrypted (R 6, AES-256), JavaScript in an encrypted object stream', 'a.pdf', F.PDF_ENCRYPTED_R6({ js: true }), 'must:attachUnsafe:javascript should:attachUnsafe:auto-action');
  await expect('pdf: encrypted with a user password (cannot be checked)', 'a.pdf', F.PDF_ENCRYPTED({ password: 'secret' }), 'should:attachUnchecked');
  await expect('polyglot: PDF with a ZIP appended', 'a.pdf', Buffer.concat([F.PDF_OK(), F.zip([['a.txt', 'hi']])]), 'must:attachPolyglot:ZIP');
  await expect('renamed executable: a Windows PE named .pdf', 'a.pdf', F.EXE(), 'must:attachForbidden:executable');
  await expect('mismatch: text named .pdf', 'a.pdf', 'hello', 'should:attachMismatch:pdf');
  // data
  await expect('data: CSV', 'd.csv', 'x,y\n1,-2\n-3.5,+4\n', '');
  await expect('data: CSV in Shift_JIS', 'd.csv', Buffer.from([0x82, 0xa0, 0x2c, 0x31, 0x0a]), '');
  await expect('data: CSV with formula injection (= + - @, a tab) is a warning only', 'd.csv', 'x,y\n"=cmd|\' /C calc\'!A0",3\n@SUM(1),-x\n', 'advice:attachInjection');
  await expect('data: TSV with formula injection', 'd.tsv', 'a\t=1+1\n', 'advice:attachInjection');
  await expect('data: JSON', 'd.json', '{"a": [1, 2]}', '');
  await expect('data: broken JSON', 'd.json', '{"a": ', 'should:attachMismatch:json');
  await expect('data: xlsx', 'd.xlsx', F.xlsx(), '');
  await expect('data: xlsx with macros (vbaProject.bin, macro-enabled type)', 'd.xlsx', F.xlsx({ macro: true }), 'must:attachUnsafe:macro');
  await expect('data: xlsx with an external link', 'd.xlsx', F.xlsx({ externalLink: true }), 'should:attachUnsafe:external-link');
  await expect('data: xlsx with a DDE formula', 'd.xlsx', F.xlsx({ dde: true }), 'should:attachUnsafe:dde');
  await expect('data: xlsx with WEBSERVICE()', 'd.xlsx', F.xlsx({ webservice: true }), 'should:attachUnsafe:external-data');
  await expect('data: xlsx with ActiveX', 'd.xlsx', F.xlsx({ activeX: true }), 'should:attachUnsafe:activex');
  await expect('data: xlsx with an embedded OLE object', 'd.xlsx', F.xlsx({ ole: true }), 'should:attachUnsafe:embedded-object');
  await expect('data: xlsx with a string that starts with = (formula injection) is a warning only', 'd.xlsx', F.xlsx({ injection: true }), 'advice:attachInjection');
  await expect('zip bomb: an entry declared over the limit', 'd.xlsx', F.ZIP_BOMB_DECLARED(), 'should:attachUnchecked');
  await expect('zip bomb: an entry compressed more than 200 times', 'd.xlsx', F.ZIP_BOMB_RATIO(), 'should:attachUnchecked');
  await expect('zip bomb: an entry that decompresses past its declared size', 'd.xlsx', F.ZIP_BOMB_LIE(), 'should:attachMismatch:xlsx');
  await expect('zip bomb: entries that overlap', 'd.xlsx', F.ZIP_OVERLAP(), 'should:attachMismatch:xlsx');
  await expect('legacy Office: an OLE document named .xlsx', 'd.xlsx', F.OLE(), 'must:attachForbidden:office-legacy');
  await expect('container: a ZIP named .csv', 'd.csv', F.zip([['a', 'b']]), 'must:attachForbidden:archive');
  // code
  await expect('code: Python source', 'run.py', 'print(1)\n', '');
  await expect('code: notebook', 'n.ipynb', '{"cells": [], "nbformat": 4, "nbformat_minor": 5, "metadata": {}}', '');
  await expect('code: a notebook that is not one', 'n.ipynb', '{}', 'should:attachMismatch:ipynb');
  await expect('code: environment definitions (pyproject.toml, Dockerfile)', 'pyproject.toml', '[project]\nname = "x"\n', '');
  await expect('code: a credential in the source is a warning only', 'k.py', 'KEY = "sk-ant-abcdefghijklmnopqrstuvwxyz0123"\n', 'advice:attachPrivate:access key');
  await expect('renamed executable: an ELF named .py', 'run.py', F.ELF(), 'must:attachForbidden:executable');
  await expect('renamed executable: a Mach-O named .txt', 'a.txt', F.MACHO(), 'must:attachForbidden:executable');
  await expect('WebAssembly named .txt', 'a.txt', F.WASM(), 'must:attachForbidden:wasm');
  // source
  await expect('source: TeX', 'paper.tex', '\\documentclass{article}\n', '');
  await expect('source: Markdown', 'notes.md', '# Notes\n', '');
  await expect('source: docx (with a hyperlink field and an external hyperlink)', 'paper.docx', F.docx({ hyperlinkField: true }), '');
  await expect('source: docx with macros', 'paper.docx', F.docx({ macro: true }), 'must:attachUnsafe:macro');
  await expect('source: docx with a DDEAUTO field', 'paper.docx', F.docx({ dde: true }), 'should:attachUnsafe:field-code');
  await expect('source: docx with an INCLUDETEXT field', 'paper.docx', F.docx({ includeText: true }), 'should:attachUnsafe:field-code');
  await expect('source: docx whose field name comes from a nested field', 'paper.docx', F.docx({ nested: true }), 'should:attachUnsafe:field-code');
  await expect('source: docx with a remote template', 'paper.docx', F.docx({ template: true }), 'should:attachUnsafe:remote-template');
  await expect('polyglot: docx with HTML after the ZIP', 'paper.docx', F.docx({ zip: { suffix: Buffer.from('<html><script>x</script>') } }), 'must:attachPolyglot:data after the ZIP end record');
  await expect('polyglot: docx with data before the ZIP', 'paper.docx', F.docx({ zip: { prefix: Buffer.from('%PDF-1.7\n') } }), 'should:attachMismatch:docx');
  await expect('HTML in a .txt', 'note.txt', EVIL, 'must:attachForbidden:html');
  await expect('SVG in a .md', 'note.md', '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>', 'must:attachForbidden:svg');
  // supplement
  await expect('supplement: PNG, JPEG, WebP', 'a.png', F.PNG(), '');
  await expect('supplement: JPEG', 'a.jpg', F.JPEG(), '');
  await expect('supplement: WebP', 'a.webp', F.WEBP(), '');
  await expect('polyglot: PNG with a PDF header in its first KiB', 'a.png', Buffer.concat([F.PNG(), Buffer.from('%PDF-1.4')]), 'must:attachPolyglot:PDF');
  await expect('mismatch: a JPEG named .png', 'a.png', F.JPEG(), 'should:attachMismatch:png');
  await expect('renamed executable: a Windows PE named .png', 'a.png', F.EXE(), 'must:attachForbidden:executable');
  // 名前から許されないもの
  // §3.8 の code の条件の拡張子（OS が既定で実行する・スクリプトとして開く）はちょうどこの一覧
  for (const e of 'js jse vbs vbe wsf wsh hta bat cmd com scr ps1 command app jar reg lnk'.split(' ')) await expect(`forbidden by name (script): .${e}`, 'run.' + e.toUpperCase(), 'x', 'must:attachForbidden:script');
  for (const e of ['mjs', 'cjs', 'ts', 'py']) await expect(`code: JavaScript and other source as .${e}`, 'run.' + e, 'export const x = 1;\n', '');
  for (const [n, k] of [['run.exe', 'executable'], ['run.dll', 'executable'], ['run.class', 'executable'], ['a.html', 'html'], ['a.svg', 'svg'], ['a.zip', 'archive'], ['a.7z', 'archive'], ['a.xlsm', 'office-macro'], ['a.docm', 'office-macro'], ['a.doc', 'office-legacy'], ['a.xls', 'office-legacy'], ['a.ppt', 'office-legacy'], ['b.ega.html', 'egatari'], ['a.wasm', 'wasm']])
    await expect(`forbidden by name: .${n.split('.').slice(1).join('.')}`, n, 'x', `must:attachForbidden:${k}`);
  await expect('not a §3.8 type: .gif', 'a.gif', 'GIF89a', 'must:attachType');
  await expect('not a §3.8 type: .pptx', 'a.pptx', F.zip([['a', 'b']]), 'must:attachType');
  const bad = rows.filter((r) => !r[1]);
  for (const r of bad) console.log(`    ${r[0]}: got "${r[2]}", want "${r[3]}"`);
  ok(!bad.length, `content: ${rows.length - bad.length}/${rows.length} fixtures classified as expected (allowed, warning, refused per role)`);
  // 役割と型の組
  const rp = [['pdf', 'a.csv'], ['data', 'a.pdf'], ['code', 'a.docx'], ['source', 'a.png'], ['supplement', 'a.xlsx'], ['pdf', 'a.pdf'], ['data', 'a.xlsx'], ['code', 'Dockerfile'], ['source', 'a.bib'], ['supplement', 'a.webp']].map(([r, n]) => !!roleProblem('attachments/' + n, r));
  ok(rp.join() === 'true,true,true,true,true,false,false,false,false,false', 'roles: a type is refused for a role that does not take it (csv as pdf, pdf as data, docx as code, png as source, xlsx as supplement) and accepted otherwise');
  // 書き出し：役割に合わない・中身が条件に合わないものは外して、規則の名前を添えて知らせる
  const d = path.join(work, 'deck-roles');
  const dk = makeDeck(d, { ...CONF, [KEY]: [...CONF[KEY], { path: 'attachments/js.pdf', role: 'pdf', title: 'JS' }, { path: 'attachments/table.csv', role: 'pdf', title: 'CSV as PDF' }, { path: 'attachments/macro.xlsx', role: 'data', title: 'Macro' }, { path: 'attachments/inject.csv', role: 'data', title: 'Inject' }] });
  fs.writeFileSync(path.join(d, 'attachments', 'js.pdf'), F.PDF_JS());
  fs.writeFileSync(path.join(d, 'attachments', 'table.csv'), 'a,b\n');
  fs.writeFileSync(path.join(d, 'attachments', 'macro.xlsx'), F.xlsx({ macro: true }));
  fs.writeFileSync(path.join(d, 'attachments', 'inject.csv'), 'a\n=1+1\n');
  fs.writeFileSync(path.join(d, 'attachments', 'tool.exe'), F.EXE());
  const r = await buildPortable(dk, { out: path.join(work, 'roles.html') });
  const inFiles = (n) => 'attachments/' + n in r.files;
  ok(!inFiles('js.pdf') && !inFiles('table.csv') && !inFiles('macro.xlsx') && !inFiles('tool.exe') && inFiles('inject.csv') && r.index[KEY].some((e) => e.path === 'attachments/inject.csv') &&
    r.warnings.some((w) => /js\.pdf": the PDF contains JavaScript, not allowed for attachments \(§3\.8\); not included/.test(w)) && r.warnings.some((w) => /table\.csv": a \.csv file is not allowed for the role pdf/.test(w)) &&
    r.warnings.some((w) => /macro\.xlsx": the document contains macros/.test(w)) && r.warnings.some((w) => /tool\.exe" is an executable \(by its name\)/.test(w)) && r.warnings.some((w) => /inject\.csv": 1 value\(s\) start with/.test(w)),
    'cli: a PDF with JavaScript, a CSV in the pdf role, an xlsx with macros and an .exe are skipped with a warning naming the rule; a CSV with formula injection is packed with a warning');
  const rc = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), dk, '--json', '--lang', 'en'], { encoding: 'utf8' });
  const jc = JSON.parse(rc.stdout);
  const sev = (c, p) => (jc.results.find((x) => x.code === c && x.data.path === 'attachments/' + p) || {}).sev;
  ok(sev('attachUnsafe', 'js.pdf') === 'error' && sev('attachType', 'table.csv') === 'error' && sev('attachUnsafe', 'macro.xlsx') === 'error' && sev('attachForbidden', 'tool.exe') === 'error' && sev('attachInjection', 'inject.csv') === 'warn' && sev('attachForbidden', 'evil.html') === 'error' &&
    jc.results.some((x) => x.code === 'attachUnsafe' && /§3\.8 does not allow/.test(x.msg)) && !jc.results.some((x) => x.code === 'attachMissing'),
    'checker: MUST NOT (JavaScript in a PDF, a type the role does not take, macros, executables, HTML) are errors; formula injection is a warning');
  const d3 = path.join(work, 'deck-should');
  const dk3 = makeDeck(d3, { ...CONF, [KEY]: [CONF[KEY][0], { path: 'attachments/link.xlsx', role: 'data', title: 'Linked' }, { path: 'attachments/aa.pdf', role: 'pdf', title: 'AA' }] });
  fs.rmSync(path.join(d3, 'attachments', 'evil.html'));
  fs.writeFileSync(path.join(d3, 'attachments', 'link.xlsx'), F.xlsx({ externalLink: true }));
  fs.writeFileSync(path.join(d3, 'attachments', 'aa.pdf'), F.PDF_AA());
  const j3 = JSON.parse(spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), dk3, '--json'], { encoding: 'utf8' }).stdout);
  const s3 = (p) => (j3.results.find((x) => x.code === 'attachUnsafe' && x.data.path === 'attachments/' + p) || {}).sev;
  const e3 = j3.results.filter((x) => x.sev === 'error' && /^attach/.test(x.code)).map((x) => x.code);
  ok(s3('link.xlsx') === 'warn' && s3('aa.pdf') === 'warn' && !e3.length, 'checker: SHOULD conditions (an external link in xlsx, /AA in a PDF) are warnings: ' + JSON.stringify({ link: s3('link.xlsx'), aa: s3('aa.pdf'), errors: e3 }));
}

// ---------------------------------------------------------------- 5. 品質チェック
{
  const d = path.join(work, 'deck-check');
  const deck = makeDeck(d, { ...CONF, [KEY]: [...CONF[KEY], { path: 'attachments/missing.zip', role: 'code' }, { path: 'attachments/../x', role: 'pdf' }, { path: 'attachments/code/run.py', role: 'slides' }, { path: 'attachments/notitle.txt', role: 'supplement' }] });
  fs.writeFileSync(path.join(d, 'attachments', '.hidden'), 'x');
  fs.writeFileSync(path.join(d, 'attachments', 'norole.txt'), 'x');
  fs.writeFileSync(path.join(d, 'attachments', 'notitle.txt'), 'x');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), deck, '--json'], { encoding: 'utf8' });
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* 下で落ちる */ }
  const codes = j ? j.results.filter((x) => /^attach/.test(x.code)).map((x) => `${x.sev}:${x.code}:${x.data.path || ''}`) : [];
  const want = ['warn:attachNoTitle:attachments/notitle.txt', 'warn:attachMissing:attachments/missing.zip', 'warn:attachBadName:attachments/../x', 'warn:attachBadRole:attachments/code/run.py', 'warn:attachExcluded:attachments/.hidden', 'warn:attachNoRole:attachments/norole.txt', 'info:attachList:'];
  ok(!!j && want.every((w) => codes.includes(w)), 'checker: missing file, bad name, bad role, hidden file, missing role and missing title are warnings; a summary is info: ' + codes.join(' '));
  const big = path.join(work, 'deck-big');
  const deckB = makeDeck(big, CONF);
  fs.writeFileSync(path.join(big, 'attachments', 'huge.txt'), Buffer.alloc(ATTACH_LIMITS.fileBytes + 1, 0x41));
  const rb = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), deckB, '--json', '--lang', 'en'], { encoding: 'utf8' });
  const jb = JSON.parse(rb.stdout);
  ok(jb.results.some((x) => x.code === 'attachTooLarge' && x.sev === 'warn' && /too large/.test(x.msg)), 'checker: an oversize attachment is a warning (English message)');
}

// ---------------------------------------------------------------- 6. 段 A
const HTML = fs.readFileSync(OUT, 'utf8');
{
  const p = await readPortable(HTML);
  const files = new Map(Object.entries(p.files));
  files.delete('attachments/notes.txt');
  files.set('attachments/slides.md', enc.encode('# notes\n'));
  const conf = JSON.parse(dec.decode(files.get(CFG)));
  conf[KEY] = [{ path: 'attachments/paper.pdf', role: 'pdf', title: 'The paper', description: 'The journal version.' }, { path: 'attachments/data.csv', role: 'data', title: 'Data', note: 'kept unknown member' }, { path: 'attachments/slides.md', role: 'source', title: 'Notes' }, { path: 'attachments/code/run.py', role: 'code' }];
  files.set(CFG, enc.encode(JSON.stringify(conf, null, 2) + '\n'));
  const a = await tierA(HTML, files);
  ok(a.ok, 'tier A: adding, removing, retitling and describing attachments is a tier A edit' + (a.ok ? '' : ` (${a.code}: ${a.reason})`));
  if (a.ok) {
    let diffOk = true; try { regionDiff(HTML, a.html); } catch (e) { diffOk = false; console.log('    ' + e.message); }
    ok(diffOk, 'tier A: only the index, the chunks and deck-meta.sourceSha256 change (region-aware diff)');
    const b = await readPortable(a.html);
    ok(b.sourceMatches && !('attachments/notes.txt' in b.files) && dec.decode(b.files['attachments/slides.md']) === '# notes\n' && b.index[KEY].map((e) => e.path + '=' + e.role + (e.title ? '/' + e.title : '')).join() === 'attachments/paper.pdf=pdf/The paper,attachments/data.csv=data/Data,attachments/slides.md=source/Notes' && b.index[KEY][1].note === 'kept unknown member' && b.index[KEY][0].description === 'The journal version.',
      'tier A: the saved file reads back with the new files and list (description, unknown members kept)');
    const sc = JSON.parse(dec.decode(b.files[CFG]));
    ok(typeof a.config === 'string' && JSON.stringify(sc[KEY]) === JSON.stringify(b.index[KEY]) && JSON.parse(a.config)[KEY].length === 3, `tier A: the saved ${CFG} lists exactly index.attachments (the entry without a role is left out) and the result carries it (config) for the workspace`);
  }
  // スライドの原稿が書いている添付を替えたら組み直す
  const p2files = new Map(Object.entries(p.files));
  const refDeck = makeDeck(path.join(work, 'deck-ref'), CONF);
  fs.writeFileSync(refDeck, fs.readFileSync(refDeck, 'utf8').replace('</section>', '<p><a href="attachments/data.csv">data</a></p></section>'));
  const ref = await buildPortable(refDeck, { out: path.join(work, 'ref.html') });
  const rf = await readPortable(ref.html);
  const m = new Map(Object.entries(rf.files)); m.set('attachments/data.csv', enc.encode('changed\n'));
  const a2 = await tierA(ref.html, m);
  ok(!a2.ok && a2.code === 'source-changed' && /refers to the changed attachment/.test(a2.reason), 'tier A: changing an attachment the slide source mentions needs a rebuild');
  const m3 = new Map(p2files); m3.set('attachments/big.txt', new Uint8Array(ATTACH_LIMITS.fileBytes + 1).fill(0x41));
  const a3 = await tierA(HTML, m3);
  ok(!a3.ok && a3.code === 'attachments', 'tier A: an attachment over the limit is refused');
  const m4 = new Map(p2files); m4.set('attachments/voice.txt', new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]));
  const a4 = await tierA(HTML, m4);
  ok(!a4.ok && a4.code === 'attachments' && /audio/.test(a4.reason), 'tier A: an audio attachment (by content) is refused: ' + a4.reason);
  // §3.8 の型と条件：書き出しと同じく断る（足した HTML・JavaScript のある PDF・役割に合わない型に替えた役割）
  const m5 = new Map(p2files); m5.set('attachments/handout.html', enc.encode(EVIL));
  const a5 = await tierA(HTML, m5);
  ok(!a5.ok && a5.code === 'attachments' && /HTML \(by its name\), which must not be attached \(§3\.8\)/.test(a5.reason), 'tier A: adding an .html attachment is refused, naming the rule: ' + a5.reason);
  const m6 = new Map(p2files); m6.set('attachments/js.pdf', F.PDF_JS());
  const a6 = await tierA(HTML, m6);
  ok(!a6.ok && a6.code === 'attachments' && /JavaScript/.test(a6.reason), 'tier A: adding a PDF with JavaScript is refused: ' + a6.reason);
  const m7 = new Map(p2files);
  const c7 = JSON.parse(dec.decode(m7.get(CFG))); c7[KEY] = c7[KEY].map((e) => (e.path === 'attachments/data.csv' ? { ...e, role: 'pdf' } : e));
  m7.set(CFG, enc.encode(JSON.stringify(c7, null, 2) + '\n'));
  const a7 = await tierA(HTML, m7);
  ok(!a7.ok && a7.code === 'attachments' && /not allowed for the role pdf/.test(a7.reason), 'tier A: changing the role to one that does not take the type is refused: ' + a7.reason);
}

// ---------------------------------------------------------------- 7. 再生器
// 1 ファイルに、書き出しを通さずに添付を足す（ほかの書き手・手で作った文書）：塊を索引の前に足し、索引を書き換える（data-sha256 も）
async function craft(html, adds) {
  const ix = JSON.parse(scanDocument(html).byId.get(FORMAT.INDEX_ID).text);
  let chunks = '';
  adds.forEach((a, i) => {
    const id = 'craft' + i, b = Buffer.from(a.bytes);
    ix.files[a.path] = id;
    ix.blobs[id] = { mime: a.mime, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex'), chunks: [`${FORMAT.BLOB_PREFIX}${id}-0`] };
    ix[KEY].push({ path: a.path, role: a.role, title: a.title, ...(a.description !== undefined ? { description: a.description } : {}) });
    chunks += `<script type="application/octet-stream" id="${FORMAT.BLOB_PREFIX}${id}-0">${b.toString('base64')}</script>\n`;
  });
  const out = await replaceIndexText(html, JSON.stringify(ix));
  const at = out.indexOf(`<script type="${FORMAT.MIME}" id="${FORMAT.INDEX_ID}"`);
  return out.slice(0, at) + chunks + out.slice(at);
}
const browser = await launch();
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, locale: 'ja-JP' });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(fileUrl(OUT));
  await pg.waitForFunction(() => document.querySelector('#dt-cb [data-b="attach"]'), null, { timeout: 15000 });
  ok((await pg.getAttribute('#dt-cb [data-b="attach"]', 'aria-label')) === '添付ファイル（3）', 'player: the bar has an attachments button with the count');
  await pg.mouse.move(640, 760);
  await pg.click('#dt-cb [data-b="attach"]');
  await pg.waitForSelector('#dt-help.show [data-att]');
  const rows = await pg.$$eval('#dt-help .dt-att li', (xs) => xs.map((x) => x.textContent));
  ok(rows.length === 3 && /Paper \(PDF\)/.test(rows[0]) && /paper\.pdf · PDF/.test(rows[0]) && /Notes/.test(rows[1]) && /補足資料/.test(rows[1]) && /data\.csv/.test(rows[2]) && /データ/.test(rows[2]), 'player: ? lists the attachments (title, file name, role, size): ' + JSON.stringify(rows));
  ok((await pg.$$eval('#dt-help .dt-att .dt-att-d', (xs) => xs.map((x) => x.textContent))).join() === 'Read this first.', 'player: the description is shown under the title');
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'player-attachments.png') });
  const url0 = pg.url(), n0 = ctx.pages().length;
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#dt-help [data-att="1"]')]);
  ok(dl.suggestedFilename() === 'notes.txt' && fs.readFileSync(await dl.path(), 'utf8') === 'plain notes\n', 'player: the text attachment is saved as a file with its exact bytes');
  const [dl2] = await Promise.all([pg.waitForEvent('download'), pg.click('#dt-help [data-att="0"]')]);
  ok(Buffer.from(fs.readFileSync(await dl2.path())).equals(PDF) && pg.url() === url0 && ctx.pages().length === n0, 'player: the PDF is saved, not opened in the page or a new tab');
  ok(errs.length === 0, 'player: no console errors ' + JSON.stringify(errs));
  await ctx.close();
  // 書き出しを通さずに索引に書いた添付：§3.8 の型でないもの（.html）・役割が受けない型（CSV を pdf に）は出さない。
  // 型は合うが中身が HTML の .txt は出すが、保存の前に中身の印で断る（ページは動かず、新しいタブもなく、スクリプトは動かない）
  const crafted = await craft(HTML, [
    { path: 'attachments/evil.html', bytes: EVIL, mime: 'text/html', role: 'supplement', title: 'Evil (HTML)' },
    { path: 'attachments/table.csv', bytes: 'a,b\n', mime: 'text/csv', role: 'pdf', title: 'CSV as PDF' },
    { path: 'attachments/fake.txt', bytes: EVIL, mime: 'text/plain', role: 'supplement', title: 'Fake text' },
    // §3.8：題は 120 字まで・1 行（Schema）。拡張子と媒体型が合わない・OS が実行する拡張子は出さない。題の字は符号位置で数え、説明が長ければ説明だけ落とす
    { path: 'attachments/long.txt', bytes: 'x\n', mime: 'text/plain', role: 'supplement', title: 'L'.repeat(121) },
    { path: 'attachments/nl.txt', bytes: 'x\n', mime: 'text/plain', role: 'supplement', title: 'Two\nlines' },
    { path: 'attachments/run.js', bytes: 'alert(1)\n', mime: 'text/plain', role: 'code', title: 'Script' },
    { path: 'attachments/mime.csv', bytes: 'a,b\n', mime: 'text/plain', role: 'data', title: 'CSV as text/plain' },
    { path: 'attachments/tool.mjs', bytes: 'export const x = 1;\n', mime: 'text/plain', role: 'code', title: '\u{1F600}'.repeat(120), description: 'd'.repeat(301) },
  ]);
  fs.writeFileSync(path.join(work, 'crafted.html'), crafted);
  const c1 = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, locale: 'en-US' });
  const p1 = await c1.newPage();
  let dls = 0; p1.on('download', () => dls++);
  await p1.goto(fileUrl(path.join(work, 'crafted.html')));
  await p1.waitForFunction(() => document.querySelector('#dt-cb [data-b="attach"]'), null, { timeout: 15000 });
  await p1.evaluate(() => DECK.tools.help(true));
  const crows = await p1.$$eval('#dt-help .dt-att li', (xs) => xs.map((x) => x.textContent));
  ok(crows.length === 5 && !crows.some((r) => /evil\.html|CSV as PDF|long\.txt|nl\.txt|run\.js|mime\.csv/.test(r)) && /fake\.txt/.test(crows[3]) && /tool\.mjs/.test(crows[4]),
    'player: an .html attachment, a CSV listed as pdf, a title over 120 characters or with a line break, a .js file and a .csv with the media type text/plain are not offered, even when the index lists them: ' + JSON.stringify(crows));
  const notes = await p1.$$eval('#dt-help .dt-att li', (xs) => xs.map((x) => (x.querySelector('.dt-att-w') || {}).textContent || ''));
  ok(/^(?:Run code only if you trust its source|出どころを信頼できるときだけ、コードを実行してください)$/.test(notes[4]) && notes.slice(0, 4).every((t) => !t) && !(await p1.$$eval('#dt-help .dt-att li', (xs) => xs[4].querySelector('.dt-att-d'))),
    'player: a code attachment carries the note to run code only from a trusted source (others do not); a 120-character title of emoji is offered, a 301-character description is not shown: ' + JSON.stringify(notes));
  const u1 = p1.url(), np1 = c1.pages().length;
  await p1.click('#dt-help [data-att="3"]');
  await p1.waitForTimeout(800);
  ok(dls === 0 && /does not match its type|中身が形式と合わない/.test(await p1.textContent('#dt-help .dt-att-note')) && p1.url() === u1 && c1.pages().length === np1 && !(await p1.evaluate(() => window.__PWNED || null)) && (await p1.evaluate(() => { try { return localStorage.getItem('pwned'); } catch { return null; } })) === null,
    'player: a .txt whose content is HTML is not saved (content check); nothing navigates, opens or runs');
  await c1.close();
  // 壊れた添付（塊の中身を替えた）は保存しない。索引の hash は合っている
  const p = await readPortable(HTML);
  const id = p.index.files['attachments/data.csv'];
  const sc = scanDocument(HTML).byId.get(`${FORMAT.BLOB_PREFIX}${id}-0`);
  const bad = HTML.slice(0, sc.start) + HTML.slice(sc.start, sc.end).replace(/>[A-Za-z0-9+/=]+</, '>' + Buffer.from('x,y\n9,9\n9,9\n').toString('base64') + '<') + HTML.slice(sc.end);
  fs.writeFileSync(path.join(work, 'bad.html'), bad);
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const p2 = await c2.newPage();
  let downloads = 0; p2.on('download', () => downloads++);
  await p2.goto(fileUrl(path.join(work, 'bad.html')));
  await p2.waitForFunction(() => document.querySelector('#dt-cb [data-b="attach"]'), null, { timeout: 15000 });
  await p2.evaluate(() => DECK.tools.help(true));
  await p2.click('#dt-help [data-att="2"]');
  await p2.waitForTimeout(800);
  ok(downloads === 0 && /Corrupt|壊れている/.test(await p2.textContent('#dt-help .dt-att-note')), 'player: a corrupt attachment (sha256 mismatch) is not saved');
  // 再生専用・組んだ HTML：出ない
  for (const f of [path.join(work, 'p' + FORMAT.PLAY_EXT)]) {
    await p2.goto(fileUrl(f));
    await p2.waitForFunction(() => document.getElementById('dt-cb'), null, { timeout: 15000 });
    await p2.waitForTimeout(500);
    ok(!(await p2.$('#dt-cb [data-b="attach"]')), 'player: a play-only file shows no attachments');
  }
  await c2.close();
}

// ---------------------------------------------------------------- 8. 編集アプリ
{
  const DIST = path.join(work, 'dist');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'inherit' });
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}/`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(BASE + '?lang=ja');
  await page.waitForSelector('#drop');
  const st = () => page.evaluate(() => window.__APP_TEST.state());
  const toastText = async () => (await page.textContent('#toast')) || '';
  const waitIdle = async () => { await page.waitForFunction(() => !document.querySelector('#dlg[open]') && !window.__APP_TEST.attachBusy() && document.getElementById('attach-list'), null, { timeout: 30000 }); await page.waitForTimeout(200); };
  const rowsOf = () => page.$$eval('#attach-list .attach-row', (xs) => xs.map((x) => x.getAttribute('data-attach')));
  // 1 ファイル（OPFS のハンドル）
  await page.evaluate(async (b64) => {
    const root = await navigator.storage.getDirectory();
    const h = await root.getFileHandle('att' + '.ega.html', { create: true });
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const w = await h.createWritable(); await w.write(u); await w.close();
    window.__ph = h; window.__APP_TEST.saveHandle = h;
  }, Buffer.from(HTML).toString('base64'));
  await page.evaluate(() => window.__APP_TEST.openFile({ handle: window.__ph }));
  await page.waitForFunction(() => window.__APP_TEST.state().loads > 0, null, { timeout: 30000 });
  // 添付は「ファイル ▾」→「教材の情報…」の中（ui-redesign：道具の列の「添付」はない）
  ok(!(await page.$('#b-attach')) && (await page.textContent('#b-info')) === '教材の情報…', 'editor: attachments are under File ▾ → 教材の情報… (no toolbar button)');
  await clickCommand(page, '#b-info');
  await page.waitForSelector('#attach-list');
  ok((await page.textContent('#panel-title')) === '教材の情報' && /試行/.test(await page.textContent('#panel-body .info-h')) && !!(await page.$('#info-list')), 'editor: Lesson info shows title/license/creators, then the attachments marked experimental (試行)');
  ok((await page.$$eval('#info-list dt', (x) => x.map((e) => e.textContent))).slice(0, 3).join() === '題名,ライセンス,作り手', 'editor: Lesson info lists the title, the license and the creators');
  ok((await rowsOf()).join() === 'attachments/code/run.py,attachments/data.csv,attachments/notes.txt,attachments/paper.pdf', 'editor: the side panel lists the attachments of the single file');
  ok((await page.$eval('[data-attach-role="attachments/paper.pdf"]', (x) => x.value)) === 'pdf' && (await page.$eval('[data-attach-title="attachments/paper.pdf"]', (x) => x.value)) === 'Paper (PDF)' && (await page.$eval('[data-attach-role="attachments/code/run.py"]', (x) => x.value)) === '',
    'editor: role and title come from egatari.json (no role: empty)');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'editor-attachments.png') });
  // 足す（最初の書き込みの前に権利の確認）
  // 音声・動画は断る（拡張子なら題を尋ねる前、中身なら読んだ後・書く前）
  await page.setInputFiles('#attach-file', { name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3\x03\x00') });
  await page.waitForTimeout(400);
  ok(/音声/.test(await toastText()) && !(await page.$('#dlg[open]')) && !(await rowsOf()).includes('attachments/song.mp3'), 'editor: an audio file is refused by its name (before the title prompt)');
  // 題（要る）：ファイル名から埋めておき、直せる。そのあと権利の確認
  await page.setInputFiles('#attach-file', { name: 'slides.tex', mimeType: 'text/x-tex', buffer: Buffer.from('\\documentclass{article}\n') });
  await page.waitForSelector('#dlg[open] #attach-new-title-0');
  const prefill = await page.inputValue('#attach-new-title-0');
  await page.fill('#attach-new-title-0', 'Slides (TeX)');
  await clickDlg(page, '#dlg-ok');
  await page.waitForFunction(() => document.querySelector('#dlg[open]') && !document.getElementById('attach-new-title-0'), null, { timeout: 15000 });
  await clickDlg(page, '#dlg-ok');
  await waitIdle();
  ok(prefill === 'slides', 'editor: adding asks for a title, prefilled from the file name: ' + prefill);
  ok((await rowsOf()).includes('attachments/slides.tex') && (await page.$eval('[data-attach-role="attachments/slides.tex"]', (x) => x.value)) === 'source' && (await page.$eval('[data-attach-title="attachments/slides.tex"]', (x) => x.value)) === 'Slides (TeX)' && (await st()).portable.dirty, 'editor: adding a file (after the rights prompt) writes attachments/slides.tex with the role guessed as source; the file is unsaved');
  // 中身が音声（名前では分からない）：読んだ後、書く前に断る
  await page.setInputFiles('#attach-file', { name: 'rec.txt', mimeType: 'text/plain', buffer: Buffer.concat([Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt '), Buffer.alloc(16)]) });
  await page.waitForSelector('#dlg[open] #attach-new-title-0');
  await clickDlg(page, '#dlg-ok');
  await waitIdle();
  ok(/音声/.test(await toastText()) && !(await rowsOf()).includes('attachments/rec.txt'), 'editor: an audio file is refused by its content');
  // §3.8 の型：名前から許されないもの（.js）は題を尋ねる前に、中身が条件に合わないもの（JavaScript のある PDF）は読んだ後・書く前に、規則を言って断る
  await page.setInputFiles('#attach-file', { name: 'tool.js', mimeType: 'text/javascript', buffer: Buffer.from('alert(1)\n') });
  await page.waitForTimeout(400);
  ok(/断りました/.test(await toastText()) && /§3\.8/.test(await toastText()) && /スクリプトとして開く/.test(await toastText()) && !(await page.$('#dlg[open]')) && !(await rowsOf()).includes('attachments/tool.js'), 'editor: a .js file is refused by its name before the title prompt, naming the rule: ' + await toastText());
  await page.setInputFiles('#attach-file', { name: 'bad.pdf', mimeType: 'application/pdf', buffer: F.PDF_JS() });
  await page.waitForSelector('#dlg[open] #attach-new-title-0');
  await clickDlg(page, '#dlg-ok');
  await waitIdle();
  ok(/断りました/.test(await toastText()) && /JavaScript/.test(await toastText()) && /§3\.8/.test(await toastText()) && !(await rowsOf()).includes('attachments/bad.pdf'), 'editor: a PDF with JavaScript is refused after reading, naming the rule: ' + await toastText());
  // 役割と型の組：CSV を pdf にはできない
  await page.selectOption('[data-attach-role="attachments/data.csv"]', 'pdf');
  await page.waitForTimeout(400);
  await waitIdle();
  ok(/断りました/.test(await toastText()) && /役割「PDF」/.test(await toastText()) && (await page.$eval('[data-attach-role="attachments/data.csv"]', (x) => x.value)) === 'data', 'editor: a role that does not take the type is refused (the role stays): ' + await toastText());
  // 説明（description）
  await page.fill('[data-attach-desc="attachments/paper.pdf"]', 'The journal version.');
  await page.press('[data-attach-desc="attachments/paper.pdf"]', 'Tab');
  await waitIdle();
  ok((await page.$eval('[data-attach-desc="attachments/paper.pdf"]', (x) => x.value)) === 'The journal version.', 'editor: a description can be written in the panel');
  // 題は消せない
  await page.fill('[data-attach-title="attachments/slides.tex"]', '');
  await page.press('[data-attach-title="attachments/slides.tex"]', 'Tab');
  await waitIdle();
  ok(/題は要ります/.test(await toastText()) && (await page.$eval('[data-attach-title="attachments/slides.tex"]', (x) => x.value)) === 'Slides (TeX)', 'editor: a title cannot be cleared');
  // 役割と題
  await page.selectOption('[data-attach-role="attachments/code/run.py"]', 'code');
  await waitIdle();
  await page.fill('[data-attach-title="attachments/code/run.py"]', 'Script');
  await page.press('[data-attach-title="attachments/code/run.py"]', 'Tab');
  await waitIdle();
  // 名前を替える・消す
  await clickUntil(page, '[data-attach-rename="attachments/data.csv"]', () => page.waitForSelector('#dlg[open] #attach-rename-input', { timeout: 2500 }));
  await page.waitForSelector('#dlg[open] #attach-rename-input');
  await page.fill('#attach-rename-input', 'table.csv');
  await clickDlg(page, '#dlg-ok');
  await waitIdle();
  await clickUntil(page, '[data-attach-remove="attachments/notes.txt"]', () => page.waitForSelector('#dlg[open] #attach-remove-ask', { timeout: 2500 }));
  await page.waitForSelector('#dlg[open] #attach-remove-ask');
  await clickDlg(page, '#dlg-ok');
  await waitIdle();
  ok((await rowsOf()).join() === 'attachments/code/run.py,attachments/paper.pdf,attachments/slides.tex,attachments/table.csv', 'editor: rename and remove update the list: ' + (await rowsOf()).join());
  // 不正な名前・大きすぎるもの
  await clickUntil(page, '[data-attach-rename="attachments/table.csv"]', () => page.waitForSelector('#dlg[open] #attach-rename-input', { timeout: 2500 }));
  await page.waitForSelector('#dlg[open] #attach-rename-input');
  await page.fill('#attach-rename-input', '../deck.html');
  await clickDlg(page, '#dlg-ok');
  await page.waitForTimeout(400);
  ok(/使えない名前/.test(await toastText()) && (await rowsOf()).includes('attachments/table.csv'), 'editor: a path-traversal name is refused');
  await page.setInputFiles('#attach-file', { name: 'huge.txt', mimeType: 'text/plain', buffer: Buffer.alloc(ATTACH_LIMITS.fileBytes + 1, 0x41) });
  await page.waitForTimeout(800);
  ok(/大きすぎ/.test(await toastText()) && !(await rowsOf()).includes('attachments/huge.txt'), 'editor: a file over the limit is refused before it is read');
  // 名前を替えて許されない型にする（.html）：断る
  await clickUntil(page, '[data-attach-rename="attachments/table.csv"]', () => page.waitForSelector('#dlg[open] #attach-rename-input', { timeout: 2500 }));
  await page.waitForSelector('#dlg[open] #attach-rename-input');
  await page.fill('#attach-rename-input', 'table.html');
  await clickDlg(page, '#dlg-ok');
  await page.waitForTimeout(400);
  ok(/断りました/.test(await toastText()) && (await rowsOf()).includes('attachments/table.csv'), 'editor: renaming to a forbidden type (.html) is refused');
  // 保存：段 A
  await page.evaluate(() => window.__APP_TEST.save('save'));
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
  const s1 = await st();
  ok(s1.portable.lastTier === 'A' && s1.portable.lastTierA && s1.portable.lastTierA.attachments, 'editor: Save is a tier A save (attachments only)' + JSON.stringify(s1.portable.lastRefusal));
  const saved = await page.evaluate(() => window.__APP_TEST.saved());
  let diffOk = true; try { regionDiff(HTML, saved); } catch (e) { diffOk = false; console.log('    ' + e.message); }
  ok(diffOk, 'editor: the saved file differs from the original only in the tier A regions (region-aware diff)');
  const b = await readPortable(saved);
  ok(b.index[KEY].map((e) => `${e.path}=${e.role}${e.title ? '/' + e.title : ''}`).join() === 'attachments/paper.pdf=pdf/Paper (PDF),attachments/table.csv=data/Data,attachments/slides.tex=source/Slides (TeX),attachments/code/run.py=code/Script' && !('attachments/notes.txt' in b.files) && b.index[KEY][1].note === 'kept unknown member' && b.index[KEY][0].description === 'The journal version.',
    'editor: the saved index lists the new attachments (rename keeps role and unknown members; the description is kept): ' + JSON.stringify(b.index[KEY]));
  ok(JSON.stringify(JSON.parse(dec.decode(b.files[CFG]))[KEY]) === JSON.stringify(b.index[KEY]), `editor: the saved ${CFG} lists exactly index.attachments (§3.3)`);
  // 作業フォルダ（OPFS）
  const SRC = path.dirname(DECK);
  const ff = {};
  for (const f of ['deck.html', 'narration.md', CFG]) ff[f] = fs.readFileSync(path.join(SRC, f)).toString('base64');
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('attdeck', { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('attdeck', { create: true });
    for (const [rel, b64] of Object.entries(files)) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(u); await w.close(); }
    window.__fd = d;
  }, ff);
  await page.evaluate(() => window.__APP_TEST_OPEN(window.__fd));
  await page.waitForFunction(() => window.__APP_TEST.state().kind === 'folder', null, { timeout: 30000 });
  await clickCommand(page, '#b-info');
  await page.waitForSelector('#attach-list');
  await page.setInputFiles('#attach-file', { name: 'paper.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.waitForSelector('#dlg[open] #attach-new-title-0');
  await clickDlg(page, '#dlg-ok');
  await waitIdle();
  const fread = (rel) => page.evaluate(async (rel) => { try { const parts = rel.split('/'); const n = parts.pop(); let d = window.__fd; for (const x of parts) d = await d.getDirectoryHandle(x); return await (await (await d.getFileHandle(n)).getFile()).text(); } catch { return null; } }, rel);
  const conf1 = JSON.parse(await fread(CFG));
  ok((await fread('attachments/paper.pdf')) !== null && conf1[KEY].some((e) => e.path === 'attachments/paper.pdf' && e.role === 'pdf' && e.title === 'paper') && conf1.docId === CONF.docId && conf1.metadata.license === 'CC-BY-4.0', 'editor (folder): adding writes attachments/paper.pdf and its entry into egatari.json (other members kept)');
  await clickUntil(page, '[data-attach-remove="attachments/paper.pdf"]', () => page.waitForSelector('#dlg[open] #attach-remove-ask', { timeout: 2500 }));
  await page.waitForSelector('#dlg[open] #attach-remove-ask');
  await clickDlg(page, '#dlg-ok');
  await waitIdle();
  const backups = await page.evaluate(async () => { const out = []; try { const e = await (await window.__fd.getDirectoryHandle('.cache')).getDirectoryHandle('edits'); for await (const k of e.keys()) out.push(k); } catch { /* なし */ } return out; });
  ok((await fread('attachments/paper.pdf')) === null && backups.some((n) => n.endsWith('-paper.pdf')) && !JSON.parse(await fread(CFG))[KEY].some((e) => e.path === 'attachments/paper.pdf'), 'editor (folder): removing deletes the file (backup in .cache/edits/) and its entry');
  ok(errs.length === 0, 'editor: no console errors ' + JSON.stringify(errs.slice(0, 5)));
  await ctx.close();
  srv.close();
}
await browser.close();
console.log(fails ? `attachments: ${fails} FAILED` : 'attachments: all ok');
process.exit(fails ? 1 : 0);
