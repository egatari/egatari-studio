### Changed

- The fix request for the AI (修正依頼) names the part's height when the body overflows at the bottom because of a part with `style="height:…px"`: it adds “in m-tree, change style height:380px to height:370px” (the overflow subtracted, rounded down to 10 px) after the amount to cut (backlog #224). In the nightly evaluation a 1 px overflow of `m-tree` stayed through two rounds of fixes. The editor now keeps which part overflowed (#196) for its fix request too, as the command line already did. `tools/test-fix-part-height.mjs`
