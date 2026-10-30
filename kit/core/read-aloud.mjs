// 読み上げで聞く（端末の声。format spec §5.6、backlog #89）の純ロジック：読む文を作り、端末の中の声を選び、読む・止める
// - 音声ファイルにはならない：何も書かず、タイムラインにも (i, k, t) の描画にも動画のモードにも入らない（呼ぶ側も書かない）
// - 声は端末の中の声（Web Speech API の localService === true）だけ。ネットワークの声は文を端末の外へ送るので、どんなときも選ばない
// - 読む文は TTS と同じ：読み {x|y} は y を読み、{cue}・{mark:…} と @x- の行は読まない。日本語は読み辞書（kit/core/yomi.mjs の applyYomi。
//   呼ぶ側が渡す）を当て、最後に TTS と同じ前処理（kit/core/tts-normalize.mjs の normalizeTtsText、join-num-counter）
// - import なし・DOM と node: に触れない：再生器では build（kit/core/build-core.mjs の classicNamespace）が DECK.ReadAloud にし、
//   編集アプリ（app/read-aloud.js）は ES モジュールとして読む。実際の speechSynthesis と SpeechSynthesisUtterance は呼ぶ側が渡す
//
//   spokenTurns(turns, {lang, terms, applyYomi, normalize}) → [{role, text}]（読む文のある発言だけ）
//     turns：parseNarration の発言（ttsParts）、書いたままの発言（{role, raw}）、deck-narration の発言（{role, text, ttsParts?}。ttsParts があればそれを、なければ表示の文を読む）、または文字列
//   spokenText(raw, opts) → 文字列（1 つの語や選んだ文。上と同じ処理）
//   localVoices(voices, lang) → 端末の中の声のうち、言語の合うもの（地域まで合う声・既定の声・自然な声が先、機械らしい声・遊びの声は後）
//   pickVoices(voices, lang) → {expert, novice}（声がなければ null。2 つあれば話す人ごとに別の声、1 つなら同じ声。機械らしい声は Novice にも選ばない）
//   createReader({synth, Utterance}) → {speak(turns, lang, {onend}) → {ok, reason?, voices}, cancel(), speaking()}
//   whenVoices(synth, ms) → Promise<voices>（Chrome は声の一覧を後から読み込む。voiceschanged か ms ミリ秒まで待つ）

// 段階の中の区切りと読み（kit/core/narration-core.mjs の BOUND・READING と同じ式）、拡張の行（同 EXT_LINE）
const NOTE_RE = /\{note:[^{}]*\}/g;
const BOUND_RE = /\{(cue|mark:[^{}]*)\}/g;
const READING_RE = /\{([^{}|]+)\|([^{}]+)\}/g;
const EXT_RE = /^\s*@x-[a-z][a-z0-9]{0,31}-[a-z][a-z0-9-]{0,31}(?:[ \t].*)?$/;
const ROLE_RE = /^(Expert|Novice|E|N)\s*[:：]\s*/;
// 境目の両側が CJK 以外なら空白 1 つで、どちらかが CJK なら詰めてつなぐ（narration-core.mjs の joinLines と同じ字の範囲）
const CJK_RE = /[　-〿぀-ヿㇰ-ㇿ㐀-䶿一-鿿豈-﫿＀-￯]/;
function join(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = a[a.length - 1], y = b[0];
  if (/\s/.test(x) || /\s/.test(y) || CJK_RE.test(x) || CJK_RE.test(y)) return a + b;
  return a + ' ' + b;
}

const isJa = (lang) => /^ja\b/i.test(String(lang || ''));

// 書いたままの文 → 読む文の部品（区切りで分けて、読みを当てる）。@x- の行は捨てる
function rawParts(raw) {
  const lines = String(raw).split(/\r?\n/).filter((ln) => !EXT_RE.test(ln));
  const text = lines.map((ln) => ln.trim()).filter(Boolean).reduce((a, b) => join(a, b), '');
  return text.replace(NOTE_RE, '').split(BOUND_RE).filter((_, j) => j % 2 === 0).map((p) => p.replace(READING_RE, '$2').trim());
}

function finish(parts, o) {
  let text = parts.map((p) => String(p).trim()).filter(Boolean).reduce((a, b) => join(a, b), '');
  if (isJa(o.lang) && typeof o.applyYomi === 'function') text = o.applyYomi(text, o.terms || []).text;
  if (typeof o.normalize === 'function') text = o.normalize(text);
  return text.replace(/\s{2,}/g, ' ').trim();
}

export function spokenText(raw, o = {}) {
  return finish(rawParts(raw), o);
}

export function spokenTurns(turns, o = {}) {
  const list = typeof turns === 'string' ? [turns] : Array.isArray(turns) ? turns : [];
  const out = [];
  for (const t of list) {
    let role = 'expert', parts;
    if (typeof t === 'string') {
      const m = t.match(ROLE_RE);
      if (m && m[1][0] === 'N') role = 'novice';
      parts = rawParts(m ? t.slice(m[0].length) : t);
    } else if (t && typeof t === 'object') {
      role = t.role === 'novice' ? 'novice' : 'expert';
      if (Array.isArray(t.ttsParts)) parts = t.ttsParts;
      else if (typeof t.raw === 'string') parts = rawParts(t.raw);
      else if (typeof t.text === 'string') parts = rawParts(t.text);
      else continue;
    } else continue;
    const text = finish(parts, o);
    if (text) out.push({ role, text });
  }
  return out;
}

