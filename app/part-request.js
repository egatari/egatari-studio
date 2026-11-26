// 「こんなパーツが欲しい…」（handoff Issue #35、backlog #117）：作成者が GitHub を使わずに、欲しいパーツを egatari/components の公開の Issue として送る窓
// - 送るのは作成者が欄に書いた字だけ（見せたいもの・教科・学年）。教材の中身・名前・端末の情報は送らない。絵や写真も送らない
//   （中継のトークンは Issue だけを書けるので、絵を置く所がない。窓では「言葉で書いてください」と知らせる）
// - 中継（relay/。Cloudflare Worker と Turnstile）の確認の枠（/widget）を、この窓の中の iframe に出す。Turnstile のスクリプトと中継への送信は
//   その枠（中継の origin）の中だけで動き、このページは他所のスクリプトを読み込まず、他所に接続もしない（CSP の connect-src 'self' はそのまま。
//   frame-src にだけ中継の origin を足す）。このページと枠のやりとりは postMessage（形は relay/src/widget.js の先頭）
// - 中継の場所は PART_REQUEST_RELAY の 1 か所。app/index.html の CSP の frame-src と合わせる（tools/test-relay.mjs が確かめる）。
//   空のとき（中継を止めたとき）と、オフライン版のエディタ（file:// などでは枠を出せない）は、送れないことと、GitHub での提案のリンクを出す
// - 試験は __APP_TEST.partRequestRelay で中継を差し替える（手元の中継。'' なら「まだ準備中」）。本物の中継には繋がない
//
//   const pr = createPartRequest({ lang: 'ja' | 'en', el })   pr.open() → 窓を出す（ほかの窓の上にも重ねられるよう、#dlg とは別の <dialog>）
import { LIMITS, MSG_TYPE, checkRequest, RequestError } from '../relay/src/request.js';

// 中継の URL（v0.6.21 から request.egatari.org に置いた。handoff #35）。app/index.html の CSP の frame-src はこの origin だけ（tools/test-relay.mjs が照らす）。
// 空にすると窓は「まだ準備中」に戻る（そのときは frame-src も 'none' に戻す）
export const PART_REQUEST_RELAY = 'https://request.egatari.org';
// GitHub のアカウントがある人の道：egatari/components の Issue の選び場所（提案の様式）
export const PROPOSAL_URL = 'https://github.com/egatari/components/issues/new/choose';
// 枠が「読み込めた」と知らせてくるまで待つ時間（ms）。越えたら読み込めなかったと出す
export const READY_TIMEOUT_MS = 20000;

export const relayOrigin = (relay) => { try { return relay ? new URL(relay).origin : ''; } catch { return ''; } };
// 送れるか：'ok' | 'unset'（中継がまだない）| 'offline'（このページが http(s) でない：オフライン版のエディタ）
export const availability = (relay, loc) => (!relayOrigin(relay) ? 'unset' : /^https?:$/.test(loc.protocol) && loc.origin && loc.origin !== 'null' ? 'ok' : 'offline');
export const widgetUrl = (relay, parent, lang) => `${relayOrigin(relay)}/widget?parent=${encodeURIComponent(parent)}&lang=${lang === 'ja' ? 'ja' : 'en'}`;

