// 新しいデッキの雛形（npm run new と編集アプリの「新しいデッキ」が共有する）。依存なし（Node にもブラウザにも依存しない）
//   newDeckFiles({lang: 'ja'|'en', theme: 'default', title, ids, blank, seed}) → {'deck.html': 文字列, 'narration.md': 文字列}（blank：表紙だけ）
// 教材を作るので、<html> にシード値（data-egatari-seed。format spec §8.4）を 1 回だけ書く。seed を渡せばその値（試験用）、なければ乱数
// 表紙＋見本 3 枚（段階・数式と注目の演出・部品）＋まとめと、全段階ぶんの口述原稿
// どのスライドにも乱数の id（s-xxxxxx）を付け、口述原稿の見出しは「## 見出し {#id}」（format spec §8.1）。
// ids を渡せばその 5 つを使う（試験用）
// （中身は字下げしない：テンプレート文字列の中の空白がそのままファイルに入るため）
import { newSlideId, headingLine } from '../core/narration-core.mjs';
import { newSeed, SEED_ATTR } from '../core/new-deck.mjs';

export function newDeckFiles(opts = {}) {
opts = { lang: 'ja', theme: 'default', title: null, ...opts };
// 見本の中の目印（slope）とは重ならないように
const taken = new Set(['slope', 'stage', 'bar', 'jump']);
const ID = opts.ids || Array.from({ length: 5 }, () => { const id = newSlideId(taken); taken.add(id); return id; });
const EN = opts.lang === 'en';
const title = (opts.title ?? (EN ? 'Untitled deck' : '新しいデッキ')).trim() || (EN ? 'Untitled deck' : '新しいデッキ');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = EN ? {
  venue: 'Event or course name',
  au: 'Your name<br>Affiliation',
  hint: [
    'A new lesson made by `npm run new`. Replace the sample slides with your own.',
    'Each sample shows one feature: steps (data-step), math (KaTeX, \\hlE, \\htmlId), emphasis ({mark} in narration.md) and a part (m-sweep).',
    'Keys: → / Space next step, ← previous, p presenter view, a autoplay, l Lecture view, ? list of keys',
  ],
  s1: {
    h: 'Show things in the order you speak',
    li: ['Elements without <code>data-step</code> are visible from the start', 'An element with <code>data-step="1"</code> appears at step 1', 'An element with <code>data-step="2"</code> appears at step 2'],
    concl: '⇒ The conclusion line always comes last',
    n: ['This slide shows how steps work. Anything without a step number is on the slide from the start.', 'This line appears at the first step.', 'And this one at the second step.'],
    nc: 'The conclusion line always comes last, after every step.',
  },
  s2: {
    h: 'Math and emphasis',
    p: 'Math in TeX notation is typeset with KaTeX when the lesson is built',
    li: ['<code>\\hlE{…}</code> colors a term with the theme', '<code>{mark:ID}</code> in the script emphasizes a part of the slide'],
    concl: '→ Point at what you are talking about',
    n: ['Math is typeset when the lesson is built.', 'Here is a straight line.', 'A highlighted term uses the theme color.', 'Emphasis in the script can {mark:slope|circle}circle the slope while you say it.'],
    nc: 'Use emphasis to point at what you are talking about.',
  },
  s3: {
    h: 'A part',
    li: ['Horizontal axis: <em>x</em>', 'Gray: the previous value of <em>c</em>'],
    xl: '*x*', yl: 'value', param: 'c',
    concl: '→ A part moves with the steps, too',
    n: ['Parts are animated figures that follow the steps.', 'Increasing the parameter makes the curve fall faster.', 'Larger still, it falls faster again.'],
    nc: 'The previous curve stays in gray, so you can compare.',
  },
  s4: { h: 'Summary', li: ['Steps follow the order you speak', 'Math and emphasis point at what matters', 'Parts animate with the steps'],
    n: ['To sum up.', 'Steps follow the order you speak.', 'Math and emphasis point at what matters.', 'Parts animate with the steps.'] },
  cover: 'Welcome. This is a new lesson.',
} : {
  venue: '会の名前・授業名',
  au: '氏名<br>所属',
  hint: [
    '`npm run new` で作った新しい教材。サンプルのスライドを自分の内容に置き換えて使う。',
    'サンプルは 1 枚に 1 つの機能：ステップ（data-step）、数式（KaTeX・\\hlE・\\htmlId）、強調（narration.md の {mark}）、パーツ（m-sweep）。',
    '操作：→ / Space で次のステップ、← で前、p で発表者ビュー、a で自動再生、l で授業の表示、? でキーの一覧',
  ],
  s1: {
    h: '話す順に見せる',
    li: ['<code>data-step</code> のない要素は、初めから見えている', '<code>data-step="1"</code> の要素は、1 ステップ目で現れる', '<code>data-step="2"</code> の要素は、2 ステップ目で現れる'],
    concl: '⇒ 結論の行は、いつも最後に出る',
    n: ['このスライドでは、ステップの使い方を見ます。ステップの番号がないものは、初めから見えています。', 'この行は、1 ステップ目で現れます。', 'この行は、2 ステップ目で現れます。'],
    nc: '結論の行は、すべてのステップのあと、最後に出ます。',
  },
  s2: {
    h: '数式と強調',
    p: 'TeX の記法で書いた数式は、組むときに KaTeX で組版される',
    li: ['<code>\\hlE{…}</code> は、テーマの色で項を強調する', '台本の <code>{mark:ID}</code> で、スライドの一部を強調する'],
    concl: '→ 話している箇所を指し示す',
    n: ['数式は、組むときに組版されます。', 'ここでは、直線の式を出します。', '強調した項は、テーマの色になります。', '台本の強調で、{mark:slope|circle}傾きを囲んで示せます。'],
    nc: '強調を使って、話している箇所を指し示します。',
  },
  s3: {
    h: 'パーツ',
    li: ['横軸：<em>x</em>', '灰色：前の <em>c</em> の曲線'],
    xl: '*x*', yl: '値', param: 'c',
    concl: '→ パーツも、ステップに合わせて動く',
    n: ['パーツは、ステップに合わせて動く図です。', 'パラメータを大きくすると、曲線は速く下がります。', 'さらに大きくすると、もっと速く下がります。'],
    nc: '前の曲線は灰色で残るので、比べられます。',
  },
  s4: { h: 'まとめ', li: ['ステップは、話す順に見せる', '数式と強調で、大事な所を指す', 'パーツは、ステップに合わせて動く'],
    n: ['まとめます。', 'ステップは、話す順に見せます。', '数式と強調で、大事な所を指します。', 'パーツは、ステップに合わせて動きます。'] },
  cover: 'ようこそ。これは新しい教材です。',
};

const deck = `<!DOCTYPE html>
<html lang="${opts.lang}" data-theme="${opts.theme}" ${SEED_ATTR}="${Number.isInteger(opts.seed) ? opts.seed : newSeed()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!--
${T.hint.map((l) => '  ' + l).join('\n')}
-->
<style>
/* ${EN ? 'styles for this deck only go here' : 'このデッキだけの体裁はここに書く'} */
</style>
</head>
<body>
<div id="stage">

<section class="slide cover noconcl static" id="${ID[0]}">
  <div class="venue">${T.venue}</div>
  <h1>${esc(title)}</h1>
  <div class="au">${T.au}</div>
</section>

<section class="slide" id="${ID[1]}">
  <h2>${T.s1.h}</h2>
  <div class="body">
    <ul>
      <li>${T.s1.li[0]}</li>
      <li data-step="1">${T.s1.li[1]}</li>
      <li data-step="2">${T.s1.li[2]}</li>
    </ul>
  </div>
  <div class="concl"><span>${T.s1.concl}</span></div>
</section>

<section class="slide" id="${ID[2]}">
  <h2>${T.s2.h}</h2>
  <div class="body">
    <p>${T.s2.p}</p>
    <div class="big" data-step="1">\\[ y = \\htmlId{slope}{a}\\,x + \\hlE{b} \\]</div>
    <ul>
      <li data-step="2">${T.s2.li[0]}</li>
      <li data-step="3">${T.s2.li[1]}</li>
    </ul>
  </div>
  <div class="concl"><span>${T.s2.concl}</span></div>
</section>

<section class="slide" id="${ID[3]}">
  <h2>${T.s3.h}</h2>
  <div class="body">
    <div class="cols" style="gap:24px">
      <div style="flex:0 0 36%">
        <div class="big">\\[ y = e^{-c\\,x} \\]</div>
        <ul class="nostep">${T.s3.li.map((l) => `<li>${l}</li>`).join('')}</ul>
      </div>
      <m-sweep f="Math.exp(-c*u)" values="[0.2,0.6,1.5]" param="${T.s3.param}" xr="[0,10]" yr="[0,1]" xt="[0,5,10]" yt="[0,0.5,1]"
               xl="${T.s3.xl}" yl="${T.s3.yl}" digits="1" style="height:380px"></m-sweep>
    </div>
  </div>
  <div class="concl"><span>${T.s3.concl}</span></div>
</section>

<section class="slide noconcl" id="${ID[4]}">
  <h2>${T.s4.h}</h2>
  <div class="body">
    <ol>
${T.s4.li.map((l, i) => `      <li data-step="${i + 1}">${l}</li>`).join('\n')}
    </ol>
  </div>
</section>

</div>
</body>
</html>
`;

const turns = (n, c) => n.map((t, i) => `[${i}] ${t}`).join('\n') + (c ? `\n[concl] ${c}` : '');
const narration = `# ${EN ? 'Narration' : '口述原稿'}: ${title}

${headingLine({ key: ID[0], id: ID[0], heading: title })}
[0] ${T.cover}

## ${T.s1.h} {#${ID[1]}}
${turns(T.s1.n, T.s1.nc)}

## ${T.s2.h} {#${ID[2]}}
${turns(T.s2.n, T.s2.nc)}

## ${T.s3.h} {#${ID[3]}}
${turns(T.s3.n, T.s3.nc)}

## ${T.s4.h} {#${ID[4]}}
${turns(T.s4.n)}
`;
if (opts.blank) {
  // 白紙から（編集アプリの「新規作成…」→「白紙から」）：表紙だけ。見本のスライドとその口述原稿は入れない
  const a = deck.indexOf('</section>') + '</section>'.length, z = deck.lastIndexOf('</div>\n</body>');
  const n = narration.indexOf('\n\n## ', narration.indexOf('{#' + ID[0] + '}'));
  return { 'deck.html': deck.slice(0, a) + '\n\n' + deck.slice(z), 'narration.md': narration.slice(0, n) + '\n' };
}
return { 'deck.html': deck, 'narration.md': narration };
}
