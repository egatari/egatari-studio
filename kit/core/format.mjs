// 持ち運べるデッキの形式（format spec：FORMAT.SPEC_URL）の名前と、名前から作る識別子のすべて。
// 形式の名前が変わったら NAME の 1 行だけを直し、vendor/format-spec を同期し直す（node tools/sync-format-spec.mjs <clone>）。
// ほかのファイルには形式の名前を書かない（ここから読み込む。kit/deck.js には build が DECK.FORMAT として埋め込む）
const NAME = 'etoki';

const cap = NAME[0].toUpperCase() + NAME.slice(1);
export const FORMAT = Object.freeze({
  NAME,
  DISPLAY_NAME: cap,                                  // 人に見せる名前
  FORMAT_ID: NAME,                                    // index.format と deck-meta.format
  INDEX_ID: `${NAME}-index`,                          // 索引の <script id>
  BLOB_PREFIX: `${NAME}-b-`,                          // 塊の <script id> の前置（<prefix><blobId>-<n>）
  READABLE_ID: `${NAME}-readable`,                    // スクリプトなしで読める層の id
  SIGNATURES_ID: `${NAME}-signatures`,                // 署名のブロック（予約。まだ作らない）
  MIME: `application/vnd.${NAME}+json`,               // 索引の type
  URI_SCHEME: `${NAME}:`,                             // deck-audio の src（<scheme><blobId>）
  FILE_EXT: `.${NAME}.html`,                          // 書き出すファイルの拡張子
  PLAY_EXT: `.play.${NAME}.html`,                     // 再生専用の派生の拡張子
  CONFIG_FILE: `${NAME}.json`,                        // 原稿のフォルダに残す docId と metadata
  SCHEMA_BASE: `https://${NAME}.dev/schema/`,         // vendor/format-spec/schema の $id の前置
  SPEC_URL: `https://github.com/${NAME}-org/${NAME}-spec`,
});
// 実行系（kit/deck.js）に渡す分（build-core が DECK.FORMAT として埋め込む）
export const RUNTIME_FORMAT = Object.freeze({ id: FORMAT.FORMAT_ID, blobPrefix: FORMAT.BLOB_PREFIX, uriScheme: FORMAT.URI_SCHEME, readableId: FORMAT.READABLE_ID });
