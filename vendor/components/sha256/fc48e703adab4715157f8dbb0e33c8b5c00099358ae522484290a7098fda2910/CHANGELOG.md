# m-classify2d changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.13.0)

- New part: 2-D classification drawn from scikit-learn's output (tools/sk2ega.py), with no model maths in the part.
  - Regions from predict over a meshgrid, with the staircase boundary; probability and decision-function contours (contour-core) with level labels; support-vector rings.
  - Voronoi cells computed from seed points (1-NN).
  - Decision-tree splits one per step inside the parent cell, then the leaves; node ids shared with m-tree.
  - k-means: assignment and update steps, the centroids' Voronoi cells following the moving centroids; assignments and means checked.
