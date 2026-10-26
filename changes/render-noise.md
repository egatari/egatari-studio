### Fixed

- Quality check: the "component draws differently depending on call order" error no longer fires for renderer anti-aliasing noise: when the
  component DOM is byte-identical and a few differing pixels all lie on shape edges inside the component, it is logged as info `compOrderNoise` instead
