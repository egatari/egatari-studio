// 「授業の部屋を付けて配る」の板（編集アプリの横の板 #panel。拡張 live、format spec の extensions/live.md）：再生専用の書き出しの選べる形
// - この画面はどこにもつながらない（要求を出さない）。部屋（room）と参加の鍵（key）の決め方は 2 つ：
//   おすすめ（一方向。live.md §4、egatari/live の PROTOCOL.md §2.1）：この画面で setup（乱数）を作り、room と key をそこから導く。ホストには 1 本の文字列（room・key・setup・窓・活動）を
//   渡し、ホストはそれをホストのページに 1 回だけ貼る。setup は鍵と同じく、この板が開いているあいだだけ覚え、教材にも書き出すファイルにも書かない
//   前からの方法（たたんだ「前からの方法」）：ホストのページで部屋を作ってコピーした字を貼る
// - 窓（いつからいつまで）・Q&A（教材全体で入／切）・段階ごとの投票（問いと 2〜6 の選択肢）を決める。部屋も同じ活動を知る必要があるので、活動の JSON をコピーして教員のページに渡す
// - 教材に残すのは鍵のない設定（設定のファイル FORMAT.CONFIG_FILE の extensions.live。書き出すと索引の extensions.live）。鍵は書き出す派生にだけ入り、この板が覚えるのは開いているあいだだけ
//
//   const panel = createLivePanel({lang, el, ws(), generation(), openPanel(title, body), isOpen(), toast, beforeWrite() → null | 理由, afterWrite(),
//     currentStep() → 段階の鍵 | null, stepKeys() → Promise<[段階の鍵]>, slides() → [{key, heading}], exportLive(live) → Promise, portable() → bool, problemText(p) → 文,
//     importResults(file) → Promise（ライブの結果の JSON を添付にする。app/attachments-panel.js の importLive）})
// - 投票には表示名（label。「4 枚目『XML の壁』・段階 1」）を付ける：作るとき・段階を変えたとき・label のない古い投票を開いたとき（スライドが見つかれば）。
//   段階の鍵を出していたところ（段階の候補・投票の一覧）には label を出し、鍵は title の吹き出しに。鍵そのものは変えない
//   panel.open()
// embedded()：true なら「参加者用（再生のみ）…」の窓の中（app/main.js の participantExport）。書き出しのボタンと結果の取り込みは出さず、
//   窓の「書き出す…」が ready()（直すことがなければ true。あれば知らせる）→ prepare()（作業フォルダは設定を残す。鍵を含む完全な設定 | null）を呼ぶ
import { FORMAT } from '../kit/core/format.mjs';
import { updateConfig, merge as configMerge } from '../kit/core/config-file.mjs';
import { LivePolicy } from '../kit/core/live-policy.mjs';
import { parseRoomBlock, lessonLive, activitiesText, localToRfc3339, stepLabel, stepText, newLiveSetup, liveSetupString } from '../kit/core/live.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';

