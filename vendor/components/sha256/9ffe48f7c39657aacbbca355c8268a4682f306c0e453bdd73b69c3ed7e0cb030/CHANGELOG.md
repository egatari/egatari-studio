# m-diverge changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.9.0)

- New part: a waterfall. Total bars grow from 0, change bars from the running total; values are written above each bar with a sign on changes; dotted links join the bars at the running total. A later total's `value` is checked against the running total (`data` report). Serves the purpose `deviation` (差・増減), which has no new-deck tile.
