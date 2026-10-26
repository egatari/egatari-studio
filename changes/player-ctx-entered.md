### Changed (API)

- Component context (format spec §8.4): `ctx.entered` is `true` on the first render after the viewer entered the slide from another slide or by a jump (a link, the slide overview, a slide number, a position chosen in the presenter view or the editor, opening the lesson), and `false` otherwise, so a component knows when to reset viewer input. `deck:pos` still fires for components pinned to earlier releases
