// 持ち運べる形式（format spec）の文書の試験用ファイル（spec の fixtures/README.md の「Planned document fixtures」のうち入れ物のもの）を作る
//   node tools/portable-fixtures.mjs <出力のフォルダ>
// 各ファイルは <名前><FORMAT.FILE_EXT> と <名前>.expect.json（読み手がどうすべきか）。音声は JS で作る無音の WAV（TTS も ffmpeg も要らない。
// ffmpeg があれば AAC に圧縮される）。試験（tools/test-portable.mjs）が一時フォルダに作って確かめる。vendor/ には置かない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../kit/core/format.mjs';
import { scanDocument, replaceIndexText, playOnly, htmlSafeJson } from '../kit/core/portable.mjs';
import { buildPortable } from '../kit/build.mjs';

// 無音の WAV（8 kHz・モノラル・16 bit）
export function silentWav(sec) {
  const n = Math.round(8000 * sec), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

// 小さなデッキ（2 スライド、口述原稿 3 段階、音声 2 つ）を dir に作る
//   ids: スライドに id を付ける / component: 原稿のフォルダの部品（Extended） / breakout: </script> と <!-- を含む原稿 / canary: 実行されると印を付けるスクリプト
export function makeDeck(dir, { ids = true, component = false, breakout = false, canary = false } = {}) {
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  const id1 = ids ? ' id="s-intro1"' : '', id2 = ids ? ' id="s-step22"' : '';
  const h1 = ids ? '## はじめに {#s-intro1}' : '## はじめに', h2 = ids ? '## 一歩ずつ {#s-step22}' : '## 一歩ずつ';
  const k1 = ids ? 's-intro1' : 'はじめに', k2 = ids ? 's-step22' : '一歩ずつ';
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!doctype html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>試験用の小さな教材</title></head>
<body>
<div id="stage">
<section class="slide cover"${id1}><h1>はじめに</h1><p class="sub">試験用</p></section>
<section class="slide"${id2}><h2>一歩ずつ</h2><div class="body"><p data-step="1">次の段階</p>${breakout ? '<p>&lt;/script&gt; と &lt;!-- を本文に書く</p>\n<!-- comment with </script> and <!-- inside -->' : ''}${component ? '<m-hello></m-hello>' : ''}</div></section>
</div>
${canary ? '<script>window.__portableCanary = (window.__portableCanary || 0) + 1;</script>\n' : ''}</body>
</html>
`);
  fs.writeFileSync(path.join(dir, 'narration.md'), `# 口述原稿\n\n${h1}\n[0] これは試験用の教材です。\n@x-tutor-q 何の教材ですか？\n@x-tutor-q もう一つの問い\n\n${h2}\n[0] 一歩ずつ進みます。${breakout ? ' </script> と <!-- も読む。' : ''}\n[1] 次の段階です。\n`);
  if (component) {
    fs.mkdirSync(path.join(dir, 'components', 'hello'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'components', 'hello', 'index.js'), `DECK.define('m-hello', class extends HTMLElement { mount() { this.textContent = 'hello'; } render() {} });\n`);
  }
  if (breakout) fs.writeFileSync(path.join(dir, 'macros.tex'), '% </script><!-- in macros\n\\newcommand{\\R}{\\mathbb{R}}\n');
  fs.writeFileSync(path.join(dir, 'audio', 'seg_a.wav'), silentWav(0.6));
  fs.writeFileSync(path.join(dir, 'audio', 'seg_b.wav'), silentWav(0.8));
  fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ segments: {
    [`${k1}:0`]: { file: 'seg_a.wav', dur: 0.6, cues: [], engine: 'dry-run' },
    [`${k2}:0`]: { file: 'seg_b.wav', dur: 0.8, cues: [], engine: 'dry-run' },
  } }, null, 1));
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ docId: '3f2c9a8e-1b2d-4c5e-9f00-112233445566', metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', attribution: 'Test Author, Test lesson' } }, null, 2) + '\n');
  return dir;
}

// 索引を JSON の object として直し、hash を付け直す
async function editIndex(html, fn) {
  const el = scanDocument(html).byId.get(FORMAT.INDEX_ID);
  const ix = JSON.parse(el.text);
  const r = fn(ix);
  return replaceIndexText(html, typeof r === 'string' ? r : JSON.stringify(ix, null, 1));
}
const cutElement = (html, id) => { const el = scanDocument(html).byId.get(id); return html.slice(0, el.start) + html.slice(el.end); };