// 言語の札：小文字・_ を - に。主の部分（ja・en）が合えば使える
function tag(s) { return String(s || '').replace(/_/g, '-').toLowerCase(); }
// 声の並べ方：地域（ja-JP）まで合う声 → 既定の声 → 高品質（Premium・Enhanced）→ よく知られた自然な声（この順）→ そのほか →
// 機械らしい声（macOS の Eloquence：Eddy・Flo…）→ 遊びの声（Bad News・Zarvox… Chrome は en-US として並べる）。名前は最初の語で見る
const NATURAL = ['kyoko', 'otoya', 'o-ren', 'hattori', 'haruka', 'ayumi', 'ichiro', 'sayaka', 'nanami', 'keita',
  'samantha', 'alex', 'ava', 'allison', 'tom', 'susan', 'zoe', 'evan', 'nathan', 'joelle', 'noelle', 'daniel', 'serena', 'kate', 'oliver', 'karen', 'lee', 'moira', 'tessa', 'rishi', 'fiona', 'veena',
  'zira', 'david', 'mark', 'aria', 'jenny', 'guy'];
const ROBOTIC = ['eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley'];
const NOVELTY = ['albert', 'bad', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'good', 'hysterical', 'jester', 'junior', 'organ', 'pipe', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox', 'fred', 'ralph', 'kathy',
  'ささやき声', 'オルガン', 'スーパースター', 'トリノイド', 'ベル', '道化', '震え', 'ボイン', 'バブル', 'チェロ'];
function tier(v) {
  const n = String(v.name || '').toLowerCase(), first = n.split(/[\s(（]/)[0];
  if (v.default) return 0;
  if (/premium|enhanced|プレミアム|拡張|neural|natural/.test(n)) return 1;
  const i = NATURAL.indexOf(first);
  if (i >= 0) return 2 + i / 100;
  if (NOVELTY.indexOf(first) >= 0) return 5;
  if (ROBOTIC.indexOf(first) >= 0) return 4;
  return 3;
}
export function localVoices(voices, lang) {
  const want = tag(lang || 'ja'), main = want.split('-')[0];
  const list = [];
  for (const v of (voices && typeof voices.length === 'number' ? Array.prototype.slice.call(voices) : [])) {
    // 端末の中の声だけ（localService が true と決まっているもの。undefined やほかの値は外す）
    if (!v || v.localService !== true) continue;
    const l = tag(v.lang);
    if (l.split('-')[0] !== main) continue;
    list.push({ v, region: l === want ? 0 : 1, tier: tier(v), at: list.length });
  }
  return list.sort((a, b) => a.region - b.region || a.tier - b.tier || a.at - b.at).map((x) => x.v);
}

export function pickVoices(voices, lang) {
  const list = localVoices(voices, lang);
  if (!list.length) return { expert: null, novice: null };
  const expert = list[0];
  // Novice の声：Expert と別の声。ただし Expert より機械らしい声・遊びの声にはしない（なければ同じ声で読む）
  const lim = Math.max(Math.floor(tier(expert)), 3);
  const novice = list.find((v) => v !== expert && v.name !== expert.name && tier(v) < lim + 1) || expert;
  return { expert, novice };
}

export function whenVoices(synth, ms = 1500) {
  return new Promise((resolve) => {
    let done = false;
    const get = () => { try { return synth.getVoices() || []; } catch (e) { return []; } };
    const now = get();
    if (now.length) { resolve(now); return; }
    const fin = () => { if (done) return; done = true; try { synth.removeEventListener('voiceschanged', fin); } catch (e) { /* 古いブラウザ */ } resolve(get()); };
    try { synth.addEventListener('voiceschanged', fin); } catch (e) { /* 古いブラウザ */ }
    setTimeout(fin, ms);
  });
}

export function createReader(env) {
  const synth = env && env.synth, Utterance = env && env.Utterance;
  let gen = 0, active = false;
  function cancel() {
    gen++;
    const was = active;
    active = false;
    if (synth) { try { synth.cancel(); } catch (e) { /* 止められなくても先へ */ } }
    return was;
  }
  // turns は spokenTurns の結果（[{role, text}]）。声がなければ読まずに {ok: false, reason: 'no-voice'}
  function speak(turns, lang, cb = {}) {
    cancel();
    if (!synth || typeof Utterance !== 'function') return { ok: false, reason: 'no-synth' };
    const list = (turns || []).filter((t) => t && t.text);
    if (!list.length) return { ok: false, reason: 'no-text' };
    let all = [];
    try { all = synth.getVoices() || []; } catch (e) { all = []; }
    const vs = pickVoices(all, lang);
    if (!vs.expert) return { ok: false, reason: 'no-voice' };
    const my = gen;
    active = true;
    list.forEach((t, j) => {
      const v = t.role === 'novice' ? vs.novice : vs.expert;
      const u = new Utterance(t.text);
      u.voice = v;
      u.lang = v.lang || lang;
      if (j === list.length - 1) {
        const end = (ev) => { if (my !== gen) return; active = false; if (cb.onend) cb.onend(ev && ev.type === 'error' ? 'error' : 'end'); };
        u.onend = end; u.onerror = end;
      }
      synth.speak(u);
    });
    return { ok: true, voices: vs };
  }
  return { speak, cancel, speaking: () => active };
}
