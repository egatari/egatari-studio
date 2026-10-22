// 編集アプリのスライド一覧（app/slides-panel.js。backlog #79）：足す・複製・削除（元に戻す）・並べ替えの確認。tools/test-app.mjs が呼ぶ
// test-all: part of test-app（tools/test-app.mjs が読み込む。単独では走らせない）
//   testAppSlides({browser, BASE, ok, watch, work, shotDir})
// 見本は examples/minimal に音声（無音の WAV と audio/manifest.json）と権利の表示を足したもの。作業フォルダ（OPFS）と 1 ファイルの両方で：
// 1. 一覧：listbox と option（縮図の枠は aria-hidden・inert）、↑↓ で選ぶとプレビューもその枚へ
// 2. 足す（雛形 5 つ）：id が s-xxxxxx で重ならない・口述原稿に {#id} の節・品質チェックが出る・知らせ（aria-live）
// 3. 複製：口述原稿は写し、音声の記録は写さない（そのスライドに「音声が要る」の印）
// 4. 削除：確かめの窓がスライドの名前と音声の警告を出す → スライド・口述原稿の節・音声の記録とファイルが消える → 元に戻すで全部戻る
// 5. 並べ替え：Alt+↓・↑ のボタン・ドラッグ。id は変わらず、口述原稿の節が同じ順、音声の記録は鍵のまま
// 6. 作業フォルダは開き直して、1 ファイルは保存（段 B）して開き直して、エラーなく同じ並び
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readPortable } from '../kit/core/portable.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { analyzeSlideIds } from '../kit/core/build-core.mjs';
import { silentWav } from './portable-fixtures.mjs';
import { clickUntil, clickDlg, clickMenuOpen, clickMenuItem } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ID = /^s-[a-z2-7]{6}$/;
const TEMPLATES = ['title-body', 'two-cols', 'figure', 'section', 'quote'];

// examples/minimal ＋ 段階ごとの無音の音声（2 つの段階で同じファイルを使うものも 1 つ）
function makeDeck(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  const segments = {};
  parseNarration(fs.readFileSync(path.join(dir, 'narration.md'), 'utf8')).forEach((x, j) => {
    fs.writeFileSync(path.join(dir, 'audio', `seg_s${j}.wav`), silentWav(0.3 + j / 100));
    segments[`${x.slideKey}:${x.stepKey}`] = { file: `seg_s${j}.wav`, dur: 0.3 + j / 100, cues: [] };
  });
  fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1) + '\n');
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', creators: ['Test Author'] } }, null, 2) + '\n');
  return dir;
}
const filesOf = (dir) => {
  const out = {};
  const go = (d, pre) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) go(path.join(d, e.name), pre + e.name + '/'); else out[pre + e.name] = fs.readFileSync(path.join(d, e.name)).toString('base64'); } };
  go(dir, '');
  return out;
};

