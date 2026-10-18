// MP3 のエンコーダ（LAME、LGPL）を、使うときだけ別のファイルから読み込む。
// 配信版（dist/）は tools/build-app.mjs が npm の lame-wasm の dist/index.js を手を加えずに vendor/lame-wasm/ に写す（LICENSE・package.json・
// README も一緒に。NOTICE）。app.js には入れないので、そのファイルを同じ名前の別の版や自分で組んだもので置き換えてもよい。
// 1 ファイル版（file://）は別のファイルを読み込めない（ブラウザが file:// の module を断る）ので LAME を持たず、null を返す。
// 呼び手（app/audio-panel.js）はそのとき WAV で保存する
//   loadLame() → Promise<init 関数 | null>
const URL_PATH = 'vendor/lame-wasm/index.js';
let cached = null;

export function loadLame({ test = () => undefined } = {}) {
  const t = test();
  if (t === 'off') return Promise.resolve(null);
  if (location.protocol === 'file:') return Promise.resolve(null);
  if (!cached) {
    const url = new URL(URL_PATH, document.baseURI).href;
    // 変数の URL の import：esbuild はこれを組み込まない（実行するときに読み込む）
    cached = import(/* webpackIgnore: true */ url).then((m) => (typeof m.init === 'function' ? m.init : null), (e) => { console.warn('[editor] MP3 encoder not loaded, saving WAV', e); cached = null; return null; });
  }
  return cached;
}
