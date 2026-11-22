### Added

- Export ▸ For an LMS (SCORM)… now has a Questions choice: not a condition for completion, completed when all are answered, or completed when all are answered correctly (`metadata.completion.checks`; a working folder also keeps it in egatari.json), and the package reports a score from the questions that parts such as Predict and check ask. The dialog and the docs say that questions check understanding and are not a test: the answers are in the file and judged on the learner's device, and graded tests belong to the LMS's quizzes. `build --scorm` prints the condition (handoff #84)
