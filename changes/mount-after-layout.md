### Fixed

- The runtime calls component `mount` only after the stage is laid out: a deck started inside a `display:none` iframe or a hidden tab waits for the stage to get a size, then mounts and draws, so figures (e.g. `m-kanbun`'s 書き下し文) look the same as after a normal start; `DECK.ready` comes after the mount in both cases
