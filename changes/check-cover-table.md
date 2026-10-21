### Added

- Quality check (command and editor): on every slide, warn when text goes off a slide without `.body` (`textOffSlide`), when text boxes overlap each other or the cover's top band (`textOverlap`; on a cover or section divider the finding names the allowed children and where a subtitle goes), and when a short word in a table cell breaks across lines (`cellWordBreak`). All are R-fit warnings (backlog #64, #65).
