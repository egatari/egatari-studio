// チャットの AI との行き来（docs/authoring-with-llms.md）：
//   「AI の出力を貼り付ける」：返事の全体から deck.html と narration.md を取り出し（kit/core/llm-import.mjs）、スライドに id を付け
//   （kit/core/slide-ids.mjs。npm run ids と同じ本体）、メモリの上の原稿を Worker で持ち運べる 1 ファイルにして（app/build-worker.js の
//   exportHtml）、ほかの 1 ファイルと同じ道（openPortable：中身からコードを探し、あれば動かす前に確かめる）で開き、簡易チェックをかける。
//   「今のデッキを置き換える」では、今の docId・設定・音声を残して原稿だけを入れ替える（直したスライドだけの返事は id で元の場所に戻す）
//   「AI への直しの依頼を写す」：簡易チェックの結果・組み立ての知らせ・その決まりの文章（作った指示から）・今の原稿で依頼の文章を作る（kit/core/llm-fix.mjs）
// 貼り付けた文字列は信頼しない：このページでは解析と文字列の書き換えだけをし、組み立ては Worker で、表示は sandbox のプレビューで
import GUIDE_EN from '../docs/authoring-with-llms.md?text';
import GUIDE_JA from '../docs/authoring-with-llms.ja.md?text';
import CORE_EN from '../docs/authoring-with-llms.core.md?text';
import CORE_JA from '../docs/authoring-with-llms.core.ja.md?text';
import { extractBlocks, isPatch, mergeSlides, mergeNarration } from '../kit/core/llm-import.mjs';
import { assignIds } from '../kit/core/slide-ids.mjs';
import { buildFixRequest } from '../kit/core/llm-fix.mjs';
import { readingProblems } from '../kit/core/narration-lint.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { memoryWorkspace } from './workspace.js';

