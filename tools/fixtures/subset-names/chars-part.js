// stand-in library: a block keyed by character (the char path under the spec's lesson text; glyphs count)
egatariParts.define({name: "chars", version: "1.0.0"}, function(){
  var M = /*@egatari-block marks*/{"_n":1,"あ":1,"い":1,"う":1,"え":1,"か":1,"q":1,"©":1,"+":1}/*@egatari-block-end*/;
  return {marks: M, glyphs: "う", build: {subset: [{data: "block:marks", key: "char"}]}};
});
