// パーツのサンプルのページ（backlog #158。tools/parts-gallery.mjs が組み、studio.egatari.org/parts/v<パーツライブラリの版>/ に置く）の場所。
// 編集アプリは file://・Colab・ほかのサイトからも開くので、いつもサイトの絶対の URL で張る。版は components2.lock.json の既定のカタログ（この Studio が使う版）
import LOCK2 from '../components2.lock.json' with { type: 'json' };

export const PARTS_SITE = 'https://studio.egatari.org/';
export const PARTS_DIR = 'parts';
export const partsGalleryUrl = (version) => `${PARTS_SITE}${PARTS_DIR}/v${version}/`;
export const PARTS_CATALOGUE = LOCK2.default;
export const PARTS_GALLERY = partsGalleryUrl(PARTS_CATALOGUE);
