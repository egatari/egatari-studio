### Fixed

- Live and embed follow extension version governance (format spec §9A): higher versions are ignored and preserved through editor saves, exports and pack/unpack. They add no connection or frame destinations to the file policy; neither the bundled Live player nor the Viewer's Live host connects. The Live settings panel leaves unsupported versions untouched, and the checker reports them only as `extensionVersion` information
- Optional additions within Live v1 remain usable and are preserved, including members on the extension, its window and activities. Embed v1 keeps optional members and its existing allowed destinations
