// 字の切り出しの道具（app/font-subset-tools.js）を 1 本にまとめる（#178 (4)）。編集アプリ（tools/build-app.mjs の dist/font-subset.js と 1 ファイル版）と試験（tools/test-font-subset.mjs）が使う
//   await buildFontSubsetJs(version) → 字（大域の名前 __egatariFontSubset。<script> の字として動かす）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
// 字の切り出しの道具（app/font-subset-tools.js：kit/core/font-subset-core.mjs と harfbuzz の wasm（harfbuzzjs）と woff2 の束（wawoff2）。#178 (4)）：
// app.js に入れず、持ち運べる 1 ファイルに書き出すときにだけ読み込む（app/font-subset-loader.js。配信版は dist/font-subset.js、1 ファイル版は字として入れる）。
// wawoff2 の束は emscripten の 1 ファイル（wasm を data: の base64 で持つ）：その base64 を取り出して Module.wasmBinary に渡し（data: を fetch しない。CSP の connect-src）、
// 束の中の data: の字は空にする（同じ wasm を 2 度持たない）。Node の枝の require('fs')・require('path') は空のものにする（ブラウザでは通らない）
const WOFF2_DIR = path.dirname(require.resolve('wawoff2/package.json'));
const HB_WASM = require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm');
const EMBIND_NAMED = 'function createNamedFunction(name,body){return function(){"use strict";return body.apply(this,arguments)}}';
const EMBIND_INVOKER = `function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){var argCount=argTypes.length;if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!")}
var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=false;for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}
var returns=argTypes[0].name!=="void";var expected=argCount-2;
return function(){if(arguments.length!==expected){throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+expected+" args!")}
var destructors=needsDestructorStack?[]:null;var thisWired=isClassMethodFunc?argTypes[1].toWireType(destructors,this):undefined;var argsWired=[];for(var i=0;i<expected;++i){argsWired.push(argTypes[i+2].toWireType(destructors,arguments[i]))}
var call=[cppTargetFunc];if(isClassMethodFunc){call.push(thisWired)}var rv=cppInvokerFunc.apply(null,call.concat(argsWired));
if(needsDestructorStack){runDestructors(destructors)}else{for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(i===1?thisWired:argsWired[i-2])}}}
if(returns){return argTypes[0].fromWireType(rv)}}}`;
const woff2Binding = (name) => {
  const src = fs.readFileSync(path.join(WOFF2_DIR, 'build', name), 'utf8');
  const m = /"data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)"/.exec(src);
  if (!m) throw new Error(`wawoff2 ${name}: the embedded wasm (data: URI) was not found`);
  let body = src.slice(0, m.index) + '"data:application/octet-stream;base64,"' + src.slice(m.index + m[0].length);
  // embind は呼び口を字から作る（new Function）。編集アプリの決まり（CSP）は文字列の eval を許さないので、同じ働きを字から作らない関数に替える
  // （emscripten の DYNAMIC_EXECUTION=0 の形と同じ。wasm と呼ぶ順は変えないので、出すバイトは Node の組み立てと同じ。tools/test-app.mjs が確かめる）
  const swap = (from, to, fn) => {
    const a = body.indexOf(from), z = body.indexOf(to, a);
    if (a < 0 || z < 0 || body.indexOf(from, a + 1) >= 0) throw new Error(`wawoff2 ${name}: ${from.trim()} not found once`);
    body = body.slice(0, a) + fn + body.slice(z);
  };
  swap('function createNamedFunction(', 'function extendError(', EMBIND_NAMED);
  swap('function craftInvokerFunction(', 'function ensureOverloadTable(', EMBIND_INVOKER);
  if (/new Function|\beval\(/.test(body)) throw new Error(`wawoff2 ${name}: dynamic code is left (new Function or eval)`);
  return `var Module = { wasmBinary: Uint8Array.from(atob(${JSON.stringify(m[1])}), function (c) { return c.charCodeAt(0); }) };\n${body}\n;module.exports = Module;\n`;
};
const fontSubsetPlugin = {
  name: 'font-subset',
  setup(b) {
    b.onResolve({ filter: /^virtual:hb-subset-wasm$/ }, () => ({ path: HB_WASM, namespace: 'hb-wasm' }));
    b.onLoad({ filter: /.*/, namespace: 'hb-wasm' }, (a) => ({ contents: fs.readFileSync(a.path), loader: 'binary' }));
    b.onResolve({ filter: /^virtual:woff2-(compress|decompress)$/ }, (a) => ({ path: a.path.slice('virtual:woff2-'.length) + '_binding.js', namespace: 'woff2' }));
    b.onLoad({ filter: /.*/, namespace: 'woff2' }, (a) => ({ contents: woff2Binding(a.path), loader: 'js', resolveDir: WOFF2_DIR }));
    b.onResolve({ filter: /^(fs|path)$/ }, (a) => ({ path: a.path, namespace: 'node-empty' }));
    b.onLoad({ filter: /.*/, namespace: 'node-empty' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
  },
};
const notice = (version) => `/* Egatari Studio ${version} — font subsetter, loaded only when exporting an Egatari file (MIT). Bundles harfbuzzjs ${JSON.parse(fs.readFileSync(path.join(path.dirname(HB_WASM), '..', 'package.json'), 'utf8')).version} (harfbuzz-subset.wasm; MIT, harfbuzz under the Old MIT license) and wawoff2 ${JSON.parse(fs.readFileSync(path.join(WOFF2_DIR, 'package.json'), 'utf8')).version} (MIT; Google woff2 and Brotli, MIT). See NOTICE.txt. */\n`;
export async function buildFontSubsetJs(version) {
  const FS_BUNDLE = await esbuild.build({
    entryPoints: [path.join(ROOT, 'app', 'font-subset-tools.js')], bundle: true, write: false, format: 'iife', globalName: '__egatariFontSubset', platform: 'browser',
    target: ['chrome110', 'edge110'], legalComments: 'none', charset: 'utf8', logLevel: 'warning', minify: true, plugins: [fontSubsetPlugin],
  });
  const fontSubsetJs = notice(version) + FS_BUNDLE.outputFiles[0].text;
  if (/<\/script|<!--/i.test(fontSubsetJs)) throw new Error('font-subset.js contains </script or <!-- (cannot be inlined)');
  return fontSubsetJs;
}
