// 前の版のファイル（docs/terms.json の earlier-draft-file。format spec §7.1「Drafts before 1.0」）
// 1.0 の形より前の草案で書いたファイルは、索引に player を持たない。そのまま自分のプレーヤーで再生できるが、この Studio では編集しない
// （§7.1：MAY refuse to edit、SHOULD say so and point to an editor of that draft or to migration instructions）。
// 編集アプリ（main.js）は、プレビューでファイルそのものを再生し（組み直さない）、編集と保存を断り、知らせに 2 つの道を出す：
//   前の版の Studio（https://studio.egatari.org/v<作った版>/。サイトの versions.json にその版がなければ、そこにある 1.0 より前の最も新しい版）
//   移し替えの手引き（docs/migrating-0.x(.ja).md。GitHub の main）
// 作業フォルダ：設定のファイル（egatari.json）があって（教材として書き出した・取り出したもの）、どのスライドにも id がないもの。
// 作業フォルダには索引がない（player も generator もない）ので、1.0 の印はスライドの id だけ：1.0 の書き手はどのスライドにも id を付ける
// （§8.1。書き出しは付けた id を原稿に書き戻す。npm run new・新規作成も付ける）。id が 1 つでもあれば 1.0 のフォルダで、
// 手で足した id のないスライドは前の版のしるしにしない（次の書き出しが id を付ける）。
// 移し替えの手順 2（npm run ids）で id を付ければ、次の組み直しで知らせが消えて編集できる
// ブラウザの API は siteVersions だけが使う（ほかは Node の試験からも読み込める）
import { siteVersionOf, readVersions } from './version-ui.js';

// 1.0 の形（player）を書く最初の Studio の版。これより前の版が「前の版の Studio」
export const FIRST_1_0 = '0.6.0';
// サイトの外（開発のサーバー・file://・オフライン版）で versions.json を読めないときの置き場所と版
export const STUDIO_SITE = 'https://studio.egatari.org/';
export const LAST_DRAFT_STUDIO = '0.4.8';   // 1.0 より前の最後のリリース（studio.egatari.org/v0.4.8/）
export const FIRST_FROZEN = '0.4.1';        // 凍結した写し（/vX.Y.Z/）がある最初の版（tools/site-versions.mjs：tar.gz は v0.4.1 から）
const GUIDE = 'https://github.com/egatari/egatari-studio/blob/main/docs/';
export const guideUrl = (lang) => GUIDE + (lang === 'en' ? 'migrating-0.x.md' : 'migrating-0.x.ja.md');

const PLAIN = /^\d+\.\d+\.\d+$/;
// a が b より前の版か（どちらも x.y.z）
export function older(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// 開いたファイルの読み取りの結果（kit/core/portable.mjs の readPortable。Worker を通しても同じ形）→ 前の版のファイルなら {made: 作った Studio の版か null}、
// そうでなければ null。前の版かどうかは readPortable の preDraft（索引に player がない）だけで決める（2 つ目の判定を持たない）。
// この Studio は書くファイルに必ず player を書く（format spec §4.1）ので、この Studio が書いたファイルは前の版にならない
export function earlierFile(read) {
  if (!read || read.preDraft !== true) return null;
  const ix = read.index && typeof read.index === 'object' ? read.index : {};
  const g = ix.generator && typeof ix.generator === 'object' ? ix.generator : {};
  return { made: typeof g.version === 'string' && g.version ? g.version : null };
}

// 作業フォルダ：analysis（kit/core/build-core.mjs の analyzeSlideIds）と、設定のファイルがあるか → {noId: id のないスライドの数} か null。
// 前の版かどうかは 1.0 の印（id のあるスライド）が 1 つもないことだけで決める（id のないスライドがあることでは決めない）
export function earlierFolder(analysis, hasConfig) {
  if (!hasConfig || !analysis || !Array.isArray(analysis.slides) || !analysis.slides.length) return null;
  if (analysis.slides.some((s) => s.id !== null)) return null;
  return { noId: analysis.slides.length };
}

// 開く前の版の Studio の版。made：作った版（なければ null）。site：{versions: [新しい順]}（versions.json）か null（読めない）
//   versions.json にその版がある → その版。ない → そこにある 1.0 より前の最も新しい版
//   読めない → 作った版が凍結した写しのある範囲（FIRST_FROZEN 以上、FIRST_1_0 より前）ならその版、でなければ LAST_DRAFT_STUDIO
export function draftStudioVersion(made, site) {
  const ok = (v) => typeof v === 'string' && PLAIN.test(v) && older(v, FIRST_1_0);
  if (site && Array.isArray(site.versions)) {
    if (ok(made) && site.versions.includes(made)) return made;
    const before = site.versions.filter(ok).sort((a, b) => (older(a, b) ? 1 : older(b, a) ? -1 : 0));
    if (before.length) return before[0];
  }
  if (ok(made) && !older(made, FIRST_FROZEN)) return made;
  return LAST_DRAFT_STUDIO;
}
// その版の Studio の URL（base：サイトの根。versions.json を読めたサイト、読めなければ STUDIO_SITE）
export const draftStudioUrl = (version, base) => new URL(`v${version}/`, base || STUDIO_SITE).href;

// このページのサイト（根か凍結した写し /vX.Y.Z/）の versions.json → {base, versions} か null（http(s) でない・ない・読めない）
let siteMemo = null;
export function siteVersions() {
  if (siteMemo) return siteMemo;
  siteMemo = (async () => {
    if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
    const base = new URL(siteVersionOf(location.pathname) ? '../' : './', location.href).href;
    const v = await readVersions(new URL('versions.json', base).href);
    return v ? { base, versions: v.versions } : null;
  })();
  return siteMemo;
}
// 知らせに出す 2 つの道：{version, studioUrl, guideUrl}
export async function draftLinks(made, lang) {
  const site = await siteVersions().catch(() => null);
  const version = draftStudioVersion(made, site);
  return { version, studioUrl: draftStudioUrl(version, site ? site.base : STUDIO_SITE), guideUrl: guideUrl(lang) };
}
