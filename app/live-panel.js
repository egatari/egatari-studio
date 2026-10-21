// 「授業の部屋を付けて配る」の板（編集アプリの横の板 #panel。拡張 live、format spec の extensions/live.md）：再生専用の書き出しの選べる形
// - 部屋（room）と参加の鍵（key）は、教員のページ（部屋のサービスの画面）で部屋を作ってコピーした字を貼る。この画面はどこにもつながらない（要求を出さない）
// - 窓（いつからいつまで）・Q&A（教材全体で入／切）・段階ごとの投票（問いと 2〜6 の選択肢）を決める。部屋も同じ活動を知る必要があるので、活動の JSON をコピーして教員のページに渡す
// - 教材に残すのは鍵のない設定（設定のファイル FORMAT.CONFIG_FILE の extensions.live。書き出すと索引の extensions.live）。鍵は書き出す派生にだけ入り、この板が覚えるのは開いているあいだだけ
//
//   const panel = createLivePanel({lang, el, ws(), generation(), openPanel(title, body), isOpen(), toast, beforeWrite() → null | 理由, afterWrite(),
//     currentStep() → 段階の鍵 | null, stepKeys() → Promise<[段階の鍵]>, slides() → [{key, heading}], exportLive(live) → Promise, portable() → bool})
// - 投票には表示名（label。「4 枚目『XML の壁』・段階 1」）を付ける：作るとき・段階を変えたとき・label のない古い投票を開いたとき（スライドが見つかれば）。
//   段階の鍵を出していたところ（段階の候補・投票の一覧）には label を出し、鍵は title の吹き出しに。鍵そのものは変えない
//   panel.open()
import { FORMAT } from '../kit/core/format.mjs';
import { LivePolicy } from '../kit/core/live-policy.mjs';
import { parseRoomBlock, lessonLive, activitiesText, localToRfc3339, stepLabel, stepText } from '../kit/core/live.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';

