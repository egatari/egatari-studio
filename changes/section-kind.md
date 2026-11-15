### Added

- One-file articles can mark sections as preface, chapter, appendix or afterword with `+++ {"kind": "afterword"}` before the section target or heading (spec §9C.1A). Kinds carry through to the next kind line, are checked for order and placement, and appear as `data-section-kind` in the rendered article. Prefaces and afterwords have no section numbers; appendices use letters. Only chapter sections warn when linked to no slide. The ids tool preserves the kind line above each inserted target, and the AI book reference describes the syntax.
