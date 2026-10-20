### Fixed

- TTS reads “1 歩” correctly: the space between an Arabic numeral and a following Japanese character is removed just before synthesis (rule `join-num-counter@1`, in the browser TTS and the Colab notebook), recorded as `recipe.textNormalize`. `ttsParts` and `inputHash` are unchanged, and existing audio is not stale. The Audio panel lists TTS steps made with an older (or no) pre-processing and regenerates only the ones you choose
