### Fixed

- Player: with reduced motion (`prefers-reduced-motion`), a component that shows elapsed time as its content (`static clock = true`, such as m-timer) now gets the real time and keeps counting, instead of jumping to its end. Everything else is still shown at its final state (Player P3). The player reads `clock` and `preview` from the component class, never from a manifest