export const STR = {
  ja: {
    entry: 'こんなパーツが欲しい…',
    title: 'こんなパーツが欲しい',
    lead: '教材で見せたい図や動きを書いて送ってください。Egatari の開発者が読んで、パーツにできるかを検討します。返事は、送ったあとに出る Issue のページに書きます。',
    what: '見せたいもの（必須）',
    whatPh: '例：水の循環を、蒸発 → 凝結 → 降水の順に矢印で見せたい。ステップごとに 1 つずつ出したい',
    subject: '分野（任意）', subjectPh: '例：中学の理科',
    grade: '学年・対象（任意）', gradePh: '例：中学 2 年',
    noImage: '絵や写真は送れません。思い浮かべている図は、言葉で書いてください。',
    consent: '送るのは、上の欄に書いた文字だけです。教材の中身や、名前・メールアドレスなどは含めません。書いた文字は GitHub のリポジトリ egatari/components に公開の Issue として載り、誰でも読めます。個人の情報や、公開できない教材の内容は書かないでください。',
    checkNote: '送る前に、下の枠で確認（Cloudflare Turnstile）をします。確認のため、このブラウザの情報と IP アドレスが Cloudflare に渡ります。中継のサーバーはそれを保存しません。',
    frameTitle: '送る前の確認',
    send: '送る', cancel: 'キャンセル', close: '閉じる',
    loading: '確認の枠を読み込んでいます…',
    needCheck: '下の枠の確認が済むと送れます。',
    needWhat: '「見せたいもの」を書いてください。',
    tooLong: (n) => `長すぎます（${n} 字まで）。`,
    sending: '送っています…',
    sent: '送りました。Issue のページ：',
    sentNote: 'このページで、開発者からの返事を読めます（GitHub のアカウントがなくても読めます）。',
    unset: 'この機能はまだ準備中で、今は送れません。GitHub のアカウントがあれば、パーツの提案の Issue を書けます。',
    offline: 'オフライン版のエディタからは送れません。https://studio.egatari.org/ で開いて送ってください。GitHub のアカウントがあれば、パーツの提案の Issue を書けます。',
    proposal: 'GitHub でパーツを提案する',
    loadFail: '確認の枠を読み込めませんでした。ネットワークを確かめて、窓を開き直してください。',
    errRate: '続けて送りすぎました。1 分ほど待ってから、もう一度送ってください。',
    errCheck: '確認が済んでいないか、期限が切れました。下の枠でもう一度確認してから送ってください。',
    errInput: '書いた内容を送れませんでした。欄を確かめてください。',
    errFail: '送れませんでした。時間をおいて、もう一度送ってください。',
  },
  en: {
    entry: 'Request a part…',
    title: 'Request a part',
    lead: 'Describe the figure or motion you want to show in a lesson. The Egatari developers read it and consider making a part for it. Replies are written on the issue page shown afterwards.',
    what: 'What you want to show (required)',
    whatPh: 'e.g. The water cycle with arrows: evaporation → condensation → precipitation, one at each step',
    subject: 'Subject or field (optional)', subjectPh: 'e.g. Science, lower secondary',
    grade: 'Grade or audience (optional)', gradePh: 'e.g. Grade 8',
    noImage: 'Drawings and photos cannot be attached. Describe the figure you have in mind in words.',
    consent: 'The request contains only the text you type in the fields above: no lesson content, name or e-mail address. The text becomes a public issue in the GitHub repository egatari/components, which anyone can read. Do not write personal information or lesson content that cannot be made public.',
    checkNote: 'Before sending, there is a check (Cloudflare Turnstile) in the box below. For the check, this browser\'s information and IP address go to Cloudflare. The relay server does not save them.',
    frameTitle: 'Check before sending',
    send: 'Send', cancel: 'Cancel', close: 'Close',
    loading: 'Loading the check…',
    needCheck: 'You can send once the check in the box below has passed.',
    needWhat: 'Write what you want to show.',
    tooLong: (n) => `Too long (up to ${n} characters).`,
    sending: 'Sending…',
    sent: 'Done. Your request is on GitHub:',
    sentNote: 'Replies from the developers appear on that page (you can read it without a GitHub account).',
    unset: 'This feature is not available yet. If you have a GitHub account, you can write a part proposal issue.',
    offline: 'Requests do not work in the offline editor. Open https://studio.egatari.org/ and make the request there. If you have a GitHub account, you can write a part proposal issue.',
    proposal: 'Propose a part on GitHub',
    loadFail: 'The check could not be loaded. Check the network and open this dialog again.',
    errRate: 'Too many requests in a row. Wait about a minute and send again.',
    errCheck: 'The check has not passed or has expired. Do the check in the box below again, then send.',
    errInput: 'What you wrote was not accepted. Check the fields.',
    errFail: 'Something went wrong. Try again later.',
  },
};

// 中継が返す誤りの種類 → 窓の言葉
export function errorText(code, X) {
  if (code === 'rate_limited') return X.errRate;
  if (code === 'turnstile_required' || code === 'turnstile_failed') return X.errCheck;
  if (['too_long', 'what_required', 'bad_field', 'unknown_field', 'bad_request', 'too_large'].includes(code)) return X.errInput;
  return X.errFail;
}

