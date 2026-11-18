# m-folds changelog

## 2.1.0 (components 2.13.0)

- Per-sample splits: with `splits` (and `samples`), each sample is a cell and each row one split from a scikit-learn splitter (KFold, StratifiedKFold, GroupKFold, TimeSeriesSplit, ShuffleSplit, holdout); class colours and names, group runs, time ends; unused samples in a dashed outline.
- Checks per splitter: each sample tested once (KFold types), groups kept together, the past before the test for time series, stratified class counts, one holdout split.
- The k mode draws exactly as 2.0.1.

## 2.0.1 (components 2.7.0)

- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.0 (components 2.6.0)

- Rotate validation folds; deterministic steps and Japanese/English labels.
- Accessible final summary, preserved author labels, data/size reports and no answer preview.
