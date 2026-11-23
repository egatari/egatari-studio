### Changed

- The `scriptUnclosed` finding now reads as two sentences (what is missing, then why the later slides are lost, then how to fix it), and the narration sections of the slides an unclosed `<script>` swallows are no longer also reported as "slide not found" (R-headings) — in the command-line check, the editor's build warnings and the AI fix request alike — so the fix request asks only to close the `<script>`. Other sections that match no slide are still reported (handoff #96)