const LP = LivePolicy();
const CFG = FORMAT.CONFIG_FILE;
const MAX_CHOICES = 6;
const STR = {
  ja: {
    title: 'ライブ（質問・投票）を付けて配る',
    lead: `参加者に配る Egatari ファイル（再生専用・${FORMAT.PLAY_EXT}）に、ライブ（授業中の質問・投票）を付けます。① ライブ ID と参加コードをこの画面で作る → ② ライブの時間と質問・投票を決める → ③ できた文字列をコピーして、ホストのページに 1 回だけ貼る → ④ エクスポートする、の順です。この画面自体はインターネットに接続しません。参加コードは教材には保存せず、エクスポートするファイルにだけ入ります`,
    s1: '① ライブ ID と参加コード', make: 'ライブ ID と参加コードをこの画面で作る', remake: '作り直す',
    remakeConfirm: 'ライブ ID と参加コードを作り直しますか？ 前の文字列で作ったライブや、前にエクスポートしたファイルとは別のライブになります。',
    madeHere: (room) => `ライブ ID ${room}（この画面で作りました。参加コードはエクスポートするファイルにだけ入ります）`,
    fromHost: (room) => `ライブ ID ${room}（ホストのページで作ったライブの設定を使っています。文字列を貼る必要はありません）`,
    noIds: 'まだライブ ID と参加コードがありません。下のボタンで作ってください。',
    s2: '② ライブの時間と、質問・投票', s3: '③ ホストのページに 1 回だけ貼る文字列', s4: '④ エクスポート',
    setupHelp: '下の文字列をコピーし、ホストのページを開いて 1 回だけ貼り、確認を済ませて「このライブを作る」を押してください。ライブ ID・参加コード・ライブの時間・質問・投票の設定がすべて入っているので、ホストのページでほかに入れるものはなく、ここに何かを貼り戻す必要もありません。',
    setupWarn: 'この文字列でライブが作られます。ホスト用リンクと同じように大事に扱い、参加者には決して渡さないでください。',
    setupLost: 'ホストのページに貼る前にこの画面（編集アプリ）を閉じると、同じ文字列はもう出せません。そのとき配ったファイルは、誰も作れないライブを指したままになります（ファイルの参加コードからはライブを作れません）。貼り終えるまでは「設定の文字列を保存する」で残しておいてください。',
    saveSetup: '設定の文字列を保存する', savedSetup: (n) => `設定の文字列を ${n} として保存しました。ホスト用リンクと同じように扱ってください`,
    setupAfter: 'ライブを作ったあとでライブの時間を変えるときは、ライブ ID と参加コードを作り直して、もう一度貼ってください。投票だけを変えたときは、下の「前からの方法」の「投票の設定をコピー」で、ホストのページの「投票の設定」に貼り直せます。',
    setupWait: '「エクスポートする前に直すこと」がなくなると、ここに文字列が出ます。', setupNone: '文字列は、① でライブ ID と参加コードをこの画面で作ると出ます。',
    copySetup: '文字列をコピー', copiedSetup: '文字列をコピーしました。ホストのページに 1 回だけ貼ってください', hostLink: 'ホストのページを開く',
    manual: 'ホストのページで先にライブを作った場合（前からの方法）',
    manualLead: 'ホストのページでライブを作り、そこでコピーした「Egatari Studio に貼る設定」をここに貼ります。この画面で作ったライブ ID で、あとからエクスポートし直すとき（参加コードはこの画面を閉じると忘れます）にも、ホスト用リンクのページの設定をここに貼れば、同じライブのままエクスポートできます。',
    paste: 'ホストのページでコピーした設定（ライブ ID・参加コード・ライブの時間）', read: '読み込む', readOk: '設定を読み込みました', admin: 'これはホスト用リンクです（ライブを操作するためのコードが入っています）。ここには貼らないでください。ホストのページの「Egatari Studio に貼る設定」の「コピー」で写したものを貼ってください',
    badBlock: 'ライブの設定として読めません：', endpoint: '接続先', room: 'ライブ ID', key: '参加コード（エクスポートするファイルにだけ入ります）', from: 'ライブの開始', to: 'ライブの終了',
    qa: '参加者からの質問を受け付ける（教材全体で）', confused: '「わからない」の一押しを受け付ける（教材全体で。そのときのステップごとに数えます）', polls: '投票（ステップごと。そのステップを表示したときに、参加者の画面に出ます）', addPoll: '投票を追加', step: '出すステップ', here: '今プレビューに出ているステップにする', prompt: '設問', choice: (n) => `選択肢 ${n}`,
    addChoice: '選択肢を足す', delChoice: '消す', delPoll: 'この投票を消す', copy: '投票の設定（JSON。ホストのページの「投票の設定」に貼る）', copyBtn: '投票の設定をコピー', copied: '投票の設定をコピーしました。ホストのページの「投票の設定」に貼って「投票の設定を保存」を押してください',
    save: '設定を教材に保存（参加コードは保存しません）', saved: `設定を ${CFG} に書きました（参加コードは書きません）`, portableNote: 'Egatari ファイルに残すには「保存」を押してください', exp: 'ライブを付けてエクスポート…',
    problems: 'エクスポートする前に直すこと', none: 'ありません', needKey: '参加コードがありません（① の「ライブ ID と参加コードをこの画面で作る」を押すか、前からの方法でホストのページの設定を貼ってください）', windowNote: '時刻はこの機械の時間帯で入れます', copyFallback: 'コピーできませんでした。下の字を選んでコピーしてください',
    keyTip: (k) => `ステップの識別子：${k}`,
    results: 'ライブが終わったら：ホストのページで結果（JSON）をダウンロードし、ここから教材の添付（役割：データ）にできます。結果は教材のファイルにだけ残り、参加者に配る Egatari ファイル（再生専用）には入りません',
    importResults: 'ライブの結果を取り込む…',
    fail: 'できませんでした：', tooLong: 'ライブの時間が長すぎます。ライブは 3 時間までです（ライブの開始と終了を直してください）',
  },
  en: {
    title: 'Distribute with Live (questions and polls)',
    lead: `Adds Live (questions and polls in class) to the Egatari file (play-only, ${FORMAT.PLAY_EXT}) you hand to participants. ① Make the Live ID and join code here → ② set the live time and the questions and polls → ③ copy the string and paste it once on the host page → ④ export. This screen itself connects nowhere. The join code is not saved in the lesson; it goes only into the exported file`,
    s1: '① Live ID and join code', make: 'Make the Live ID and join code here', remake: 'Make new ones',
    remakeConfirm: 'Make a new Live ID and join code? It becomes a different Live from the one made with the earlier string and from files exported before.',
    madeHere: (room) => `Live ID ${room} (made here; the join code goes only into the exported file)`,
    fromHost: (room) => `Live ID ${room} (using the settings of a Live made on the host page; no string to paste)`,
    noIds: 'No Live ID and join code yet. Make them with the button below.',
    s2: '② Live time, questions and polls', s3: '③ The string to paste once on the host page', s4: '④ Export',
    setupHelp: 'Copy the string below, open the host page, paste it once, pass the check and press Create this Live. It holds the Live ID, the join code, the live time and the questions and polls, so there is nothing else to fill in on the host page and nothing to paste back here.',
    setupWarn: 'This string creates the Live. Keep it like the host link and never give it to participants.',
    setupLost: 'If you close this screen (the editor) before pasting the string on the host page, the same string cannot be shown again, and files already handed out point at a Live nobody can create (the join code in the file cannot create it). Until you have pasted it, keep it with Save the setup string.',
    saveSetup: 'Save the setup string', savedSetup: (n) => `Saved the setup string as ${n}. Keep it like the host link`,
    setupAfter: 'To change the live time after the Live was created, make a new Live ID and join code and paste again. If only the polls changed, use Copy poll settings under “The earlier way” below and paste them into Poll settings on the host page.',
    setupWait: 'The string appears here once nothing is left under “To fix before exporting”.', setupNone: 'The string appears when you make the Live ID and join code here in ①.',
    copySetup: 'Copy the string', copiedSetup: 'Copied the string. Paste it once on the host page', hostLink: 'Open the host page',
    manual: 'If you created the Live on the host page first (the earlier way)',
    manualLead: 'Create a Live on the host page and paste here the “Settings to paste into Egatari Studio” you copied there. Also use this to export again later for a Live made here (this screen forgets the join code when it closes): paste the settings from the host link\'s page and the export keeps the same Live.',
    paste: 'Settings copied from the host page (Live ID, join code, live time)', read: 'Load', readOk: 'Loaded the settings', admin: 'This is the host link (it carries the code that controls the Live). Do not paste it here: paste what Copy under “Settings to paste into Egatari Studio” on the host page copied',
    badBlock: 'Not Live settings: ', endpoint: 'Server', room: 'Live ID', key: 'Join code (goes only into the exported file)', from: 'Live starts', to: 'Live ends',
    qa: 'Accept questions from participants (whole lesson)', confused: 'Accept a one-tap “I don’t follow” (whole lesson; counted per step on screen)', polls: 'Polls (per step: shown on participants’ screens when that step is displayed)', addPoll: 'Add poll', step: 'Step to show it at', here: 'Use the step in the preview', prompt: 'Question', choice: (n) => `Choice ${n}`,
    addChoice: 'Add choice', delChoice: 'Remove', delPoll: 'Remove this poll', copy: 'Poll settings (JSON; paste into Poll settings on the host page)', copyBtn: 'Copy poll settings', copied: 'Copied the poll settings. Paste them into Poll settings on the host page and press Save poll settings',
    save: 'Save settings in the lesson (without the join code)', saved: `Wrote the settings to ${CFG} (without the join code)`, portableNote: 'Press Save to keep them in the Egatari file', exp: 'Export with Live…',
    problems: 'To fix before exporting', none: 'None', needKey: 'No join code (press “Make the Live ID and join code here” in ①, or paste the host page\'s settings under the earlier way)', windowNote: 'Times are in this computer\'s time zone', copyFallback: 'Could not copy. Select the text below and copy it',
    keyTip: (k) => `Step id: ${k}`,
    results: 'After the Live: download the results (JSON) on the host page and add them here as an attachment of the lesson (role: data). They stay in the lesson file and never go into the Egatari file (play-only) you hand to participants',
    importResults: 'Import Live results…',
    fail: 'Could not: ', tooLong: 'The live time is too long: a Live lasts at most 3 hours (change the start and end)',
  },
};
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const pad = (n) => String(n).padStart(2, '0');
// RFC 3339 → <input type="datetime-local"> の値（この機械の時間帯）
function toLocalInput(s) {
  const t = Date.parse(s || '');
  if (!isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);   // datetime-local の値はこの機械の時刻として読まれる
  if (!isFinite(d.getTime())) return '';
  return localToRfc3339(v, -d.getTimezoneOffset());
}

