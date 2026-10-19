// 「使い方」の板の「ブラウザの TTS のモデル」の節：このサイトの保存領域の使用量（navigator.storage.estimate）と、入っているモデル
// （Cache Storage。lab/model-cache.mjs）を見せ、「モデルを消す」で消す。モデルを取るのは TTS の窓（lab/tts-helper.html。同じサイト）で、
// このページは外へ繋がらない。キャッシュは同じサイトのものなので、ここから見て消せる
//   modelCacheSection({el, EN, ask, toast}) → 節の要素（中身は後から埋まる）
import { modelCacheSizes, deleteModelCaches, storageUsage, IRODORI_PREFIX } from '../lab/model-cache.mjs';

const MB = (n) => (n / 1e6).toFixed(0), GB = (n) => (n / 1e9).toFixed(2);
const size = (n) => (n >= 1e9 ? GB(n) + ' GB' : MB(n) + ' MB');

export function modelCacheSection({ el, EN, ask, toast }) {
  const L = EN ? {
    title: 'Browser TTS models', none: 'No TTS model is stored in this browser.',
    usage: (u, q) => `This site uses ${size(u)} of browser storage (up to ${size(q)}).`, noUsage: 'This browser does not report its storage use.',
    model: (n, b) => (n.startsWith(IRODORI_PREFIX) ? `Irodori-TTS (Japanese, version ${n.slice(IRODORI_PREFIX.length)})` : 'Kokoro-82M (English)') + (b ? `: ${size(b)}` : ''),
    kept: 'The browser keeps the models (persistent storage).',
    mayEvict: 'The browser may delete the models when the disk is nearly full, and Safari deletes them when you have not opened this site for about a week. They are then downloaded again.',
    old: 'Models of older versions are deleted automatically when a new version is downloaded.',
    del: 'Delete models', askTitle: 'Delete the TTS models?', askBody: (b) => `This deletes ${b ? size(b) : 'the models'} from this browser. Audio you made stays. The next browser TTS downloads the model again (Japanese about 1.26 GB).`,
    cancel: 'Cancel', done: (n) => `Deleted ${n} model cache(s)`, failed: 'Could not delete the models',
  } : {
    title: 'ブラウザの TTS のモデル', none: 'このブラウザには TTS のモデルが入っていません。',
    usage: (u, q) => `このサイトはブラウザの保存領域を ${size(u)} 使っています（上限 ${size(q)}）。`, noUsage: 'このブラウザは保存領域の使用量を知らせません。',
    model: (n, b) => (n.startsWith(IRODORI_PREFIX) ? `Irodori-TTS（日本語、版 ${n.slice(IRODORI_PREFIX.length)}）` : 'Kokoro-82M（英語）') + (b ? `：${size(b)}` : ''),
    kept: 'モデルは消されずに残ります（ブラウザが保存を約束しています）。',
    mayEvict: 'ディスクの空きが足りなくなると、ブラウザがモデルを消すことがあります。Safari は、このサイトを 1 週間ほど開かないと消します。消えたら、次に使うときに取得し直します。',
    old: '古い版のモデルは、新しい版を取得するときに自動で消します。',
    del: 'モデルを消す', askTitle: 'TTS のモデルを消しますか？', askBody: (b) => `このブラウザから ${b ? size(b) : 'モデル'} を消します。作った音声は消えません。次にブラウザの TTS を使うときに、モデルを取得し直します（日本語は約 1.26 GB）。`,
    cancel: '取消', done: (n) => `モデルのキャッシュを ${n} 個消しました`, failed: 'モデルを消せませんでした',
  };
  const box = el('section', { id: 'model-cache', cls: 'model-cache' });
  async function render() {
    const [list, use] = await Promise.all([modelCacheSizes(), storageUsage()]);
    const total = list.reduce((a, x) => a + x.bytes, 0);
    const lines = [use ? L.usage(use.usage, use.quota) : L.noUsage, ...(list.length ? list.map((x) => L.model(x.name, x.bytes)) : [L.none])];
    if (list.length) lines.push(use && use.persisted ? L.kept : L.mayEvict, L.old);
    const btn = el('button', { type: 'button', id: 'b-model-delete', text: L.del });
    btn.disabled = !list.length;
    btn.onclick = async () => {
      const v = await ask({ title: L.askTitle, kind: 'warn', body: [el('p', { text: L.askBody(total) })], buttons: [{ id: 'cancel', label: L.cancel }, { id: 'delete', label: L.del, pri: true }] });
      if (v !== 'delete') return;
      try { const n = await deleteModelCaches(); toast(L.done(n.length)); }
      catch (e) { toast(L.failed + ': ' + (e.message || e), true); }
      await render();
    };
    box.replaceChildren(el('h3', { text: L.title }), el('ul', { id: 'model-cache-info' }, lines.map((t) => el('li', { text: t }))), el('div', { cls: 'row' }, [btn]));
  }
  box.append(el('h3', { text: L.title }));
  render().catch(() => {});
  return box;
}
