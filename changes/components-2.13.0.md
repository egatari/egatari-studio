### Added

- Parts library 2.13.0 is now the default (release edc6457, tarball 26bf9066…), imported after 2.12.0 (release 200fcde, tarball 15326dca…); Studio goes there from 2.9.1. New parts: `m-network` (グラフの探索 / Graph search: graph search, shortest paths and tours one step at a time, also graphical models, path diagrams and HMM trellises) in the new algo set; `m-nnet` (ニューラルネット / Neural network), `m-classify2d` (2 次元の分類 / 2-D classification) and `m-contour` (等高線 / Contour plot) in the new ml set; `m-ctable` (計算して埋まる表 / Computed table) and `m-vector` (ベクトルと行列 / Vectors and matrices); and `m-trace` (コードの実行を追う / Code trace), the first part of tier `local`, which only the make skill's `references/parts/local.md` describes. `m-code`, `m-map-japan`, `m-map-world`, `m-folds` and seven other parts get new versions; more parts get README updates only. The parts gallery is re-synced to the 2.13.0 release
- New… shows the six new chat parts with a one-line description and an icon

### Changed

- The Japanese word map for the parts' own text in `tools/make-llm-guide.mjs` (added in 0.6.14) is empty: the parts library 2.13.0 READMEs use the glossary words themselves, and the instructions are byte-identical without it
