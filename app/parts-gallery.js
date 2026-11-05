// パーツのサンプルのページ（backlog #158。tools/parts-gallery.mjs が組み、studio.egatari.org/parts/v<パーツライブラリの版>/ に置く）の場所。
// 編集アプリは file://・Colab・ほかのサイトからも開くので、いつもサイトの絶対の URL で張る。版は components2.lock.json の既定のカタログ（この Studio が使う版）
import LOCK2 from '../components2.lock.json' with { type: 'json' };
import { siteVersionOf } from './version-ui.js';

export const PARTS_SITE = 'https://studio.egatari.org/';
export const PARTS_DIR = 'parts';
export const partsGalleryUrl = (version) => `${PARTS_SITE}${PARTS_DIR}/v${version}/`;
export const PARTS_CATALOGUE = LOCK2.default;
export const PARTS_GALLERY = partsGalleryUrl(PARTS_CATALOGUE);
// パーツの一覧（/parts/：版の一覧のページ。最初の画面の「パーツの一覧」）。サイトから開いた編集アプリ（http・https）はサイトの根からの相対
// （根は parts/、凍結した写し /vX.Y.Z/ は ../parts/。下のパスに置いたサイトでも同じ）。1 ファイル版を手元から開いたとき（file:// など）は
// ヘルプのパーツのリンクと同じく、公開のサイトの絶対の URL（PARTS_INDEX）
export const PARTS_INDEX = `${PARTS_SITE}${PARTS_DIR}/`;
export const partsIndexHref = (loc) => (/^https?:$/.test(loc.protocol) ? (siteVersionOf(loc.pathname) ? '../' : '') + `${PARTS_DIR}/` : PARTS_INDEX);