export function createLivePanel(o) {
  const LANG = o.lang === 'en' ? 'en' : 'ja';
  const X = STR[LANG];
  // validate の誤り {code, …引数} → 画面の言葉（app/i18n.js の liveProblem）。渡されなければ英語の文のまま
  const say = (p) => (typeof p === 'string' ? p : o.problemText ? o.problemText(p) : String(p));
  const el = o.el;
  // 板の状態（鍵はここだけ。書かない）
  let M = null, steps = [];
  async function readConfig(ws) {
    let text = null;
    try { text = await ws.readText(CFG, { max: READ_LIMITS.json }); } catch { text = null; }
    if (text == null) return {};
    try { const c = JSON.parse(text); return isObj(c) ? c : {}; } catch { return {}; }
  }
  function fromLesson(l) {
    const a = isObj(l && l.activities) ? l.activities : {};
    const polls = [];
    for (const [sk, list] of Object.entries(a)) for (const x of Array.isArray(list) ? list : []) if (isObj(x) && x.kind === 'poll') polls.push({ id: String(x.id || ''), step: sk, prompt: String(x.prompt || ''), choices: Array.isArray(x.choices) ? x.choices.map(String) : ['', ''], label: typeof x.label === 'string' ? x.label : '' });
    const qa = Object.values(a).some((list) => Array.isArray(list) && list.some((x) => isObj(x) && x.kind === 'qa'));
    const qaId = (Object.values(a).flat().find((x) => isObj(x) && x.kind === 'qa') || {}).id || 'qa';
    // 「わからない」（kind confused）：教材全体（"*"）に 1 つ。新しい設定では入、前からの設定にはなければ切
    const cf = (Array.isArray(a['*']) ? a['*'] : []).find((x) => isObj(x) && x.kind === 'confused');
    return { endpoint: (l && l.endpoint) || FORMAT.LIVE_ENDPOINT, room: (l && l.room) || '', key: M ? M.key : '', setup: M ? M.setup : '', from: l && l.window ? l.window.from : '', to: l && l.window ? l.window.to : '', qa: l ? qa : true, qaId,
      confused: l ? !!cf : true, confusedId: (cf && cf.id) || 'confused', polls };
  }
  function activities() {
    const a = {};
    if (M.qa) a['*'] = [{ id: M.qaId || 'qa', kind: 'qa' }];
    if (M.confused) (a['*'] ||= []).push({ id: M.confusedId || 'confused', kind: 'confused' });
    for (const p of M.polls) (a[p.step] ||= []).push({ id: p.id, kind: 'poll', prompt: p.prompt.trim(), choices: p.choices.map((c) => c.trim()), ...(p.label && p.label.trim() ? { label: p.label.trim() } : {}) });
    return a;
  }
  const lessonOf = () => ({ v: 1, endpoint: M.endpoint.trim(), ...(M.room.trim() ? { room: M.room.trim() } : {}), ...(M.from && M.to ? { window: { from: M.from, to: M.to } } : {}), activities: activities() });
  const fullOf = () => ({ v: 1, endpoint: M.endpoint.trim(), room: M.room.trim(), key: M.key.trim(), window: { from: M.from, to: M.to }, activities: activities() });
  function problems() {
    const e = LP.validate(fullOf(), { key: true }).map(say);
    const f = Date.parse(M.from), t = Date.parse(M.to);
    if (f && t && t - f > LP.LIMITS.windowRoomMs) e.unshift(X.tooLong);
    if (!M.key.trim()) e.unshift(X.needKey);
    return e.filter((x, i, l) => l.indexOf(x) === i);
  }
  // 表示名：スライドが見つかる段階（と *）だけ。見つからなければ ''（表示は鍵からの代わり。stepText）
  const slideList = () => { try { return (o.slides && o.slides()) || []; } catch { return []; } };
  function autoLabel(step) {
    if (step === '*') return stepLabel(step, [], LANG);
    const i = String(step || '').lastIndexOf(':');
    return i > 0 && slideList().some((x) => x && x.key === step.slice(0, i)) ? stepLabel(step, slideList(), LANG) : '';
  }
  const nextId = () => { let n = 1; const used = new Set(M.polls.map((p) => p.id)); while (used.has('p' + n)) n++; return 'p' + n; };

  async function open() {
    const ws = o.ws();
    if (!ws) return;
    const conf = await readConfig(ws);
    const l = isObj(conf.extensions) && isObj(conf.extensions.live) ? lessonLive(conf.extensions.live) : null;
    const same = M && M.room === (l && l.room);
    M = { ...fromLesson(l), key: same ? M.key : '', setup: same ? M.setup : '' };
    steps = (o.stepKeys ? await o.stepKeys().catch(() => []) : []) || [];
    for (const p of M.polls) if (!p.label) p.label = autoLabel(p.step);   // label のない古い投票
    render();
  }
  function input(id, value, onchange, attrs = {}) {
    const i = el('input', { type: 'text', id, ...attrs });
    i.value = value || '';
    i.addEventListener('input', () => { onchange(i.value); refreshProblems(); });
    return i;
  }
  let probBox = null, jsonBox = null, setupBox = null, setupNote = null;
  // ホストのページに貼る 1 本の文字列：この画面で作った setup があり、直すことがないときだけ
  const setupText = () => (M.setup && !problems().length ? liveSetupString({ ...fullOf(), setup: M.setup }) : '');
  const hostPage = () => (/^https:\/\/[^/]+$/.test(M.endpoint.trim()) ? M.endpoint.trim() : FORMAT.LIVE_ENDPOINT) + '/';
  function refreshProblems() {
    if (!probBox) return;
    const e = problems();
    probBox.textContent = '';
    probBox.append(el('h3', { text: X.problems }));
    if (!e.length) probBox.append(el('p', { cls: 'live-ok', text: X.none }));
    else probBox.append(el('ul', { id: 'live-problems' }, e.map((x) => el('li', { text: x }))));
    if (jsonBox) jsonBox.value = activitiesText({ activities: activities() });
    if (setupBox) {
      const t = setupText();
      setupBox.value = t;
      setupBox.hidden = !t;
      for (const id of ['live-setup-copy', 'live-setup-save']) { const c = document.getElementById(id); if (c) c.disabled = !t; }
      if (setupNote) setupNote.textContent = t ? '' : M.setup ? X.setupWait : X.setupNone;
    }
    const b = document.getElementById('live-export'); if (b) b.disabled = e.length > 0;
  }
  let embedded = false;
  // ① この画面でライブ ID と参加コードを作る（乱数は crypto.getRandomValues。どこにも要求を出さない）
  async function makeIds() {
    if (M.setup && !confirm(X.remakeConfirm)) return;
    try {
      const s = await newLiveSetup();
      M.setup = s.setup; M.room = s.room; M.key = s.key;
      render();
    } catch (err) { o.toast(X.fail + (err.message || err), true); }
  }
  function render() {
    embedded = !!(o.embedded && o.embedded());
    const dl = el('datalist', { id: 'live-steps' }, steps.map((k) => el('option', { value: k, label: stepText(k, autoLabel(k), LANG) })));
    const paste = el('textarea', { id: 'live-paste', rows: '5', 'aria-label': X.paste, spellcheck: 'false' });
    const readBtn = el('button', { type: 'button', id: 'live-read', text: X.read, onclick: () => {
      try {
        const r = parseRoomBlock(paste.value);
        M.endpoint = r.endpoint; M.room = r.room; M.key = r.key; M.from = r.window.from; M.to = r.window.to;
        M.setup = '';   // ホストのページで作ったライブ：貼る文字列はない
        // 部屋の字に活動があり、この教材にまだなければ使う
        if (r.activities && !M.polls.length) { const f = fromLesson({ activities: r.activities }); M.polls = f.polls; M.qa = f.qa; M.qaId = f.qaId; M.confused = f.confused; M.confusedId = f.confusedId; }
        paste.value = '';
        o.toast(X.readOk); render();
      } catch (e) { o.toast(e.message === 'admin' ? X.admin : X.badBlock + (e.details ? e.details.map(say).join('; ') : e.message), true); }
    } });
    const winFrom = el('input', { type: 'datetime-local', id: 'live-from', 'aria-label': X.from });
    const winTo = el('input', { type: 'datetime-local', id: 'live-to', 'aria-label': X.to });
    winFrom.value = toLocalInput(M.from); winTo.value = toLocalInput(M.to);
    winFrom.addEventListener('change', () => { M.from = fromLocalInput(winFrom.value); refreshProblems(); });
    winTo.addEventListener('change', () => { M.to = fromLocalInput(winTo.value); refreshProblems(); });
    const qa = el('input', { type: 'checkbox', id: 'live-qa' }); qa.checked = !!M.qa;
    qa.addEventListener('change', () => { M.qa = qa.checked; refreshProblems(); });
    const cfBox = el('input', { type: 'checkbox', id: 'live-confused' }); cfBox.checked = !!M.confused;
    cfBox.addEventListener('change', () => { M.confused = cfBox.checked; refreshProblems(); });
    const pollEls = M.polls.map((p, pi) => {
      const legend = el('legend', {}), shown = el('span', { cls: 'live-step-label', id: `live-poll-${pi}-label` });
      // 段階が変わったら表示名も作り直す（鍵はそのまま）
      const showStep = () => {
        const t = stepText(p.step, p.label, LANG), tip = X.keyTip(p.step);
        legend.textContent = `${p.id} · ${t}`; legend.title = tip;
        shown.textContent = t; shown.title = tip;
      };
      const setStep = (k) => { p.step = k; p.label = autoLabel(k); showStep(); };
      const step = input(`live-poll-${pi}-step`, p.step, (v) => setStep(v.trim()), { list: 'live-steps', 'aria-label': X.step, spellcheck: 'false' });
      const here = el('button', { type: 'button', cls: 'live-here', text: X.here, onclick: () => { const k = o.currentStep && o.currentStep(); if (k) { setStep(k); step.value = k; refreshProblems(); } } });
      showStep();
      const prompt = input(`live-poll-${pi}-prompt`, p.prompt, (v) => { p.prompt = v; }, { maxlength: String(LP.LIMITS.prompt), 'aria-label': X.prompt });
      const choices = p.choices.map((c, ci) => el('div', { cls: 'live-choice' }, [
        input(`live-poll-${pi}-c${ci}`, c, (v) => { p.choices[ci] = v; }, { maxlength: String(LP.LIMITS.choice), 'aria-label': X.choice(ci + 1) }),
        p.choices.length > 2 ? el('button', { type: 'button', text: X.delChoice, 'aria-label': X.delChoice + ' ' + X.choice(ci + 1), onclick: () => { p.choices.splice(ci, 1); render(); } }) : null,
      ]));
      return el('fieldset', { cls: 'live-poll', 'data-id': p.id }, [
        legend,
        el('label', {}, [el('span', { text: X.step }), step]), shown, here,
        el('label', {}, [el('span', { text: X.prompt }), prompt]),
        ...choices,
        el('div', { cls: 'row' }, [
          p.choices.length < MAX_CHOICES ? el('button', { type: 'button', cls: 'live-addchoice', text: X.addChoice, onclick: () => { p.choices.push(''); render(); } }) : null,
          el('button', { type: 'button', cls: 'live-delpoll', text: X.delPoll, onclick: () => { M.polls.splice(pi, 1); render(); } }),
        ]),
      ]);
    });
    const resultsInput = el('input', { type: 'file', id: 'live-results-file', accept: '.json,application/json', hidden: 'hidden' });
    resultsInput.addEventListener('change', () => { const f = (resultsInput.files || [])[0]; resultsInput.value = ''; if (f && o.importResults) o.importResults(f).catch((e) => o.toast(X.fail + (e.message || e), true)); });
    jsonBox = el('textarea', { id: 'live-json', rows: '6', readonly: 'readonly', spellcheck: 'false', 'aria-label': X.copy });
    setupBox = el('textarea', { id: 'live-setup', rows: '4', readonly: 'readonly', spellcheck: 'false', autocomplete: 'off', 'aria-label': X.s3 });
    setupNote = el('p', { cls: 'note', id: 'live-setup-note' });
    probBox = el('div', { id: 'live-problem-box' });
    // ① の状態：この画面で作った／ホストのページの設定／まだない
    const ids = M.setup && M.room ? X.madeHere(M.room) : M.key && M.room ? X.fromHost(M.room) : X.noIds;
    const manualOpen = !M.setup && !!M.key;   // 前からの方法で読み込んだ設定を使っているときは開いておく
    const manual = el('details', { id: 'live-manual', ...(manualOpen ? { open: 'open' } : {}) }, [
      el('summary', { text: X.manual }),
      el('p', { cls: 'note', text: X.manualLead }),
      el('label', {}, [el('span', { text: X.paste }), paste]), el('div', { cls: 'row' }, [readBtn]),
      el('label', {}, [el('span', { text: X.endpoint }), input('live-endpoint', M.endpoint, (v) => { M.endpoint = v; }, { spellcheck: 'false' })]),
      el('label', {}, [el('span', { text: X.room }), input('live-room', M.room, (v) => { M.room = v.trim(); M.setup = ''; }, { spellcheck: 'false', placeholder: 'r-xxxxxxxx' })]),
      el('label', {}, [el('span', { text: X.key }), input('live-key', M.key, (v) => { M.key = v.trim(); M.setup = ''; }, { spellcheck: 'false', autocomplete: 'off' })]),
      el('h4', { text: X.copy }), jsonBox,
      el('div', { cls: 'row' }, [el('button', { type: 'button', id: 'live-copy', text: X.copyBtn, onclick: copyActivities })]),
    ]);
    const body = [
      el('div', { id: 'live-panel' }, [
        el('p', { cls: 'lead', text: X.lead }),
        el('h3', { text: X.s1 }),
        el('p', { id: 'live-ids', text: ids }),
        el('div', { cls: 'row' }, [el('button', { type: 'button', id: 'live-make', cls: M.setup || M.key ? '' : 'pri', text: M.setup || M.key ? X.remake : X.make, onclick: makeIds })]),
        el('h3', { text: X.s2 }),
        el('label', {}, [el('span', { text: X.from }), winFrom]), el('label', {}, [el('span', { text: X.to }), winTo]),
        el('p', { cls: 'note', text: X.windowNote }),
        el('label', { cls: 'check' }, [qa, el('span', { text: X.qa })]),
        el('label', { cls: 'check' }, [cfBox, el('span', { text: X.confused })]),
        el('h4', { text: X.polls }), dl, ...pollEls,
        el('div', { cls: 'row' }, [el('button', { type: 'button', id: 'live-addpoll', text: X.addPoll, onclick: () => { const k = (o.currentStep && o.currentStep()) || ''; M.polls.push({ id: nextId(), step: k, prompt: '', choices: ['', ''], label: autoLabel(k) }); render(); } })]),
        probBox,
        el('section', { id: 'live-oneway' }, M.key && !M.setup ? [] : [
          el('h3', { text: X.s3 }),
          el('p', { text: X.setupHelp }),
          setupNote, setupBox,
          el('div', { cls: 'row' }, [
            el('button', { type: 'button', id: 'live-setup-copy', cls: 'pri', text: X.copySetup, onclick: copySetup }),
            el('button', { type: 'button', id: 'live-setup-save', text: X.saveSetup, onclick: saveSetupFile }),
            el('a', { id: 'live-host-link', href: hostPage(), target: '_blank', rel: 'noopener noreferrer', text: LANG === 'ja' ? `${X.hostLink}（${hostPage().replace(/\/$/, '')}）` : `${X.hostLink} (${hostPage().replace(/\/$/, '')})` }),
          ]),
          el('p', { cls: 'note live-warn', id: 'live-setup-warn', text: X.setupWarn }),
          el('p', { cls: 'note', id: 'live-setup-lost', text: X.setupLost }),
          el('p', { cls: 'note', text: X.setupAfter }),
        ]),
        el('h3', { text: X.s4 }),
        el('div', { cls: 'row' }, [
          el('button', { type: 'button', id: 'live-save', text: X.save, onclick: () => save().catch((e) => o.toast(X.fail + (e.message || e), true)) }),
          embedded ? null : el('button', { type: 'button', id: 'live-export', cls: 'pri', text: X.exp, onclick: exportNow }),
        ]),
        manual,
        o.importResults && !embedded ? el('h3', { text: X.importResults.replace(/…$/, '') }) : null,
        o.importResults && !embedded ? el('p', { cls: 'note', text: X.results }) : null,
        o.importResults && !embedded ? el('div', { cls: 'row' }, [resultsInput, el('button', { type: 'button', id: 'live-import-results', text: X.importResults, onclick: () => resultsInput.click() })]) : null,
      ]),
    ];
    o.openPanel(X.title, body);
    refreshProblems();
  }
  // 設定の文字列を小さな .txt としてダウンロードする（blob: の URL。どこにも要求を出さない）。作業フォルダにも教材にも書かない
  const setupFileName = () => `${FORMAT.NAME}-live-setup-${M.room}.txt`;
  function saveSetupFile() {
    const t = setupText();
    if (!t) return;
    const url = URL.createObjectURL(new Blob([t + '\n'], { type: 'text/plain;charset=utf-8' }));
    const a = el('a', { href: url, download: setupFileName(), hidden: 'hidden' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    o.toast(X.savedSetup(setupFileName()));
  }
  async function copySetup() {
    const t = setupText();
    if (!t) return;
    try { await navigator.clipboard.writeText(t); o.toast(X.copiedSetup); }
    catch { o.toast(X.copyFallback, true); if (setupBox) { setupBox.focus(); setupBox.select(); } }
  }
  async function copyActivities() {
    const t = activitiesText({ activities: activities() });
    try { await navigator.clipboard.writeText(t); o.toast(X.copied); }
    catch { o.toast(X.copyFallback, true); if (jsonBox) { jsonBox.focus(); jsonBox.select(); } }
  }
  // 教材に残す（鍵なし。設定のファイルのほかの項目はそのまま）
  async function save() {
    const why = await o.beforeWrite();
    if (why) { o.toast(why, true); return false; }
    const ws = o.ws(), g = o.generation();
    if (!ws) return false;
    // extensions.live だけを変える（ほかの項目はバイトのまま。読めないファイルは上書きせずに断る。kit/core/config-file.mjs）
    const old = await ws.readText(CFG, { max: READ_LIMITS.json });
    if (o.ws() !== ws || o.generation() !== g) return false;
    const text = updateConfig(old, { extensions: configMerge({ live: lessonLive(lessonOf()) }) });
    if (text.includes(M.key.trim()) && M.key.trim()) throw new Error('the key would be written');   // 念のため
    if (M.setup && text.includes(M.setup)) throw new Error('the setup secret would be written');
    if (await ws.exists(CFG)) await ws.backup(CFG, { max: READ_LIMITS.json });
    await ws.writeText(CFG, text);
    await o.afterWrite();
    o.toast(X.saved + (ws.kind === 'memory' ? ' · ' + X.portableNote : ''));
    return true;
  }
  async function exportNow() {
    const e = problems();
    if (e.length) { refreshProblems(); o.toast(e[0], true); return; }
    try {
      // 作業フォルダ：設定を先に残す（書き出しは保存したものから組む）。1 ファイル：保存していない変更を作らない（設定は「設定を教材に残す」→「保存」）
      if (!o.portable()) { if (!(await save())) return; }
      await o.exportLive(fullOf(), { oneWay: !!M.setup });
    } catch (err) { o.toast(X.fail + (err.message || err), true); }
  }
  // 窓の「書き出す…」から（embedded）：直すことがあれば知らせて false
  function ready() {
    if (!M) return false;
    const e = problems();
    if (e.length) { refreshProblems(); o.toast(e[0], true); const b = document.getElementById('live-problem-box'); if (b) b.scrollIntoView({ block: 'nearest' }); return false; }
    return true;
  }
  // 書き出す前に：作業フォルダは設定を残す（書き出しは保存したものから組む）。返すもの：鍵を含む完全な設定（できなければ null）
  async function prepare() {
    if (!ready()) return null;
    try { if (!o.portable() && !(await save())) return null; } catch (err) { o.toast(X.fail + (err.message || err), true); return null; }
    return fullOf();
  }
  return { open, isOpen: () => o.isOpen(), ready, prepare, oneWay: () => !!(M && M.setup) };
}
