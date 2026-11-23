// test-all: unit
// 無料のプランの AI への指示を短くする（handoff #95）：
//   1. 見本は §6 の共通の見本 1 つだけ（束の見本の抜き出しは有料のプランだけ。<!--paid-->）
//   2. 一覧の「データの形」の欄から、どの項目にも付く step?・at?・tone?・label? を外し（材料の freeRow。tools/make-llm-guide.mjs の withoutCommon）、
//      一覧の上に 1 行（材料の fieldsNote）を書く。有料のプランは今までどおり
//   3. §2 の、無料のプランで使わない書き方（肩見出し・モーフ・研究の位置づけの表の 1 文）は有料のプランだけ
//   有料のプランの指示は、直す前（317d967b）の材料と同じ（指示のバージョンの行のほか）。無料のプランは測った分だけ短くなる
//   node tools/test-llm-free-short.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assemble, pasteUnits } from '../kit/core/llm-pack-assemble.mjs';
import { PACK } from '../kit/core/llm-pack-data.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('  ok   ' + name); };
const LANGS = ['en', 'ja'];
const SET_CHOICES = [[], ...PACK.sets.map((s) => [s])];
const examples = (t) => (t.match(/^```deck\.html$/gm) || []).length;
const bytes = (s) => new TextEncoder().encode(s).length;
// 直す前の形：#95 の印と材料を外した PACK（無料のプランが短くなった分を測る。有料のプランは変わらない）
const unpaid = (t, keep) => t.replace(/<!--paid-->([\s\S]*?)<!--\/paid-->/g, (m, inner) => (keep.some((k) => inner.includes(k)) ? m : inner));
const KEEP = ['Where a photo is needed', '写真が要る所', 'write a source line above the conclusion'];   // #95 より前からの有料のプランだけの行
function withoutShort(data) {
  const d = structuredClone(data);
  for (const L of LANGS) {
    d[L].common = unpaid(d[L].common, KEEP);
    for (const s of Object.keys(d[L].sets)) d[L].sets[s] = unpaid(d[L].sets[s], KEEP);
    delete d[L].fieldsNote;
    for (const c of Object.values(d[L].components)) delete c.freeRow;
  }
  return d;
}
const OLD = withoutShort(PACK);

await ok('1. the free plan has exactly one worked example (§6, common) with or without a part set; the paid plan keeps the set examples', () => {
  for (const lang of LANGS) {
    for (const sets of SET_CHOICES) assert.equal(examples(assemble(PACK, { sets, lang })), 1, `${lang} free ${sets}`);
    for (const s of ['business', 'kokugo', 'math']) {
      assert.equal(examples(assemble(PACK, { sets: [s], lang, plan: 'paid' })), 2, `${lang} paid ${s}`);
      assert.equal(examples(assemble(OLD, { sets: [s], lang })), 2, `${lang} ${s}: the set example was in the free plan before`);
    }
    assert.ok(!/<!--\/?paid-->/.test(assemble(PACK, { sets: 'all', lang })) && !/<!--\/?paid-->/.test(assemble(PACK, { sets: 'all', lang, plan: 'paid' })), lang + ': no markers left');
  }
});

await ok('2. free: one common-fields line above the catalog; the per-part shapes do not repeat step?/at?/tone?/label?; paid: unchanged rows, no line', () => {
  const LINE = { en: 'Every item may also have step, at, tone and label.', ja: 'どの項目にも step・at・tone・label を書ける。' };
  for (const lang of LANGS) {
    assert.equal(PACK[lang].fieldsNote, LINE[lang]);
    for (const sets of SET_CHOICES) {
      const free = assemble(PACK, { sets, lang }), paid = assemble(PACK, { sets, lang, plan: 'paid' });
      assert.equal(free.split(LINE[lang]).length - 1, 1, `${lang} free ${sets}: the line once`);
      assert.ok(free.indexOf(LINE[lang]) < free.indexOf(PACK[lang].tableHead), `${lang} ${sets}: above the catalog`);
      assert.ok(!paid.includes(LINE[lang]), `${lang} paid ${sets}: no line`);
      // 無料のプランの一覧の行：共通の項目は、その項目しかない object（{label?,tone?} を object にしない）のほかには出ない
      for (const row of free.split('\n').filter((l) => /^\| `<m-/.test(l))) {
        const objs = row.match(/\{[^{}]*\}/g) || [];
        for (const o of objs) if (/[{,](step|at|tone|label)\?[,}]/.test(o)) assert.ok(o.slice(1, -1).split(',').every((f) => /^(step|at|tone|label)\?$/.test(f)), `${lang}: ${row.slice(0, 40)} keeps ${o}`);
      }
      assert.ok(/[{,]step\?[,}]/.test(paid), `${lang} paid ${sets}: the rows keep step?`);
    }
    // 標準のパーツをすべて外しても、束の一覧のために 1 行はある
    const std = Object.keys(PACK.en.components).filter((t) => PACK.en.components[t].set === 'standard');
    assert.equal(assemble(PACK, { sets: ['math'], lang, exclude: std }).split(LINE[lang]).length - 1, 1, lang + ': the line with no standard part');
    // 外したのは共通の項目だけ：freeRow から共通の項目を足し戻すと row（欄の名前の並びで比べる）
    const fields = (r) => [...r.matchAll(/[{,]([A-Za-z_]+)\??(?=[:,}])/g)].map((x) => x[1]);
    let changed = 0;
    for (const [t, c] of Object.entries(PACK[lang].components)) {
      if (!c.freeRow) continue;
      changed++;
      const a = fields(c.row), b = fields(c.freeRow);
      const gone = [...a]; for (const f of b) gone.splice(gone.indexOf(f), 1);
      assert.ok(gone.length && gone.every((f) => /^(step|at|tone|label)$/.test(f)), `${lang} ${t}: removed ${gone}`);
    }
    assert.ok(changed >= 15, `${lang}: ${changed} rows have a free form`);
    // 有料のプランの一覧は今までの行
    for (const sets of SET_CHOICES) assert.equal(assemble(PACK, { sets, lang, plan: 'paid' }), assemble(OLD, { sets, lang, plan: 'paid' }), `${lang} paid ${sets}`);
  }
});

