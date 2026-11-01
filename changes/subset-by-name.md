### Added

- Components 2.0: subset by name (format §6.2, `match: "name"`, e.g. the icons library of components 2.1.0): only the members
  whose key is a word of the lesson's text (and the entry's `keep`) are written, and the portable index records `subset.names`

### Changed

- Components 2.0 subset: the lesson's text follows format §6.2: text and attribute values of the slide source (character
  references as an HTML parser reads them), part data read as JSON, the narration and `glyphs`; comments, tag and attribute
  names, `<style>` and `<script>` no longer count
- Components 2.0 subset: a bad declaration (e.g. a non-string key, a missing block) is reported and the whole part is written
  with no `subset` record, instead of subsetting the other blocks
