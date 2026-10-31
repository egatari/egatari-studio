// m-nonlit：meta が字のままの object でない埋め込みのパーツ（tools/test-parts-host.mjs。§6.1：組み立ては読めないので書かずに知らせる）
var META = {name: "nonlit", version: "0.1.0", requires: {base: "1.0.0"}, element: "m-nonlit"};
egatariParts.define(META, function(deps){
  return class extends deps.base.Part {};
});