export function createPartRequest({ lang, el, relay = () => (window.__APP_TEST && typeof window.__APP_TEST.partRequestRelay === 'string' ? window.__APP_TEST.partRequestRelay : PART_REQUEST_RELAY), loc = () => location }) {
  const X = STR[lang === 'ja' ? 'ja' : 'en'];
  function open() {
    const prev = document.getElementById('part-request');
    if (prev) prev.remove();
    const r = relay(), l = loc();
    const state = availability(r, l);
    const d = el('dialog', { id: 'part-request', cls: 'app-dlg', 'aria-labelledby': 'pr-title' });
    const closeBtn = (text, pri) => el('button', { type: 'button', id: 'pr-close', cls: pri ? 'pri' : '', text, onclick: () => d.close() });
    const proposal = () => el('p', {}, [el('a', { id: 'pr-proposal', href: PROPOSAL_URL, target: '_blank', rel: 'noopener noreferrer', text: X.proposal })]);
    d.append(el('h2', { id: 'pr-title', text: X.title }), el('p', { id: 'pr-lead', cls: 'hint', text: X.lead }));
    let onMsg = null, timer = 0;
    d.addEventListener('close', () => { if (onMsg) window.removeEventListener('message', onMsg); clearTimeout(timer); d.remove(); });
    if (state !== 'ok') {
      d.append(el('p', { id: 'pr-unavailable', role: 'status', text: state === 'offline' ? X.offline : X.unset }), proposal(), el('div', { cls: 'row' }, [closeBtn(X.close, true)]));
      document.body.append(d);
      d.showModal();
      return d;
    }
    const origin = relayOrigin(r);
    const field = (id, label, input) => el('label', { cls: 'pr-field', for: id }, [el('span', { text: label }), input]);
    const what = el('textarea', { id: 'pr-what', rows: '5', maxlength: String(LIMITS.WHAT_MAX), placeholder: X.whatPh, required: '', 'aria-describedby': 'pr-noimage' });
    const subject = el('input', { type: 'text', id: 'pr-subject', maxlength: String(LIMITS.SHORT_MAX), placeholder: X.subjectPh, autocomplete: 'off' });
    const grade = el('input', { type: 'text', id: 'pr-grade', maxlength: String(LIMITS.SHORT_MAX), placeholder: X.gradePh, autocomplete: 'off' });
    const status = el('p', { id: 'pr-status', cls: 'hint', role: 'status', 'aria-live': 'polite', text: X.loading });
    const frame = el('iframe', { id: 'pr-check', title: X.frameTitle, src: widgetUrl(r, l.origin, lang), referrerpolicy: 'no-referrer',
      sandbox: 'allow-scripts allow-same-origin allow-popups', loading: 'eager' });
    const send = el('button', { type: 'button', id: 'pr-send', cls: 'pri', text: X.send, disabled: '' });
    const form = el('div', { id: 'pr-form' }, [
      field('pr-what', X.what, what), el('p', { id: 'pr-noimage', cls: 'hint', text: X.noImage }),
      field('pr-subject', X.subject, subject), field('pr-grade', X.grade, grade),
      el('p', { id: 'pr-consent', cls: 'pr-consent', text: X.consent }),
      el('p', { id: 'pr-checknote', cls: 'hint', text: X.checkNote }), frame, status]);
    d.append(form, el('div', { cls: 'row', id: 'pr-buttons' }, [el('button', { type: 'button', id: 'pr-cancel', text: X.cancel, onclick: () => d.close() }), send]));
    let ready = false, token = false, busy = false, done = false;
    const say = (t) => { status.textContent = t; };
    const update = () => { send.disabled = !(ready && token && !busy && !done); };
    const toFrame = (m) => { if (frame.contentWindow) frame.contentWindow.postMessage({ type: MSG_TYPE, ...m }, origin); };
    onMsg = (e) => {
      if (e.origin !== origin || e.source !== frame.contentWindow) return;
      const m = e.data;
      if (!m || typeof m !== 'object' || m.type !== MSG_TYPE) return;
      if (m.t === 'ready') {
        ready = true; clearTimeout(timer);
        token = !m.check;   // 確認のない中継（開発用）は、読み込めたらすぐ送れる
        if (!done && !busy) say(token ? '' : X.needCheck);
      } else if (m.t === 'height' && Number.isFinite(m.px)) {
        frame.style.height = Math.max(0, Math.min(400, Math.round(m.px))) + 'px';
      } else if (m.t === 'token') {
        token = !!m.ok;
        if (!busy && !done) say(token ? '' : X.needCheck);
      } else if (m.t === 'sent' && busy) {
        busy = false; done = true;
        const url = typeof m.url === 'string' && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(m.url) ? m.url : null;
        form.replaceChildren(el('p', { id: 'pr-sent', role: 'status' }, [X.sent + ' ', url ? el('a', { id: 'pr-url', href: url, target: '_blank', rel: 'noopener noreferrer', text: url }) : '']),
          el('p', { cls: 'hint', text: X.sentNote }));
        d.querySelector('#pr-buttons').replaceChildren(closeBtn(X.close, true));
        d.querySelector('#pr-close').focus();
      } else if (m.t === 'error' && busy) {
        busy = false;
        // 確認の答え（token）は 1 回きり。枠が確認をやり直すので、済むまで送れない
        token = false;
        say(errorText(m.code, X));
      }
      update();
    };
    window.addEventListener('message', onMsg);
    // 書き直したら、欄についての知らせ（「見せたいもの」を書いてください・長すぎます）を消す
    for (const f of [what, subject, grade]) f.addEventListener('input', () => { if (!busy && !done && ready) say(token ? '' : X.needCheck); });
    send.addEventListener('click', () => {
      if (send.disabled) return;
      let req;
      try { req = checkRequest({ what: what.value, subject: subject.value, grade: grade.value }); } catch (e) {
        const code = e instanceof RequestError ? e.code : '';
        say(code === 'what_required' ? X.needWhat : code === 'too_long' ? X.tooLong(e.message.includes('what') ? LIMITS.WHAT_MAX : LIMITS.SHORT_MAX) : X.errInput);
        if (code === 'what_required') what.focus();
        return;
      }
      busy = true; update(); say(X.sending);
      toFrame({ t: 'send', request: req });
    });
    timer = setTimeout(() => { if (!ready) { say(X.loadFail); form.append(proposal()); } }, (window.__APP_TEST && window.__APP_TEST.partRequestTimeout) || READY_TIMEOUT_MS);
    document.body.append(d);
    d.showModal();
    what.focus();
    return d;
  }
  return { open, label: X.entry };
}
