// 凍結した写しのうち、版の案内（version-ui.js）を持たない古い版（v0.4.1・v0.4.2）に、サイトの組み立て（tools/site-versions.mjs）が
// <script src="../version-notice.js"> で読み込ませるもの。tools/build-app.mjs が dist/version-notice.js に組む（根に置かれる）
import { mountVersionUi } from './version-ui.js';

const go = () => mountVersionUi();
if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