export async function testAppSlides({ browser, BASE, ok, watch, work, shotDir }) {
  const dir = makeDeck(path.join(work, 'slides-min'));
  const portable = await buildPortable(path.join(dir, 'deck.html'), { out: path.join(work, 'slides-min' + FORMAT.FILE_EXT) });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  watch(page, 'slides');
  const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name) }); };
  const state = () => page.evaluate(() => window.__APP_TEST.state());
  const sl = () => page.evaluate(() => window.__APP_TEST.slides());
  try {
    await page.goto(BASE);
    await page.waitForSelector('#drop');
    // OPFS に作業フォルダを書く
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('slides-min', { recursive: true }).catch(() => {});
      const top = await root.getDirectoryHandle('slides-min', { create: true });
      for (const [rel, b64] of Object.entries(files)) {
        const parts = rel.split('/'), name = parts.pop(); let d = top;
        for (const x of parts) d = await d.getDirectoryHandle(x, { create: true });
        const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(u); await w.close();
      }
      window.__sd = top;
    }, filesOf(dir));
    // 作業場所のファイル（フォルダは OPFS から、1 ファイルはメモリの上の作業場所から）
    const read = (rel) => page.evaluate(async (rel) => {
      if (window.__APP_TEST.state().kind === 'memory') { const f = window.__APP_TEST.files(); return f && f[rel] ? new TextDecoder().decode(Uint8Array.from(atob(f[rel]), (c) => c.charCodeAt(0))) : null; }
      try { const parts = rel.split('/'), name = parts.pop(); let d = window.__sd; for (const x of parts) d = await d.getDirectoryHandle(x); return await (await (await d.getFileHandle(name)).getFile()).text(); } catch { return null; }
    }, rel);
    const exists = async (rel) => (await read(rel)) !== null;
    const snap = async () => ({ deck: await read('deck.html'), narr: await read('narration.md'), man: await read('audio/manifest.json') });
    const keys = (deck) => analyzeSlideIds(deck).slides.map((s) => s.key);
    const sections = (narr) => parseNarration(narr).sections.map((s) => s.key);
    const segKeys = (man) => Object.keys(JSON.parse(man).segments);
    // 操作の後：組み直し・読み込み・品質チェックまで終わる（一覧の busy が下りる）
    const settle = async (b0) => {
      await page.waitForFunction((b0) => window.__APP_TEST.state().builds > b0, b0, { timeout: 30000 });
      await page.waitForFunction(() => { const s = window.__APP_TEST.state(), x = window.__APP_TEST.slides(); return !x.busy && s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: 30000 });
    };
    const checkShown = () => page.evaluate(() => !document.getElementById('panel').hidden && !!document.querySelector('#panel-body .sum'));
    const announced = () => page.waitForFunction(() => document.getElementById('sl-live').textContent.length > 0, null, { timeout: 5000 }).then(() => page.textContent('#sl-live'));
    // 一覧の行は縮図の枠（sandbox の iframe）の上に重なるので、プレビューの上の重ねと同じく、効くまで押し直す（tools/click-retry.mjs）
    const selectRow = (i) => clickUntil(page, `#sl-list [data-i="${i}"]`, () => page.waitForFunction((i) => window.__APP_TEST.slides().sel === i, i, { timeout: 2500 }));
    const thumbsReady = (n) => page.waitForFunction((n) => { const f = document.getElementById('sl-thumbs'); return !!f; }, n, { timeout: 20000 }).then(async () => {
      const fr = page.frames().find((f) => f.name() === 'sl-thumbs');
      for (let t = 0; t < 200; t++) { try { const c = fr && await fr.evaluate(() => { const b = document.getElementById('egatari-strip'); return b ? b.children.length : -1; }); if (c === n) return true; } catch { /* 読み込み中 */ } await page.waitForTimeout(100); }
      return false;
    });

    for (const mode of ['folder', 'file']) {
      const tag = `slides (${mode})`;
      if (mode === 'folder') {
        await page.evaluate(() => window.__APP_TEST_OPEN(window.__sd));
      } else {
        await page.evaluate(([b64, name]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name }); },
          [Buffer.from(portable.html).toString('base64'), 'slides-min' + FORMAT.FILE_EXT]);
      }
      await page.waitForFunction((m) => { const s = window.__APP_TEST.state(); return s.kind === (m === 'folder' ? 'folder' : 'memory') && s.loads > 0 && s.frameLoaded === s.loads; }, mode, { timeout: 30000 });
      // ---------------------------------------------------------------- 1. 一覧
      if (mode === 'folder') {
        ok(await page.getAttribute('#b-slides', 'aria-expanded') === 'false' && await page.isVisible('#b-slides'), `${tag}: the list is closed at first; its tab is at the left edge`);
        await shot('slides-closed.png');
        await page.click('#b-slides');
        ok(await page.getAttribute('#b-slides', 'aria-expanded') === 'true' && await page.isHidden('#b-slides') && await page.evaluate(() => document.activeElement.id) === 'sl-list', `${tag}: the tab opens the list (aria-expanded) and focuses it`);
      } else ok((await sl()).open, `${tag}: the list stays open for the next deck (remembered)`);
      await page.waitForSelector('#sl-list [role=option]');
      const s0 = await snap(), k0 = keys(s0.deck);
      const rows0 = (await sl()).rows;
      ok(rows0.length === 6 && rows0.every((r, i) => r.key === k0[i]) && /^1 \/ 6：勾配降下法の基本/.test(rows0[0].label), `${tag}: the listbox has an option per slide, in order, named "n / N：見出し" (${rows0.length})`);
      ok(await thumbsReady(6), `${tag}: the thumbnails are drawn by the deck in a sandboxed frame (6 cells)`);
      const fa = await page.evaluate(() => { const f = document.getElementById('sl-thumbs'); return { hidden: f.getAttribute('aria-hidden'), inert: f.inert, sandbox: f.getAttribute('sandbox'), pe: getComputedStyle(f).pointerEvents }; });
      ok(fa.hidden === 'true' && fa.inert && fa.sandbox === 'allow-scripts' && fa.pe === 'none', `${tag}: the thumbnail frame is aria-hidden, inert, sandboxed and takes no clicks ${JSON.stringify(fa)}`);
      const thumbFinal = await page.frames().find((f) => f.name() === 'sl-thumbs').evaluate(() => { const c = document.querySelectorAll('#egatari-strip > div')[5]; return [...c.querySelectorAll('[data-step]')].every((e) => getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.5); });
      ok(thumbFinal, `${tag}: a thumbnail shows the slide's final step (all data-step parts visible)`);
      // ↑↓ で選ぶとプレビューもその枚へ
      await page.focus('#sl-list');
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.waitForFunction(() => { const p = window.__APP_TEST.state().pos; return p && p.i === 2 && window.__APP_TEST.slides().sel === 2; }, null, { timeout: 10000 }).catch(() => {});
      const nav = { sel: (await sl()).sel, pos: ((await state()).pos || {}).i, active: await page.getAttribute('#sl-list', 'aria-activedescendant'), selected: await page.getAttribute('#sl-o-2', 'aria-selected'), focus: await page.evaluate(() => document.activeElement.id) };
      ok(nav.sel === 2 && nav.pos === 2 && nav.active === 'sl-o-2' && nav.selected === 'true',
        `${tag}: arrow keys move the selection (aria-activedescendant, aria-selected) and the preview follows ${JSON.stringify(nav)}`);
      if (mode === 'folder') await shot('slides-panel.png');

      // ---------------------------------------------------------------- 2. 足す（雛形ごと）
      const added = [];
      for (const kind of TEMPLATES) {
        const before = await snap(), n = keys(before.deck).length, sel = (await sl()).sel;
        const b0 = (await state()).builds;
        await clickMenuOpen(page, '#sl-add');
        await clickMenuItem(page, `#sl-add-${kind}`);
        // 1 ファイル：最初の編集の前に権利の確認（format spec §7.3）
        if (mode === 'file' && kind === TEMPLATES[0]) {
          await page.waitForSelector('#dlg[open] #rights-list', { timeout: 10000 });
          ok(true, `${tag}: the first slide action shows the rights prompt first`);
          await clickDlg(page, '#dlg-ok');
        }
        await settle(b0);
        const after = await snap(), k = keys(after.deck), id = k[sel + 1];
        const allIds = analyzeSlideIds(after.deck);
        ok(k.length === n + 1 && ID.test(id) && !keys(before.deck).includes(id) && !allIds.docIds.has(id) && allIds.problems.length === 0,
          `${tag}: add "${kind}" inserts a slide after the selected one with a new well formed, unique id (${id})`);
        const sec = parseNarration(after.narr).filter((g) => g.slideKey === id);
        ok(sections(after.narr).indexOf(id) === sections(after.narr).indexOf(k[sel]) + 1 && sec.some((g) => g.stepKey === '0' && g.turns.length === 1) && after.narr.includes(`{#${id}}`),
          `${tag}: add "${kind}" adds a narration section "## … {#${id}}" with a placeholder line, after the previous slide's section`);
        ok(await checkShown() && (await sl()).sel === sel + 1 && (await state()).pos && (await state()).pos.i === sel + 1, `${tag}: add "${kind}": rebuilt, the preview shows the new slide, the quick check ran`);
        const errs = await page.$$eval('#panel-body .res.error', (xs) => xs.map((x) => x.textContent));
        const mine = await page.$$eval('#panel-body .res', (xs, n) => xs.filter((x) => x.querySelector('.where').textContent.startsWith(`スライド ${n}：`)).map((x) => x.textContent), sel + 2);
        ok(errs.length === 0 && mine.length === 0, `${tag}: add "${kind}": the quick check has no errors, and nothing on the new slide (every step has a placeholder line) ${JSON.stringify([errs, mine])}`);
        if (kind === 'title-body') ok(/足しました/.test(await announced()), `${tag}: the add is announced (aria-live)`);
        added.push(id);
        if (mode === 'folder' && kind === 'figure') await shot('slides-add.png');
      }

      // ---------------------------------------------------------------- 3. 複製（口述原稿は写し、音声は写さない）
      {
        await selectRow(1);
        const before = await snap(), src = keys(before.deck)[1], b0 = (await state()).builds;
        await page.click('#sl-dup');
        await settle(b0);
        const after = await snap(), k = keys(after.deck), id = k[2];
        ok(ID.test(id) && id !== src && k.length === keys(before.deck).length + 1 && k[1] === src, `${tag}: duplicate puts a copy with a new id right after (${src} → ${id})`);
        const turns = (narr, key) => parseNarration(narr).filter((g) => g.slideKey === key).map((g) => [g.stepKey, g.turns.map((t) => t.raw)]);
        ok(JSON.stringify(turns(after.narr, id)) === JSON.stringify(turns(before.narr, src)) && turns(after.narr, id).length === 5, `${tag}: duplicate copies the narration (5 steps)`);
        ok(segKeys(after.man).every((x) => !x.startsWith(id + ':')) && after.man === before.man, `${tag}: duplicate does not copy the audio (manifest unchanged)`);
        const row = (await sl()).rows[2];
        ok(/音声が要るステップ 5/.test(row.label), `${tag}: the copy's steps show as needing audio (${row.label})`);
        if (mode === 'folder') await shot('slides-duplicate.png');
      }

      // ---------------------------------------------------------------- 4. 削除と元に戻す
      {
        await selectRow(1);
        const before = await snap(), victim = keys(before.deck)[1];
        const vFiles = Object.entries(JSON.parse(before.man).segments).filter(([k]) => k.startsWith(victim + ':')).map(([, e]) => 'audio/' + e.file);
        ok(vFiles.length === 5 && (await Promise.all(vFiles.map(exists))).every(Boolean), `${tag}: the slide to delete has 5 audio files`);
        await clickUntil(page, '#sl-del', () => page.waitForSelector('#dlg[open] #dlg-delete', { timeout: 2500 }));
        const dlg = await page.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, what: document.getElementById('sl-del-what').textContent, warn: document.getElementById('sl-del-warn').textContent, list: document.getElementById('sl-del-list').textContent, kind: document.getElementById('dlg').className }));
        ok(/スライド 2「何を最小化するか」/.test(dlg.title) && /何を最小化するか/.test(dlg.what) && /音声/.test(dlg.warn) && /ステップ 5 個/.test(dlg.list) && /音声の記録 5 個/.test(dlg.list) && dlg.kind === 'warn',
          `${tag}: the delete dialog names the slide and warns that the audio goes too ${JSON.stringify(dlg)}`);
        if (mode === 'folder') await shot('slides-delete.png');
        // 取消：何も変わらない
        await clickDlg(page, '#dlg-cancel');
        ok(JSON.stringify(await snap()) === JSON.stringify(before), `${tag}: Cancel in the delete dialog changes nothing`);
        const b0 = (await state()).builds;
        await clickUntil(page, '#sl-del', () => page.waitForSelector('#dlg[open] #dlg-delete', { timeout: 2500 }));
        await clickDlg(page, '#dlg-delete');
        await settle(b0);
        const after = await snap();
        ok(!keys(after.deck).includes(victim) && keys(after.deck).length === keys(before.deck).length - 1, `${tag}: delete removes the slide`);
        ok(!sections(after.narr).includes(victim) && sections(after.narr).length === sections(before.narr).length - 1, `${tag}: delete removes its narration section`);
        ok(segKeys(after.man).every((x) => !x.startsWith(victim + ':')) && (await Promise.all(vFiles.map(exists))).every((x) => !x), `${tag}: delete removes its audio entries and files`);
        ok(/消しました/.test(await announced()) && (await sl()).undo && await page.isVisible('#sl-undo'), `${tag}: the delete is announced and Undo is offered`);
        if (mode === 'folder') await shot('slides-undo.png');
        const b1 = (await state()).builds;
        await page.click('#sl-undo');
        await settle(b1);
        const back = await snap();
        ok(back.deck === before.deck && back.narr === before.narr && back.man === before.man, `${tag}: Undo restores the slide, the narration and the audio manifest byte for byte`);
        ok((await Promise.all(vFiles.map(exists))).every(Boolean) && !(await sl()).undo && (await sl()).sel === 1, `${tag}: Undo restores the audio files and selects the slide again`);
      }

      // ---------------------------------------------------------------- 5. 並べ替え
      {
        const before = await snap(), k = keys(before.deck);
        await selectRow(1);
        await page.focus('#sl-list');
        let b0 = (await state()).builds;
        await page.keyboard.press('Alt+ArrowDown');
        await settle(b0);
        let after = await snap(), k2 = keys(after.deck);
        ok(k2[2] === k[1] && k2[1] === k[2] && [...k2].sort().join() === [...k].sort().join(), `${tag}: Alt+↓ moves the slide down; the ids do not change`);
        ok(sections(after.narr).join() === k2.join() && after.man === before.man, `${tag}: the narration sections follow the new order; the audio manifest is untouched (keys)`);
        ok(/2 枚目から 3 枚目/.test(await announced()) && (await sl()).sel === 2 && await page.evaluate(() => document.activeElement.id) === 'sl-list', `${tag}: the move is announced; the moved slide stays selected and focused`);
        b0 = (await state()).builds;
        await page.click('#sl-up');
        await settle(b0);
        ok((await snap()).deck === before.deck && (await snap()).narr === before.narr, `${tag}: the ↑ button moves it back (same bytes)`);
        // ドラッグ：2 枚目を 5 枚目の下へ
        b0 = (await state()).builds;
        await page.locator('#sl-o-1').dragTo(page.locator('#sl-o-4'), { targetPosition: { x: 60, y: 70 } });
        await settle(b0);
        after = await snap(); k2 = keys(after.deck);
        ok(k2.join() === [k[0], k[2], k[3], k[4], k[1], ...k.slice(5)].join() && sections(after.narr).join() === k2.join(), `${tag}: dragging a slide in the list reorders the slides and the narration`);
        const audioOf = (man) => JSON.stringify(Object.entries(JSON.parse(man).segments).sort());
        ok(audioOf(after.man) === audioOf(before.man), `${tag}: the audio stays bound by key after reordering`);
      }

      // ---------------------------------------------------------------- 6. 保存（1 ファイル）・開き直し
      const final = await snap(), kf = keys(final.deck);
      if (mode === 'folder') {
        const n0 = (await state()).builds;
        await page.evaluate(() => window.__APP_TEST_OPEN(window.__sd));
        await page.waitForFunction((n0) => { const s = window.__APP_TEST.state(); return s.builds > n0 && s.frameLoaded === s.loads; }, n0, { timeout: 30000 });
        const st = await state();
        ok(!st.error && (await sl()).rows.map((r) => r.key).join() === kf.join() && !(await sl()).undo, `${tag}: the folder reopens cleanly with the new order (undo cleared)`);
      } else {
        await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('slides-saved.ega.html', { create: true }); });
        const save = page.evaluate(() => window.__APP_TEST.save('save'));
        await page.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 });
        ok(/組み直/.test(await page.textContent('#dlg')), `${tag}: Save asks to rebuild (tier B: the slide structure changed)`);
        await clickDlg(page, '#dlg-rebuild');
        await save;
        const st = await state();
        ok(st.portable.lastTier === 'B' && st.portable.lastRefusal && st.portable.lastRefusal.code === 'source-changed' && !st.portable.dirty, `${tag}: saved by rebuilding (tier B, tier A refused: source-changed)`);
        ok(!(await sl()).undo, `${tag}: Undo is cleared by the save`);
        const html = await page.evaluate(async () => { const h = window.__APP_TEST.saveHandle; return await (await h.getFile()).text(); });
        const r = await readPortable(html);
        const deck2 = new TextDecoder().decode(r.files.get ? r.files.get('deck.html') : r.files['deck.html']);
        const narr2 = new TextDecoder().decode(r.files.get ? r.files.get('narration.md') : r.files['narration.md']);
        ok(r.sourceMatches && keys(deck2).join() === kf.join() && sections(narr2).join() === kf.join(), `${tag}: the saved file reads back (sourceMatches) with the same slides and narration order`);
        const auKeys = Object.keys(r.index.audio || {});
        ok(added.every((id) => !auKeys.some((x) => x.startsWith(id + ':'))) && auKeys.length === segKeys(final.man).length, `${tag}: the saved file carries the audio of the kept steps only (${auKeys.length})`);
        // 開き直す
        const n0 = (await state()).builds;
        await page.evaluate((b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'slides-saved.ega.html' }); }, Buffer.from(html).toString('base64'));
        await page.waitForFunction((n0) => { const s = window.__APP_TEST.state(); return s.builds > n0 && s.frameLoaded === s.loads; }, n0, { timeout: 30000 });
        const st2 = await state();
        ok(!st2.error && !st2.portable.readOnly && !st2.portable.tierAOnly && (await sl()).rows.map((x) => x.key).join() === kf.join(), `${tag}: the saved file reopens cleanly (editable, same order)`);
        await page.click('#b-check');
        await page.waitForSelector('#panel-body .sum');
        const errs = await page.$$eval('#panel-body .res.error', (xs) => xs.map((x) => x.textContent));
        ok(errs.length === 0, `${tag}: the reopened file has no quick-check errors ${JSON.stringify(errs)}`);
      }
      if (mode === 'file') {
        // ✕ で閉じると、つまみに戻る
        await page.click('#sl-close');
        ok(await page.isHidden('#slides') && await page.getAttribute('#b-slides', 'aria-expanded') === 'false' && await page.evaluate(() => document.activeElement.id) === 'b-slides', `${tag}: ✕ closes the list and returns the focus to its tab`);
      }
    }
    // 英語の画面：言葉（ステップ・スライド）
    const pe = await ctx.newPage();
    watch(pe, 'slides-en');
    await pe.goto(BASE + '?lang=en');
    await pe.waitForSelector('#drop');
    ok(await pe.textContent('#b-slides') === 'Slides' && await pe.getAttribute('#b-slides', 'title') === 'Open the slide list: add, duplicate, delete and reorder slides' && await pe.textContent('#sl-add') === '+ Add ▾', 'slides (en): English labels');
    await pe.close();
  } finally { await ctx.close(); }
}
