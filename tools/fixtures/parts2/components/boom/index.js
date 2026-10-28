// m-boom：factory が投げる埋め込みのパーツ（tools/test-parts-host.mjs。登録簿が失敗を記録し、再生器が字の代わりを出す）
egatariParts.define({name: "boom", version: "0.1.0", requires: {base: "1.0.0"}, element: "m-boom"}, function(){
  throw new Error("boom factory failed");
});
