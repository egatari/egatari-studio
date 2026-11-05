// 本文の道具（app/article-tools.js。あとで読み込む）が使う、読み込む側がすでに持つ部品。tools/build-app.mjs の articleHostPlugin が
// 本文の道具の中の import をここの名前に替える（同じものを 2 度入れない）。名前を足すときは、そこの ARTICLE_HOST_NAMES も同じに
//   setArticleHost()  globalThis.__egatariArticleHost を置く（本文の道具を動かす前に。ページは app/article-loader.js、Worker は app/build-worker.js）
import katex from 'katex';
import * as buildCore from '../kit/core/build-core.mjs';
import * as configFile from '../kit/core/config-file.mjs';
import * as format from '../kit/core/format.mjs';
import * as narrationParse from '../kit/core/narration-parse.mjs';
import * as quoteJa from '../kit/core/quote-ja.mjs';

export function setArticleHost() {
  if (!globalThis.__egatariArticleHost) globalThis.__egatariArticleHost = { katex, 'build-core': buildCore, 'config-file': configFile, format, 'narration-parse': narrationParse, 'quote-ja': quoteJa };
}
