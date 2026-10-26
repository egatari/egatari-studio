// Egatari Viewer on Cloudflare Workers static assets (play/wrangler.toml). The page is static files (_play/, with _headers);
// this Worker only answers requests that match no file. The one it handles: an Android share (POST /share) that arrives
// when the page's service worker is not installed yet, which cannot be received here (nothing is uploaded or stored):
// the page is told to ask the viewer to open the app once and share again.
const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/share' && request.method === 'POST') {
      return new Response(null, { status: 303, headers: { ...HEADERS, Location: '/?share=nosw' } });
    }
    const r = await env.ASSETS.fetch(request);
    const out = new Response(r.body, r);
    for (const [k, v] of Object.entries(HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
    return out;
  },
};