await ok('3. §2 parts the free plan does not use (kicker, morph, research-positioning table) are on the paid plan only', () => {
  const PAID = {
    en: ['class="kicker"', 'data-morph', '\\morph{ID}', 'research-positioning table', 'Some part sets end with an example'],
    ja: ['class="kicker"', 'data-morph', '\\morph{ID}', '研究の位置づけの表', 'いくつかのセットの指示の最後にも例がある'],
  };
  for (const lang of LANGS) {
    const free = assemble(PACK, { lang }), paid = assemble(PACK, { lang, plan: 'paid' });
    for (const p of PAID[lang]) { assert.ok(!free.includes(p), `${lang} free: ${p}`); assert.ok(paid.includes(p), `${lang} paid: ${p}`); }
    assert.ok(free.includes(lang === 'en' ? '### 2.5 Attention marks\n' : '### 2.5 強調\n'), lang + ': the §2.5 heading without morphs');
    // 有料のプランだけの行を除いても、箇条書きの間に空の行を残さない（§2.2）
    const s22 = free.slice(free.indexOf('### 2.2'), free.indexOf('### 2.3'));
    assert.ok(!/^- [^\n]*\n\n- /m.test(s22), lang + ': §2.2 is one list');
  }
});

await ok('4. the free sizes went down by at least the measured amounts (#95: en standard −1,204 paste units, ja standard −1,352 bytes, en + math −2,418; measured against the pack with the #95 markers taken out)', () => {
  const d = (data, opts, size) => size(assemble(data, opts));
  const cut = (opts, size) => d(OLD, opts, size) - d(PACK, opts, size);
  // 直す前の形（OLD）は #95 の印だけを外したもの。出典の行（#85）の改行を印の中に入れた 1 行の分（2）だけ、測った値（en −1,204）より小さく出る
  assert.ok(cut({ lang: 'en' }, pasteUnits) >= 1202, `en free standard: −${cut({ lang: 'en' }, pasteUnits)}`);
  assert.ok(cut({ lang: 'ja' }, bytes) >= 1352, `ja free standard: −${cut({ lang: 'ja' }, bytes)} B`);
  assert.ok(cut({ lang: 'en', sets: ['math'] }, pasteUnits) >= 2416, `en free + math: −${cut({ lang: 'en', sets: ['math'] }, pasteUnits)}`);
  assert.ok(cut({ lang: 'en', sets: ['business'] }, pasteUnits) >= 2368, 'en free + business');
  for (const sets of SET_CHOICES) for (const lang of LANGS) assert.ok(cut({ lang, sets }, pasteUnits) > 0, `${lang} ${sets}: shorter`);
});

// 直す前（317d967b：パーツ集 2.22.0 の取り込み）の材料と、有料のプランの指示が同じ（指示のバージョンの行のほか）。浅い clone で無ければ飛ばす
const BEFORE = '317d967b';
await ok(`5. paid packs byte-identical to ${BEFORE} (before #95) apart from the version line: standard, every single set, every set`, async () => {
  let old;
  try { old = execFileSync('git', ['show', `${BEFORE}:kit/core/llm-pack-data.mjs`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); } catch { console.log(`       (skipped: ${BEFORE} is not in this clone)`); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-llm-free-short-'));
  try {
    fs.writeFileSync(path.join(dir, 'data.mjs'), old);
    const { PACK: P0 } = await import(pathToFileURL(path.join(dir, 'data.mjs')).href);
    // 材料の部品・束が変わったら（パーツ集の取り込み）、この比べは役目を終えている
    if (JSON.stringify(Object.keys(P0.en.components).sort()) !== JSON.stringify(Object.keys(PACK.en.components).sort()) || P0.partsSrc !== PACK.partsSrc) { console.log('       (skipped: the parts changed since ' + BEFORE + ')'); return; }
    const v = (t, data) => t.split(data.version).join('<version>');
    for (const lang of LANGS) for (const sets of [...SET_CHOICES, 'all']) assert.equal(v(assemble(PACK, { sets, lang, plan: 'paid' }), PACK), v(assemble(P0, { sets, lang, plan: 'paid' }), P0), `${lang} paid ${sets}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(`test-llm-free-short: ${n} ok`);
