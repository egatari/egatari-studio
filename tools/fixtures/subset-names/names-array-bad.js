// stand-in library (bad: a numeric key): an array block whose items are keyed by the field id
egatariParts.define({name: "names-array", version: "1.0.0"}, function(){
  var L = /*@egatari-block list*/[{"id":"user","d":1},{"id":"chart-bar","d":2},{"id":3,"d":3},{"id":"home","d":4}]/*@egatari-block-end*/;
  return {list: L, build: {subset: [{data: "block:list", key: "id", match: "name", keep: ["home"]}]}};
});
