// コピーのボタン自体に結果を出す（handoff #110。GitHub・Google ドキュメントのコピーのボタンと同じ形）。
// Studio のどの［コピー］も、作るときに copyButton(ボタン) を通し、写せたときだけ copied(ボタン) を呼ぶ：ボタンの字を約 2 秒「✓ コピーしました」に替えて元に戻す。
// 写せなかったとき（字の欄を出して選んでもらうとき）は呼ばない（写していないのに「コピーしました」と言わない）。
// 読み上げは知らせの欄（role="status" など）だけ。ボタンには aria-live を付けず、字の替わりを読み上げに重ねない。
// i18n.js は読み込まない：live-panel.js（言葉を呼び出し元から受け取る）が node の試験からも読まれるため。言葉は main.js が setCopiedText で渡す
let DONE = '✓';
export function setCopiedText(text) { DONE = text; }

// 間隔（ms）：showMs はボタンに「✓ コピーしました」を出しておく間、foldMs は段をたたむ前に見せる間（新規作成の ④・挿入と修正の ②）。
// 試験は window.__APP_TEST.copyLimits で上書きする（app/drafts.js の DRAFT_LIMITS と同じ）
export const COPY_LIMITS = { showMs: 2000, foldMs: 1000 };
const limits = () => ({ ...COPY_LIMITS, ...((typeof window !== 'undefined' && window.__APP_TEST && window.__APP_TEST.copyLimits) || {}) });

// ボタンの幅を替えない：元の字と「✓ コピーしました」の広いほうを測り、min-width にする（字を替える前に。測る間は描かない）
function holdWidth(btn, label, done) {
  if (btn.dataset.copyWidth) return;
  const w0 = btn.getBoundingClientRect().width;
  if (!w0) return;   // 見えていない（測れない）
  btn.textContent = done;
  const w1 = btn.getBoundingClientRect().width;
  btn.textContent = label;
  btn.style.minWidth = Math.ceil(Math.max(w0, w1)) + 'px';
  btn.dataset.copyWidth = '1';
}

// コピーのボタンを作ったときに通す：見えて大きさが付いたとき（ResizeObserver）に幅を測って止める。押してから測ると、広いほうの字のときに 1 度だけ幅が替わるため
export function copyButton(btn) {
  // 押したらまず元の字に戻す：写せなかったとき（copied を呼ばない）に、前に写せたときの「✓ コピーしました」を残さない（規格化 11/27）
  btn.addEventListener('click', () => restore(btn), { capture: true });
  if (typeof ResizeObserver !== 'function') return btn;
  // 字体を読み込んでいる間に測ったら、読み終えてから測り直す（代わりの字体で測ると、後で字が広くなり幅が替わる。macOS の CI 45899862481）。
  // 和文の字体は字の範囲ごとに読むので、「✓ コピーしました」に替えて測ったときに初めて読み始めることもある
  const measure = () => {
    if (btn.dataset.copyWidth || btn.dataset.copyLabel != null) return;   // 測った後・「✓ コピーしました」を出している間は測らない
    holdWidth(btn, btn.textContent, DONE);
    if (!btn.dataset.copyWidth) return;
    if (document.fonts && document.fonts.status === 'loading') {
      delete btn.dataset.copyWidth; btn.style.minWidth = '';
      document.fonts.ready.then(measure);
      return;
    }
    ro.disconnect();
  };
  const ro = new ResizeObserver(() => { if (btn.dataset.copyWidth) ro.disconnect(); else measure(); });
  ro.observe(btn);
  return btn;
}

// 「✓ コピーしました」を出していれば、すぐに元の字に戻す
function restore(btn) {
  if (btn.dataset.copyLabel == null) return;
  clearTimeout(btn._copyTimer);
  btn.textContent = btn.dataset.copyLabel;
  btn.classList.remove('copied');
  delete btn.dataset.copyLabel;
}

// 写せたときに呼ぶ。返す Promise は foldMs の後に解ける（段をたたむのは、ボタンの字を見せてから）
export function copied(btn) {
  const L = limits();
  if (!btn) return new Promise((r) => setTimeout(r, L.foldMs));
  const done = DONE;
  // 続けて押したとき：元の字は最初に覚えたもの（「✓ コピーしました」を元の字にしない）
  const label = btn.dataset.copyLabel != null ? btn.dataset.copyLabel : btn.textContent;
  btn.dataset.copyLabel = label;
  holdWidth(btn, label, done);
  btn.textContent = done;
  btn.classList.add('copied');
  clearTimeout(btn._copyTimer);
  btn._copyTimer = setTimeout(() => {
    btn.textContent = label;
    btn.classList.remove('copied');
    delete btn.dataset.copyLabel;
  }, L.showMs);
  return new Promise((r) => setTimeout(r, L.foldMs));
}