export async function makeFixtures(out) {
  fs.mkdirSync(out, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-fixtures-'));
  const list = [];
  const put = (name, html, expect) => {
    const file = path.join(out, name + FORMAT.FILE_EXT);
    fs.writeFileSync(file, html);
    fs.writeFileSync(path.join(out, name + '.expect.json'), JSON.stringify(expect, null, 2) + '\n');
    list.push({ name, file, expect });
  };
  const build = async (name, o) => (await buildPortable(path.join(makeDeck(path.join(work, name), o), 'deck.html'), { out: path.join(work, name, 'out.html') })).html;

  const base = await build('base', {});
  put('minimal-portable-core', base, { read: 'ok', profile: 'core', play: true });
  put('minimal-play-only', playOnly(base), { read: { error: 'no-source' }, play: true });
  put('portable-extended', await build('ext', { component: true }), { read: 'ok', profile: 'extended', play: true });
  put('legacy-heading-keys', await build('legacy', { ids: false }), { read: 'ok', audioKeys: ['はじめに:0', '一歩ずつ:0'], play: true });
  put('script-breakout', await build('breakout', { breakout: true }), { read: 'ok', identicalSource: true, play: true });
  put('canary-script', await build('canary', { canary: true }), { read: 'ok', canary: '__portableCanary', play: true });

  // 壊したもの（hash は付け直すので、狙った理由だけで断られる）
  const ix = scanDocument(base).byId.get(FORMAT.INDEX_ID);
  put('bad-index-hash', base.replace(`data-sha256="${ix.attrs['data-sha256']}"`, `data-sha256="${'0'.repeat(64)}"`), { read: { error: 'bad-index-hash' }, play: true });
  {
    const id = [...scanDocument(base).byId.keys()].find((k) => k.startsWith(FORMAT.BLOB_PREFIX));
    const el = scanDocument(base).byId.get(id);
    const t = el.text, flipped = (t[0] === 'A' ? 'B' : 'A') + t.slice(1);
    put('bad-blob-hash', base.slice(0, el.start) + base.slice(el.start, el.end).replace(t, flipped) + base.slice(el.end), { read: { error: 'bad-blob' } });
    put('missing-chunk', cutElement(base, id), { read: { error: 'missing-chunk' } });
  }
  const anyBlob = (x) => Object.values(x.files)[0];
  put('path-traversal', await editIndex(base, (x) => { x.files['../x'] = anyBlob(x); }), { read: { error: 'bad-path' } });
  put('path-reserved', await editIndex(base, (x) => { x.files['CON.txt'] = anyBlob(x); }), { read: { error: 'bad-path' } });
  put('path-case-collision', await editIndex(base, (x) => { x.files['Deck.HTML'] = anyBlob(x); }), { read: { error: 'bad-path' } });
  put('path-file-dir', await editIndex(base, (x) => { x.files['deck.html/x'] = anyBlob(x); }), { read: { error: 'bad-path' } });
  put('future-major', await editIndex(base, (x) => { x.version.major = 2; }), { read: { error: 'unsupported-version' }, extract: 'ok', play: true });
  put('manifest-in-files', await editIndex(base, (x) => { x.files['audio/manifest.json'] = Object.values(x.audio)[0] && x.files[Object.values(x.audio)[0].file]; }), { read: { error: 'bad-path' } });
  put('config-docid-mismatch', await editIndex(base, (x) => { x.docId = '00000000-0000-4000-8000-000000000000'; }), { read: { error: 'docid-mismatch' } });
  put('unknown-required-feature', await editIndex(base, (x) => { x.requires.push('something-v9'); }), { read: { error: 'unknown-feature' }, extract: { error: 'unknown-feature' }, play: true });
  put('unknown-optional-member', await editIndex(base, (x) => { x.futureMember = { kept: true }; }), { read: 'ok', preserved: 'futureMember' });
  put('duplicate-member', await editIndex(base, (x) => JSON.stringify(x, null, 1).replace('\n "docId"', `\n "docId": "${x.docId}",\n "docId"`)), { read: { error: 'duplicate-member' } });
  put('oversize', await editIndex(base, (x) => { x.padding = 'x'.repeat(4 * 1024 * 1024 + 16); }), { read: { error: 'index-too-large' } });
  {
    const meta = scanDocument(base).byId.get('deck-meta');
    const m = JSON.parse(meta.text); m.sourceSha256 = 'f'.repeat(64);
    // 索引と deck-meta は同じ値だが、files から計算し直すと違う（§3.4：読み手が計算し直して見つける）
    const wrong = 'e'.repeat(64), m2 = JSON.parse(meta.text); m2.sourceSha256 = wrong;
    const both = base.slice(0, meta.start) + `<script type="application/json" id="deck-meta">${htmlSafeJson(JSON.stringify(m2))}</script>` + base.slice(meta.end);
    put('source-recomputed-mismatch', await editIndex(both, (x) => { x.sourceSha256 = wrong; }), { read: 'ok', sourceMatches: false, play: true });
    put('source-mismatch', base.slice(0, meta.start) + `<script type="application/json" id="deck-meta">${htmlSafeJson(JSON.stringify(m))}</script>` + base.slice(meta.end), { read: 'ok', sourceMatches: false, play: true });
  }
  { const at = base.lastIndexOf('</body>'); put('duplicate-index', base.slice(0, at) + base.slice(ix.start, ix.end) + '\n' + base.slice(at), { read: { error: 'duplicate-id' } }); }
  fs.rmSync(work, { recursive: true, force: true });
  return list;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) { console.error('usage: node tools/portable-fixtures.mjs <out dir>'); process.exit(2); }
  const list = await makeFixtures(out);
  console.log(`${list.length} fixtures -> ${out}`);
}