const LP = LivePolicy();
const CFG = FORMAT.CONFIG_FILE;
const MAX_CHOICES = 6;
const STR = {
  ja: {
    title: '授業の部屋を付けて配る',
    lead: `学ぶ人に配る再生専用（${FORMAT.PLAY_EXT}）に、授業の部屋（質問と投票）を付けます。部屋は ${FORMAT.LIVE_ENDPOINT.replace(/^https:\/\//, '')} の教員のページで作り、そこでコピーした字を下に貼ってください。この画面はどこにもつながりません。教材に残すのは鍵のない設定だけで、参加の鍵は書き出すファイルにだけ入ります`,
    paste: '教員のページからコピーした字（部屋・鍵・時間の窓）', read: '読み取る', readOk: '部屋の字を読み取りました', admin: 'これは教員のリンク（教員の鍵が入っています）です。貼らないでください。教員のページの「コピー」の字を貼ってください',
    badBlock: '部屋の字として読めません：', endpoint: '部屋のサービス', room: '部屋', key: '参加の鍵（書き出すファイルにだけ入ります）', from: '開く時刻', to: '閉じる時刻',
    qa: 'Q&A（教材全体。学ぶ人が質問を送れる）', polls: '投票（段階ごと。その段階に来たときに出ます）', addPoll: '投票を足す', step: '段階', here: 'プレビューの段階', prompt: '問い', choice: (n) => `選択肢 ${n}`,
    addChoice: '選択肢を足す', delChoice: '消す', delPoll: 'この投票を消す', copy: '活動の JSON（教員のページの「活動」に貼る）', copyBtn: '活動の JSON をコピー', copied: '活動の JSON をコピーしました。教員のページの「活動」に貼って保存してください',
    save: '設定を教材に残す（鍵なし）', saved: `設定を ${CFG} に書きました（鍵は書きません）`, portableNote: '1 ファイルに残すには「保存」を押してください', exp: '部屋を付けて書き出す…',
    problems: '直すこと', none: 'ありません', needKey: '参加の鍵がありません（教員のページの字を貼ってください）', windowNote: '時刻はこの機械の時間帯で入れます', copyFallback: 'コピーできませんでした。下の字を選んでコピーしてください',
    keyTip: (k) => `段階の鍵：${k}`,
    fail: 'できませんでした：', tooLong: '時間の窓が長すぎます。部屋のサービスで作れるのは 3 時間までです（開く時刻と閉じる時刻を直してください）',
  },
  en: {
    title: 'Distribute with a live room',
    lead: `Adds a live room (questions and polls) to the play-only copy for learners (${FORMAT.PLAY_EXT}). Create the room on the teacher page at ${FORMAT.LIVE_ENDPOINT.replace(/^https:\/\//, '')} and paste what you copied there below. This screen connects nowhere. The lesson keeps only the settings without the key; the key goes only into the exported file`,
    paste: 'Text copied from the teacher page (room, key, window)', read: 'Read', readOk: 'Read the room details', admin: 'This is the teacher link (it carries the teacher key). Do not paste it here: paste the text from the teacher page\'s Copy button',
    badBlock: 'Not room details: ', endpoint: 'Room service', room: 'Room', key: 'Learner key (goes only into the exported file)', from: 'Opens at', to: 'Closes at',
    qa: 'Q&A (whole lesson: learners can send questions)', polls: 'Polls (per step: shown when that step is reached)', addPoll: 'Add poll', step: 'Step', here: 'Step in the preview', prompt: 'Question', choice: (n) => `Choice ${n}`,
    addChoice: 'Add choice', delChoice: 'Remove', delPoll: 'Remove this poll', copy: 'Activities JSON (paste it into the teacher page\'s Activities)', copyBtn: 'Copy activities JSON', copied: 'Copied the activities JSON. Paste it into Activities on the teacher page and save',
    save: 'Keep settings in the lesson (no key)', saved: `Wrote the settings to ${CFG} (without the key)`, portableNote: 'Press Save to keep them in the single file', exp: 'Export with the live room…',
    problems: 'To fix', none: 'None', needKey: 'No learner key (paste the text from the teacher page)', windowNote: 'Times are in this computer\'s time zone', copyFallback: 'Could not copy. Select the text below and copy it',
    keyTip: (k) => `Step key: ${k}`,
    fail: 'Could not: ', tooLong: 'The window is too long: the room service makes rooms of at most 3 hours (change the opening and closing times)',
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
    return { endpoint: (l && l.endpoint) || FORMAT.LIVE_ENDPOINT, room: (l && l.room) || '', key: M ? M.key : '', from: l && l.window ? l.window.from : '', to: l && l.window ? l.window.to : '', qa: l ? qa : true, qaId, polls };
  }
  function activities() {
    const a = {};
    if (M.qa) a['*'] = [{ id: M.qaId || 'qa', kind: 'qa' }];
    for (const p of M.polls) (a[p.step] ||= []).push({ id: p.id, kind: 'poll', prompt: p.prompt.trim(), choices: p.choices.map((c) => c.trim()), ...(p.label && p.label.trim() ? { label: p.label.trim() } : {}) });
    return a;
  }
  const lessonOf = () => ({ v: 1, endpoint: M.endpoint.trim(), ...(M.room.trim() ? { room: M.room.trim() } : {}), ...(M.from && M.to ? { window: { from: M.from, to: M.to } } : {}), activities: activities() });
  const fullOf = () => ({ v: 1, endpoint: M.endpoint.trim(), room: M.room.trim(), key: M.key.trim(), window: { from: M.from, to: M.to }, activities: activities() });
  function problems() {
    const e = LP.validate(fullOf(), { key: true });
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
    M = { ...fromLesson(l), key: M && M.room === (l && l.room) ? M.key : '' };
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
  let probBox = null, jsonBox = null;
  function refreshProblems() {
    if (!probBox) return;
    const e = problems();
    probBox.textContent = '';
    probBox.append(el('h3', { text: X.problems }));
    if (!e.length) probBox.append(el('p', { cls: 'live-ok', text: X.none }));
    else probBox.append(el('ul', { id: 'live-problems' }, e.map((x) => el('li', { text: x }))));
    if (jsonBox) jsonBox.value = activitiesText({ activities: activities() });
    const b = document.getElementById('live-export'); if (b) b.disabled = e.length > 0;
  }
  function render() {
    const dl = el('datalist', { id: 'live-steps' }, steps.map((k) => el('option', { value: k, label: stepText(k, autoLabel(k), LANG) })));
    const paste = el('textarea', { id: 'live-paste', rows: '5', 'aria-label': X.paste, spellcheck: 'false' });
    const readBtn = el('button', { type: 'button', id: 'live-read', text: X.read, onclick: () => {
      try {
        const r = parseRoomBlock(paste.value);
        M.endpoint = r.endpoint; M.room = r.room; M.key = r.key; M.from = r.window.from; M.to = r.window.to;
        // 部屋の字に活動があり、この教材にまだなければ使う
        if (r.activities && !M.polls.length) { const f = fromLesson({ activities: r.activities }); M.polls = f.polls; M.qa = f.qa; M.qaId = f.qaId; }
        paste.value = '';
        o.toast(X.readOk); render();
      } catch (e) { o.toast(e.message === 'admin' ? X.admin : X.badBlock + (e.details ? e.details.join('; ') : e.message), true); }
    } });
    const winFrom = el('input', { type: 'datetime-local', id: 'live-from', 'aria-label': X.from });
    const winTo = el('input', { type: 'datetime-local', id: 'live-to', 'aria-label': X.to });
    winFrom.value = toLocalInput(M.from); winTo.value = toLocalInput(M.to);
    winFrom.addEventListener('change', () => { M.from = fromLocalInput(winFrom.value); refreshProblems(); });
    winTo.addEventListener('change', () => { M.to = fromLocalInput(winTo.value); refreshProblems(); });
    const qa = el('input', { type: 'checkbox', id: 'live-qa' }); qa.checked = !!M.qa;
    qa.addEventListener('change', () => { M.qa = qa.checked; refreshProblems(); });
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
    jsonBox = el('textarea', { id: 'live-json', rows: '6', readonly: 'readonly', spellcheck: 'false', 'aria-label': X.copy });
    probBox = el('div', { id: 'live-problem-box' });
    const body = [
      el('div', { id: 'live-panel' }, [
        el('p', { cls: 'lead', text: X.lead }),
        el('label', {}, [el('span', { text: X.paste }), paste]), el('div', { cls: 'row' }, [readBtn]),
        el('label', {}, [el('span', { text: X.endpoint }), input('live-endpoint', M.endpoint, (v) => { M.endpoint = v; }, { spellcheck: 'false' })]),
        el('label', {}, [el('span', { text: X.room }), input('live-room', M.room, (v) => { M.room = v.trim(); }, { spellcheck: 'false', placeholder: 'r-xxxxxxxx' })]),
        el('label', {}, [el('span', { text: X.key }), input('live-key', M.key, (v) => { M.key = v.trim(); }, { spellcheck: 'false', autocomplete: 'off' })]),
        el('label', {}, [el('span', { text: X.from }), winFrom]), el('label', {}, [el('span', { text: X.to }), winTo]),
        el('p', { cls: 'note', text: X.windowNote }),
        el('label', { cls: 'check' }, [qa, el('span', { text: X.qa })]),
        el('h3', { text: X.polls }), dl, ...pollEls,
        el('div', { cls: 'row' }, [el('button', { type: 'button', id: 'live-addpoll', text: X.addPoll, onclick: () => { const k = (o.currentStep && o.currentStep()) || ''; M.polls.push({ id: nextId(), step: k, prompt: '', choices: ['', ''], label: autoLabel(k) }); render(); } })]),
        probBox,
        el('h3', { text: X.copy }), jsonBox,
        el('div', { cls: 'row' }, [
          el('button', { type: 'button', id: 'live-copy', text: X.copyBtn, onclick: copyActivities }),
        ]),
        el('div', { cls: 'row' }, [
          el('button', { type: 'button', id: 'live-save', text: X.save, onclick: () => save().catch((e) => o.toast(X.fail + (e.message || e), true)) }),
          el('button', { type: 'button', id: 'live-export', cls: 'pri', text: X.exp, onclick: exportNow }),
        ]),
      ]),
    ];
    o.openPanel(X.title, body);
    refreshProblems();
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
    const conf = await readConfig(ws);
    if (o.ws() !== ws || o.generation() !== g) return false;
    const ext = isObj(conf.extensions) ? { ...conf.extensions } : {};
    ext.live = lessonLive(lessonOf());
    const text = JSON.stringify({ ...conf, extensions: ext }, null, 2) + '\n';
    if (text.includes(M.key.trim()) && M.key.trim()) throw new Error('the key would be written');   // 念のため
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
      await o.exportLive(fullOf());
    } catch (err) { o.toast(X.fail + (err.message || err), true); }
  }
  return { open, isOpen: () => o.isOpen() };
}
