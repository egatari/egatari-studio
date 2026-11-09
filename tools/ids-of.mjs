// Egatari ファイル（.ega.html）の身元を 1 行ずつ出す（egatari ids-of、npm run ids-of）。版を管理する組織向け。
//   node tools/ids-of.mjs <file.ega.html> [<file> …] [--json]
// 既定は TSV（タブ区切り）で ファイルごとに 1 行：docId、sourceSha256、ファイル全体の SHA-256。
//   docId          教材の id（索引の docId。再生専用の派生は deck-meta の docId）
//   sourceSha256   原稿から計算し直した値（format spec §3.4。音声と組んだ部分を含まない）。再生専用は原稿がないので「-」（--json では null）
//   ファイル全体   ファイルのバイト列の SHA-256（配布・LMS への登録の照合用）
// --json は ファイルごとに 1 行の JSON：{file, docId, sourceSha256, fileSha256}。
// 計算し直した sourceSha256 が、ファイルに書かれた値（索引・deck-meta）と違えば stderr に警告する（終了コードは変えない）。
// 読めない・Egatari ファイルでないものは stderr にわけを書き、終了コードは 1（ほかのファイルは続ける）。署名（§10）は扱わない。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegular } from '../kit/bounded-read.mjs';
import { readPortable, readDeckMeta, scanDocument, sourceKind, sha256Hex, sourceSha256, LIMITS, FormatError } from '../kit/core/portable.mjs';

const fail = (m) => { throw new FormatError('not-egatari', m); };

// 1 ファイルの身元：{docId, sourceSha256 (| null), fileSha256, warnings}
export async function idsOf(file) {
  let buf;
  try { buf = readRegular(file, { max: LIMITS.fileBytes }); } catch (e) {
    if (e && e.code === 'read-over') fail(`file is larger than ${LIMITS.fileBytes} bytes`);
    if (e && e.code === 'build-not-a-file') fail('not a regular file');
    throw e;
  }
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
  const fileSha256 = await sha256Hex(bytes);
  try {
    const r = await readPortable(bytes);
    const shas = {};
    for (const p of Object.keys(r.files)) shas[p] = await sha256Hex(r.files[p]);
    const computed = await sourceSha256(shas);
    const warnings = [];
    if (computed !== r.index.sourceSha256) warnings.push(`sourceSha256 differs from the index value (${r.index.sourceSha256}): the source was changed or the file was edited by hand`);
    if (r.deckMeta && r.deckMeta.sourceSha256 !== undefined && r.deckMeta.sourceSha256 !== computed) warnings.push(`sourceSha256 differs from the deck-meta value (${r.deckMeta.sourceSha256})`);
    return { docId: r.docId, sourceSha256: computed, fileSha256, warnings };
  } catch (e) {
    if (!(e instanceof FormatError) || e.code !== 'no-source' || e.details?.kind !== 'play-only') throw e;
    // 再生専用の派生：原稿がない。docId だけ deck-meta から
    const text = new TextDecoder().decode(bytes);
    const meta = readDeckMeta(scanDocument(text));
    if (!meta || typeof meta.docId !== 'string') fail('play-only file without a docId');
    return { docId: meta.docId, sourceSha256: null, fileSha256, warnings: [] };
  }
}

async function main(argv) {
  const json = argv.includes('--json');
  const files = argv.filter((a) => a !== '--json');
  if (!files.length || files.some((a) => a.startsWith('-') && a !== '--json')) {
    console.error('使い方 / usage: egatari ids-of <file.ega.html> [<file> …] [--json]');
    return 1;
  }
  let bad = 0;
  for (const f of files) {
    try {
      const r = await idsOf(f);
      for (const w of r.warnings) console.error(`warning: ${f}: ${w}`);
      console.log(json ? JSON.stringify({ file: f, docId: r.docId, sourceSha256: r.sourceSha256, fileSha256: r.fileSha256 })
        : [r.docId, r.sourceSha256 ?? '-', r.fileSha256].join('\t'));
    } catch (e) {
      bad++;
      const msg = e instanceof FormatError ? `not an Egatari file (${e.code}): ${e.message}` : e.code === 'ENOENT' ? 'file not found' : e.message;
      console.error(`error: ${f}: ${msg}`);
    }
  }
  return bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
