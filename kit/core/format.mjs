// 持ち運べるデッキの形式（format spec：FORMAT.SPEC_URL）の名前と、名前から作る識別子のすべて。
// 形式の名前が変わったら、このファイルだけを直し、仕様の写しを同期し直す（node tools/sync-spec.mjs <仕様の clone>）。
// ほかのファイルには形式の名前を書かない（ここから読み込む。kit/deck.js には build が DECK.FORMAT として埋め込む）
const NAME = 'egatari';

export const FORMAT = Object.freeze({
  NAME,
  DISPLAY_NAME: 'Egatari',                            // 人に見せる名前
  FORMAT_ID: NAME,                                    // index.format と deck-meta.format
  INDEX_ID: `${NAME}-index`,                          // 索引の <script id>
  BLOB_PREFIX: `${NAME}-b-`,                          // 塊の <script id> の前置（<prefix><blobId>-<n>）
  READABLE_ID: `${NAME}-readable`,                    // スクリプトなしで読める層の id
  SIGNATURES_ID: `${NAME}-signatures`,                // 署名のブロック（予約。まだ作らない）
  FONT_SUPPLEMENT_PREFIX: `${NAME}-font-supplement-`, // 段 A の編集で足す字の <style id>（<prefix><n>。kit/core/tier-a.mjs）
  MESSAGE_KEY: NAME,                                  // 埋め込みの postMessage の鍵（{<key>: "seek", …}。後の段階）
  MIME: `application/vnd.${NAME}+json`,               // 索引の type
  URI_SCHEME: `${NAME}:`,                             // deck-audio の src（<scheme><blobId>）
  FILE_EXT: '.ega.html',                              // 書き出すファイルの拡張子
  PLAY_EXT: '.play.ega.html',                         // 再生専用の派生の拡張子
  CONFIG_FILE: `${NAME}.json`,                        // 作業フォルダに残す docId と metadata（と添付の一覧 ATTACH_KEY）
  // 添付（§3.8）：読み手のためのファイル（元の原稿・PDF・コード・データ・補足）。組み立てには使わず、再生器はダウンロードだけ（実行しない）
  ATTACH_DIR: 'attachments',                          // 置き場所（archive path は 'attachments/…'）
  ATTACH_KEY: 'attachments',                          // index.attachments（[{path, role, title?}]）。作業フォルダでは CONFIG_FILE の同じ名前の項目
  ATTACH_ROLES: Object.freeze(['source', 'pdf', 'code', 'data', 'supplement']),
  SCHEMA_PREFIX: `${NAME}-`,                          // 仕様の Schema のファイル名の前置（<prefix>index.schema.json など）
  SCHEMA_BASE: 'https://egatari.org/schema/',         // Schema の $id の前置（試験は写しを $id で引く。ネットワークは使わない）
  SPEC_URL: 'https://github.com/egatari/egatari-spec',
  VENDOR_DIR: `vendor/${NAME}-spec`,                  // 仕様の Schema と試験用の入力の写し（リポジトリの根から）
});
// 実行系（kit/deck.js）に渡す分（build-core が DECK.FORMAT として埋め込む）
export const RUNTIME_FORMAT = Object.freeze({ id: FORMAT.FORMAT_ID, blobPrefix: FORMAT.BLOB_PREFIX, uriScheme: FORMAT.URI_SCHEME, readableId: FORMAT.READABLE_ID,
  indexId: FORMAT.INDEX_ID, attachKey: FORMAT.ATTACH_KEY, attachDir: FORMAT.ATTACH_DIR, attachRoles: FORMAT.ATTACH_ROLES });
