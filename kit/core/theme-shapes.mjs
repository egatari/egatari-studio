// テーマの形（見出し・表紙・結論の行）の決まった CSS の断片（#129、テーマを作る画面 #58 第 2 版 handoff/theme-builder-v2-2026-10-27.md）。
// 同梱のテーマはこの断片をそのまま tokens.css に写し、どれを選んだかを theme.json の look に書く（{"heading": "band", "cover": "left-bar", "concl": "left-rule"}）。
// テーマを作る画面は同じ断片を並べるだけで、選んだ形のテーマを書き出せる。tools/test-themes.mjs が、tokens.css の中の断片がここと同じかを確かめる。
// 断片はテーマのファイルに写す（組み立てはここを読まない）ので、ここを変えても出したテーマの見た目と hash は変わらない（変えたら写したテーマの版を上げる）。
//
// 決まり：
//   - 箱（本文・結論の行・見出しの行）の位置と大きさは変えない（はみ出しの検査が変わらない）。見出しの帯は、見出しの行の上の余白に広げるだけ
//   - 色はテーマの変数だけ（--base・--emph・--rule・--sec-fg・--base-wash・--base-tint）
//   - 組み込みの規則（kit/layouts.css。.slide h2 は 0,1,1）と同じ以上の詳細度で書く。:where() で包まない
//     （包むと詳細度が 0 になり、色や下線のような一部の宣言だけが組み込みの規則に負ける。帯の上に --title の紺の字が乗る、など）
//   - 縦書き（layout-tate）・表紙・章の扉の見出しには掛けない（:not(.cover):not(.sec):not(.layout-tate)）
//
// 断片の印：tokens.css では `/* look <key>: <id> */` の行の次から `/* /look */` の行の前までが断片（間を書き換えない）
const H = '.slide:not(.cover):not(.sec):not(.layout-tate) > h2';

export const SHAPES = Object.freeze({
  heading: Object.freeze({
    // 下線（既定。kit/layouts.css のまま）
    underline: '',
    // 太い下線と、題の前の四角（常盤）
    'thick-square': `${H}{border-bottom-width:5px;padding-left:34px}\n${H}::before{content:"";position:absolute;left:0;top:14px;width:20px;height:20px;background:var(--base)}`,
    // 左の縦の帯、下線なし（江戸紫）
    'left-bar': `${H}{border-bottom:0;border-left:10px solid var(--base);padding:4px 0 4px 18px}`,
    // 二重線（焦茶）
    double: `${H}{border-bottom:6px double var(--base)}`,
    // 淡い地の角丸、下線なし（浅葱）
    soft: `${H}{border-bottom:0;background:var(--base-wash);border-radius:16px;padding:8px 22px}`,
    // 基調色の帯に白抜き、下に --rule の線（墨）
    band: `${H}{left:0;right:0;top:0;padding:26px 48px 18px;background:var(--base);color:var(--sec-fg,#fff);border-bottom:4px solid var(--rule)}`,
  }),
  cover: Object.freeze({
    // 中央・上に細い帯（既定。kit/layouts.css のまま）
    'top-band': '',
    // 中央・上に太い帯（常盤）
    'top-band-wide': '.slide.cover::before{height:22px}',
    // 左寄せと左の縦線。章の扉も左寄せで、題の左に縦線（墨）
    'left-bar': [
      '.slide.cover{text-align:left}',
      '.slide.cover::before{left:0;right:auto;top:0;bottom:0;width:18px;height:auto;background:var(--rule)}',
      '.slide.cover h1{left:96px;color:var(--fg)}',
      '.slide.cover .venue,.slide.cover .au{left:96px}',
      '.slide.sec h1,.slide.sec h2,.slide.sec .lead{text-align:left;left:96px}',
      '.slide.sec h1,.slide.sec h2{border-left:10px solid var(--rule);padding-left:24px;margin-left:-34px}',
    ].join('\n'),
    // 下に帯（江戸紫）
    'bottom-band': '.slide.cover::before{top:auto;bottom:0;height:120px}\n.slide.cover .au{top:420px}',
    // 細い枠（焦茶）
    frame: '.slide.cover::before{left:28px;right:28px;top:28px;bottom:28px;height:auto;background:transparent;border:2px solid var(--base)}',
    // 右上の角に大きな丸（浅葱）
    circle: '.slide.cover::before{left:auto;right:-80px;top:-80px;width:300px;height:300px;border-radius:50%;background:var(--base-tint)}',
  }),
  concl: Object.freeze({
    // 左の縦線（既定。themes/default/tokens.css 1.2.0）
    'left-rule': '',
    // 角丸の枠（浅葱）
    rounded: '.slide:not(.layout-tate) .concl{border:2.3px solid var(--emph);border-radius:36px;padding-left:24px}',
  }),
});
// 名前のない形（look を書かないテーマ）は既定の形
export const DEFAULT_LOOK = Object.freeze({ heading: 'underline', cover: 'top-band', concl: 'left-rule' });

// look → tokens.css に写す断片（印の行も含む）。既定の形（空の断片）は書かない
export function lookCss(look) {
  const out = [];
  for (const key of Object.keys(DEFAULT_LOOK)) {
    const id = (look && look[key]) || DEFAULT_LOOK[key];
    const css = SHAPES[key] && SHAPES[key][id];
    if (css === undefined) throw new Error(`theme look: unknown ${key} "${id}"`);
    if (css) out.push(`/* look ${key}: ${id} */\n${css}\n/* /look */`);
  }
  return out.join('\n');
}
// tokens.css から断片を読み出す：{key: {id, css}}
export function lookIn(tokensCss) {
  const out = {};
  for (const m of String(tokensCss).matchAll(/\/\* look (\w+): ([\w-]+) \*\/\n([\s\S]*?)\n\/\* \/look \*\//g)) out[m[1]] = { id: m[2], css: m[3] };
  return out;
}
