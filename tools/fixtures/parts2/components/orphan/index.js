// m-orphan：失敗したパーツ（boom）に頼る埋め込みのパーツ（tools/test-parts-host.mjs。頼る先の失敗が伝わる）
egatariParts.define({name: "orphan", version: "0.1.0", requires: {base: "1.0.0", boom: "0.1.0"}, element: "m-orphan"}, function(deps){
  return class extends deps.base.MotionElement {};
});
