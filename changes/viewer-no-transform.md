### Changed

- Viewer: the page's HTML is served with `Cache-Control: … no-transform`, so the CDN never rewrites it (Cloudflare Web Analytics cannot inject its beacon script).