// 指示の本文（使う人への前書きを除いた「AI への指示」から後ろ）
const forAi = (g) => { const s = String(g).replace(/^<!--[^\n]*-->\n/gm, ''); const i = s.search(/^# (Instructions for the AI|AI への指示)\s*$/m); return i >= 0 ? s.slice(i) : s; };

const TX = {
  ja: {
    paste: 'AI の出力を貼り付ける…', pasteWelcome: 'AI の出力を貼り付ける',
    title: 'AI の出力を貼り付ける',
    lead: 'チャットの AI（claude.ai・Gemini・ChatGPT など）の返事の全体を、写すボタンで写して貼り付けます。```deck.html と ```narration.md の 2 つの囲みを取り出し、スライドに id を付け、検査して開きます',
    guide: 'AI への指示（docs/authoring-with-llms.ja.md）をチャットに貼ってから、作りたいものを頼みます：',
    copyGuide: 'AI への指示を写す', copyCore: '短い版（部品の説明なし）を写す',
    copied: (kb) => `写しました（${kb} KB）。チャットに貼り付けてください`,
    placeholder: 'ここに AI の返事の全体を貼り付ける',
    modeNew: '新しいデッキとして開く', modeReplace: '今のデッキを置き換える（docId・音声はそのまま。直したスライドだけの返事なら、その id のスライドだけ）',
    go: '取り込む', untrusted: '貼り付けたものは開いたファイルと同じに扱います。スクリプトが入っていれば、動かす前に確かめます',
    err: {
      'no-blocks': 'コードの囲み（``` の行）が見つかりません。チャットの写すボタンで返事の全体を写してください',
      'no-deck': 'deck.html の囲みが見つかりません（```deck.html で始まる囲み）',
      'no-slides': 'deck.html の囲みに <section class="slide"> がありません',
      unclosed: (e) => `${e.line} 行目から始まる囲み${e.kind ? `（${e.kind === 'deck' ? 'deck.html' : 'narration.md'}）` : ''}が閉じていません。返事が途中で切れたようです。AI に「続きを」と頼むか、2 つの囲みで返し直してもらってください`,
      'no-narration': 'narration.md の囲みが見つかりません（```narration.md で始まる囲み）',
      empty: '何も貼り付けられていません',
      'no-match': '直したスライドの id が今のデッキにありません',
    },
    warn: {
      several: (w) => `${w.kind === 'deck' ? 'deck.html' : 'narration.md'} の囲みが ${w.n} 個あったので、最後のものを使いました`,
      ignored: (w) => `どちらのファイルでもない囲み ${w.n} 個は使いませんでした`,
      unfenced: '囲みがなかったので、<!DOCTYPE html> から </html> までと、その後ろの口述原稿を取り出しました',
      autoclosed: (w) => `${w.line} 行目からの囲みが閉じていなかったので、次の囲みの手前で閉じました`,
    },
    building: '取り込んでいます…', buildFailed: '取り込んだ原稿を組み立てられませんでした',
    imported: (n, ids) => `取り込みました：${n} 枚${ids ? `、id を ${ids} 枚に付けました` : ''}`,
    replaced: (n) => `置き換えました（${n}）`, replacedSlides: (ids) => `スライド ${ids.length} 枚を置き換えました`,
    idProblems: 'id を付けられないスライドがあります（検査の結果を見てください）',
    unsavedNote: '保存するまでファイルには書いていません',
    fix: 'AI への直しの依頼を写す', fixTitle: 'AI への直しの依頼',
    fixLead: (n, partial) => `問題 ${n} 件と、その決まり、${partial ? '問題のあるスライド' : '今の deck.html と narration.md'} を写しました。同じチャットに貼り付け、返事を「AI の出力を貼り付ける」で取り込みます（今のデッキを置き換える）`,
    fixCopyFailed: '自動では写せませんでした。下の文字を選んで写してください',
    fixNone: '直す問題はありません', pasteReply: '返事を貼り付ける…', close: '閉じる',
    checkMsg: {
      orphanNarration: (a) => `スライドにない段階の口述原稿 [${a}]`,
      readingExpr: (a) => `読みの指定 ${a} が式を読んでいる（記号か用語だけに）`,
      readingSeveral: (a) => `読みの指定 ${a} に記号が 2 つ以上（記号ごとに分ける）`,
    },
  },
  en: {
    paste: 'Paste AI output…', pasteWelcome: 'Paste AI output',
    title: 'Paste AI output',
    lead: 'Paste the whole reply of a chat AI (claude.ai, Gemini, ChatGPT, …), copied with the chat’s copy button. The editor takes out the two blocks ```deck.html and ```narration.md, gives the slides ids, checks the deck and opens it.',
    guide: 'First paste the instructions for the AI (docs/authoring-with-llms.md) into the chat, then ask for what you want:',
    copyGuide: 'Copy instructions for your AI', copyCore: 'Copy the short version (no component details)',
    copied: (kb) => `Copied (${kb} KB). Paste it into the chat.`,
    placeholder: 'Paste the whole reply of the AI here',
    modeNew: 'Open as a new deck', modeReplace: 'Replace the current deck (docId and audio stay; a reply with only some slides replaces just those, by id)',
    go: 'Import', untrusted: 'Pasted content is treated like an opened file: if it contains scripts, the editor asks before running them.',
    err: {
      'no-blocks': 'No code blocks (``` lines) found. Copy the whole reply with the chat’s copy button.',
      'no-deck': 'No deck.html block found (a block starting with ```deck.html).',
      'no-slides': 'The deck.html block has no <section class="slide">.',
      unclosed: (e) => `The block starting on line ${e.line}${e.kind ? ` (${e.kind === 'deck' ? 'deck.html' : 'narration.md'})` : ''} is not closed: the reply was probably cut off. Ask the AI to continue, or to send the two blocks again.`,
      'no-narration': 'No narration.md block found (a block starting with ```narration.md).',
      empty: 'Nothing was pasted.',
      'no-match': 'None of the fixed slides’ ids is in the current deck.',
    },
    warn: {
      several: (w) => `There were ${w.n} ${w.kind === 'deck' ? 'deck.html' : 'narration.md'} blocks; the last one was used.`,
      ignored: (w) => `${w.n} block(s) that are neither file were ignored.`,
      unfenced: 'No code blocks: took <!DOCTYPE html> … </html> and the narration after it.',
      autoclosed: (w) => `The block from line ${w.line} was not closed; it was closed before the next block.`,
    },
    building: 'Importing…', buildFailed: 'Could not build the imported deck',
    imported: (n, ids) => `Imported ${n} slides${ids ? `; added ids to ${ids}` : ''}`,
    replaced: (n) => `Replaced (${n})`, replacedSlides: (ids) => `Replaced ${ids.length} slide(s)`,
    idProblems: 'Some slides could not get an id (see the check results).',
    unsavedNote: 'Nothing is written to a file until you save.',
    fix: 'Copy fix request for your AI', fixTitle: 'Fix request for your AI',
    fixLead: (n, partial) => `Copied ${n} problem(s), their rules and ${partial ? 'the slides with problems' : 'the current deck.html and narration.md'}. Paste it into the same chat, then import the reply with “Paste AI output” (replace the current deck).`,
    fixCopyFailed: 'Could not copy automatically. Select the text below and copy it.',
    fixNone: 'No problems to fix.', pasteReply: 'Paste the reply…', close: 'Close',
    checkMsg: {
      orphanNarration: (a) => `Narration for a step the slide does not have [${a}]`,
      readingExpr: (a) => `The reading ${a} reads an expression (one symbol or term only)`,
      readingSeveral: (a) => `The reading ${a} has several symbols (one reading each)`,
    },
  },
};

export function setupLlm(app) {
  const { S, $, el, ask, toast, status, T, EN } = app;
  const X = EN ? TX.en : TX.ja;
  const GUIDE = EN ? GUIDE_EN : GUIDE_JA, CORE = EN ? CORE_EN : CORE_JA;
  // 簡易チェックの新しい知らせの言葉（app/i18n.js の checkMsg に足す）
  const base = T.checkMsg;
  T.checkMsg = (c, a) => (X.checkMsg[c] ? X.checkMsg[c](a) : base(c, a));
  for (const id of ['b-paste', 'w-paste']) { const b = $(id); if (b) b.textContent = id === 'b-paste' ? X.paste : X.pasteWelcome; }

  async function copyText(text, area) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      try { if (area) { area.focus(); area.select(); } return document.execCommand('copy'); } catch { return false; }
    }
  }
  const kb = (s) => Math.ceil(new TextEncoder().encode(s).length / 1024);

  // ---------------------------------------------------------------- 貼り付けの窓
  // mode：'new' | 'replace'（デッキを開いているときだけ選べる）。戻り値：開いたか
  async function pasteDialog(mode0) {
    const canReplace = !!(S.ws && S.deckFile && !(S.portable && (S.portable.readOnly || S.portable.tierAOnly)));
    const area = el('textarea', { id: 'paste-text', spellcheck: 'false', placeholder: X.placeholder, rows: '12' });
    const msg = el('p', { id: 'paste-msg', cls: 'note bad', hidden: '' });
    const copyMsg = el('p', { id: 'paste-copied', cls: 'hint', hidden: '' });
    const mk = (id, label, text) => el('button', { type: 'button', id, text: label, onclick: async () => { const ok = await copyText(forAi(text)); copyMsg.hidden = false; copyMsg.textContent = ok ? X.copied(kb(forAi(text))) : X.fixCopyFailed; } });
    const radios = canReplace ? el('div', { cls: 'paste-mode' }, [
      el('label', {}, [el('input', { type: 'radio', name: 'paste-mode', value: 'new', id: 'paste-new' }), el('span', { text: X.modeNew })]),
      el('label', {}, [el('input', { type: 'radio', name: 'paste-mode', value: 'replace', id: 'paste-replace' }), el('span', { text: X.modeReplace })]),
    ]) : null;
    if (radios) radios.querySelector(mode0 === 'replace' ? '#paste-replace' : '#paste-new').checked = true;
    for (;;) {
      const v = await ask({ title: X.title, kind: 'paste', body: [
        el('p', { text: X.lead }),
        el('div', { cls: 'paste-guide' }, [el('span', { cls: 'hint', text: X.guide }), mk('paste-copy-guide', X.copyGuide, GUIDE), mk('paste-copy-core', X.copyCore, CORE)]),
        copyMsg, area, radios, msg, el('p', { cls: 'hint', text: X.untrusted })],
        buttons: [{ id: 'cancel', label: T.cancel }, { id: 'import', label: X.go, pri: true }] });
      if (v !== 'import') return false;
      const mode = radios && radios.querySelector('#paste-replace').checked ? 'replace' : 'new';
      const err = await importText(area.value, mode);
      if (!err) return true;
      msg.hidden = false; msg.textContent = err;
    }
  }

  // 取り込む。戻り値：窓に出す誤りの言葉（なければ null）
  async function importText(text, mode) {
    if (!String(text).trim()) return X.err.empty;
    const r = extractBlocks(text);
    if (r.error) return typeof X.err[r.error.code] === 'function' ? X.err[r.error.code](r.error) : (X.err[r.error.code] || r.error.message);
    const notes = r.warnings.map((w) => (X.warn[w.code] ? (typeof X.warn[w.code] === 'function' ? X.warn[w.code](w) : X.warn[w.code]) : w.code));
    if (r.narration === null && mode === 'new') return X.err['no-narration'];
    status(X.building);
    try {
      return mode === 'replace' ? await replaceDeck(r, notes) : await openNew(r, notes);
    } finally { status(''); }
  }

  // id を付ける（同じ見出しのスライドは narration.md の節に出てきた順で対応させる）
  function withIds(deck, narration) {
    const a = assignIds(deck, narration || '', { byOrder: true });
    return { deck: a.deck, narration: a.narration, added: a.added.length, problems: a.problems };
  }
  const nameOf = (deck) => {
    const t = (deck.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const n = t.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return (n || 'ai-draft') + FORMAT.FILE_EXT;
  };
  // メモリの上の原稿 → Worker で持ち運べる 1 ファイル（組み立てと同じ期限）→ 開く（中身からコードを探し、あれば確かめる）
  async function openFiles(files, name, extra) {
    const ws = memoryWorkspace('pasted', files);
    let html;
    try { html = (await app.builder.exportHtml(ws, 'deck.html', {}, { timeout: app.buildTimeout() })).html; }
    catch (e) { return `${X.buildFailed}: ${String((e && e.message) || e).slice(0, 300)}`; }
    const ok = await app.openPortable({ bytes: new TextEncoder().encode(html), name, fresh: true, ...extra });
    if (!ok) return null;   // 取り消した（コードの確かめ・未保存の変更）：窓は閉じる
    // 保存するまでファイルには書いていない（閉じる前に知らせる）
    try { const t = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }); await S.ws.writeText('narration.md', t || ''); } catch { /* 無視 */ }
    app.updateName();
    await afterOpen();
    return null;
  }
  async function openNew(r, notes) {
    const ids = withIds(r.deck, r.narration);
    const files = { 'deck.html': ids.deck, 'narration.md': ids.narration || '' };
    const name = nameOf(ids.deck);
    const err = await openFiles(files, name, {});
    if (err) return err;
    if (S.portable && S.portable.name === name) toast([X.imported((S.slides || []).length, ids.added), ...notes, ids.problems.length ? X.idProblems : '', X.unsavedNote].filter(Boolean).join(' · '), notes.length > 0 || ids.problems.length > 0);
    return null;
  }
  async function replaceDeck(r, notes) {
    const file = S.deckFile;
    const cur = await S.ws.readText(file, { max: READ_LIMITS.source }) || '';
    const curN = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }) || '';
    let deck = r.deck, narration = r.narration === null ? curN : r.narration, what;
    if (isPatch(deck)) {
      const m = mergeSlides(cur, deck);
      if (!m.replaced.length) return X.err['no-match'];
      deck = m.deck;
      narration = r.narration === null ? curN : mergeNarration(curN, r.narration).narration;
      what = X.replacedSlides(m.replaced);
    }
    const ids = withIds(deck, narration);
    what = what || X.replaced(file);
    if (S.portable) {
      // 持ち運べる 1 ファイル：今の作業場所のファイル（設定の docId・音声・部品）を残し、原稿だけを入れ替えて開き直す
      const files = new Map(S.ws.snapshot());
      for (const k of [...files.keys()]) if (k.startsWith('.cache/')) files.delete(k);
      files.set(file, new TextEncoder().encode(ids.deck)); files.set('narration.md', new TextEncoder().encode(ids.narration));
      const P = S.portable;
      const ws = memoryWorkspace('pasted', files);
      let html;
      try { html = (await app.builder.exportHtml(ws, file, { carry: P.index }, { timeout: app.buildTimeout() })).html; }
      catch (e) { return `${X.buildFailed}: ${String((e && e.message) || e).slice(0, 300)}`; }
      const ok = await app.openPortable({ bytes: new TextEncoder().encode(html), name: P.name, handle: P.handle, fresh: P.rightsOk, replacing: true });
      if (!ok) return null;
      try { await S.ws.writeText('narration.md', ids.narration); } catch { /* 無視 */ }
      app.updateName();
    } else {
      // フォルダ：控え（.cache/edits/）を残して書き、コードの確かめをやり直してから組み直す
      for (const [rel, text] of [[file, ids.deck], ['narration.md', ids.narration]]) {
        try { await S.ws.backup(rel, { max: rel === file ? READ_LIMITS.source : READ_LIMITS.narration }); } catch { /* なければ控えはない */ }
        await S.ws.writeText(rel, text);
      }
      S.codeOk = null;
      await app.rebuild('paste');
      if (S.codeOk === false) return null;
    }
    toast([what, ...notes, ids.problems.length ? X.idProblems : '', S.portable ? X.unsavedNote : ''].filter(Boolean).join(' · '), notes.length > 0);
    await afterOpen();
    return null;
  }
  // プレビューが組み上がるのを待って簡易チェック
  async function afterOpen() {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !(S.pos && S.allowed)) await new Promise((r) => setTimeout(r, 100));
    if (S.pos && S.allowed) await app.quickCheck();
  }

  // ---------------------------------------------------------------- 簡易チェックに足すもの（このページで、narration.md の元の文字列から）
  async function extraChecks() {
    if (!S.ws) return [];
    let text;
    try { text = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }); } catch { return []; }
    if (!text) return [];
    const idx = new Map((S.slides || []).map((s, i) => [s.key, i]));
    const out = [];
    for (const seg of parseNarration(text)) {
      const i = idx.has(seg.slideKey) ? idx.get(seg.slideKey) : null;
      for (const t of seg.turns) for (const p of readingProblems(t.raw)) {
        out.push({ i, title: i === null ? '' : String((S.slides[i] && (S.slides[i].heading || S.slides[i].key)) || ''), sev: 'warn', code: p.why === 'operator' ? 'readingExpr' : 'readingSeveral', arg: p.text });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- 直しの依頼
  async function fixRequest(results) {
    const probs = results.filter((r) => r.sev === 'error' || r.sev === 'warn').map((r) => ({ sev: r.sev, i: r.i, title: r.title, code: r.code, text: T.checkMsg(r.code, r.arg) }));
    // 組み立ての知らせのうち、原稿の書き方に関わるもの（行き先のない口述原稿・目印・段階の番号など）
    for (const w of S.warn || []) if (/^(narration|mark|slide key):/.test(w)) probs.push({ sev: /^narration:/.test(w) ? 'error' : 'warn', i: null, title: '', msg: w, text: w });
    if (!probs.length) { toast(X.fixNone); return; }
    const deck = await S.ws.readText(S.deckFile, { max: READ_LIMITS.source }) || '';
    const narration = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }) || '';
    const req = buildFixRequest({ problems: probs, deck, narration, guide: GUIDE, lang: EN ? 'en' : 'ja' });
    const area = el('textarea', { id: 'fix-text', readonly: '', rows: '12', spellcheck: 'false' });
    area.value = req.text;
    const ok = await copyText(req.text, area);
    // 窓を開いた後に頭を見せる（窓が字の欄にフォーカスを移すと、終わりへ送られることがある）
    setTimeout(() => { try { area.setSelectionRange(0, 0); area.scrollTop = 0; } catch { /* 無視 */ } }, 0);
    const v = await ask({ title: X.fixTitle, kind: 'paste', body: [
      el('p', { id: 'fix-lead', text: ok ? X.fixLead(probs.length, req.partial) : X.fixCopyFailed }), area],
      buttons: [{ id: 'cancel', label: X.close }, { id: 'paste', label: X.pasteReply, pri: true }] });
    if (v === 'paste') await pasteDialog('replace');
  }
  function fixButton(results) {
    return el('button', { type: 'button', id: 'b-fixreq', cls: 'fixreq', text: X.fix, onclick: () => fixRequest(results) });
  }

  $('b-paste').onclick = () => pasteDialog('new').catch((e) => toast(String(e.message || e), true));
  $('w-paste').onclick = () => pasteDialog('new').catch((e) => toast(String(e.message || e), true));
  return { pasteDialog, importText, extraChecks, fixButton, fixRequest, texts: X };
}
