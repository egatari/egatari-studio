### Fixed

- The narration check (`narrFormula`, R-formula) no longer reports code identifiers joined with `_` (`cross_val_score`, `random_state`, `train_test_split`) as an equation read aloud. A name counts as an identifier when one of its parts is a word of three letters or more; subscripts such as `x_1`, `x_t`, `a_ij` and `\alpha_t` are still reported. Hyphenated words such as `scikit-learn` were never reported
