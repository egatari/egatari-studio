### Fixed

- Player: a lesson whose frame is shown and then hidden again while its fonts are still loading (a window opened and closed at once, a replaced preview) no longer mounts its parts at zero size; it waits until it is shown again. Before, m-folds drew its cells with a negative corner radius and the console logged `<rect> attribute rx: A negative value is not valid`.
