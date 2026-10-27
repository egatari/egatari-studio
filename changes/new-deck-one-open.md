### Changed

- New…, Insert slides… and Revise…: only the current step is open (a one-open flow, like a checkout). All headings stay visible in order as buttons (`aria-expanded`, the current one `aria-current="step"`); steps not reached yet show only their heading, greyed. **Next** folds the answered step to its one-line summary with **Change** and opens the next one (scrolled into view, focus on its first control). Copying the instructions opens the paste step, so you land on the paste fields when you come back from the chat. **Change** reopens that step alone.
