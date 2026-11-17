# Egatari part-request relay

Part of Egatari Studio. A small Cloudflare Worker that lets a teacher ask for a new part from inside Studio (**Request a part…**) without a GitHub account: it turns the request into a public issue in [egatari/components](https://github.com/egatari/components/issues) with the label `request`. (handoff Issue #35, backlog #117)

## What is sent, and to whom

- **Sent:** only the text the teacher types in the dialog: what they want to show (required, up to 2000 characters), and optionally the subject or field and the grade or audience (up to 60 characters each). Nothing else: no lesson content, no name or e-mail address, no image, no version, browser or time. Any other field in a request is refused (`unknown_field`).
- **Where it goes:** a public issue in egatari/components, created by this relay with a GitHub token that can only read and write issues of that repository. The teacher's text is put inside code fences, so GitHub renders nothing in it (no @mentions that notify people, no `#123` or `owner/repo#1` references that show up in other issues, no links, images or HTML). The title is `[request] ` and the first line, shortened to 80 characters.
- **Images:** not accepted. The token is limited to Issues, and the GitHub Issues API cannot take attachments; storing images elsewhere would need more storage and more setup. The dialog says to describe the drawing in words.
- **Stored by the relay:** nothing. No database, no KV, no R2; no console output, and `observability` (request logs) is off. The sender's IP address is used for the per-sender rate limit (counted in memory by Cloudflare's Rate Limiting binding for a minute) and passed to Turnstile's siteverify with the token; it is not stored.
- **Retention:** the issue stays on GitHub until the maintainers delete it. A sender who wants one removed asks through Studio's private reporting (docs/privacy.md "Contact").

## How Studio uses it

Studio's page keeps its strict CSP (`connect-src 'self'`); it never loads Turnstile and never connects to the relay. Instead, the dialog shows the relay's own page `/widget` in a frame (`frame-src` names only the relay). That page renders Turnstile and posts the request to `/api/request` on its own origin. Studio and the frame talk with `postMessage`; each side checks the other's origin.

```
Studio (studio.egatari.org)                 relay (request.egatari.org)                    GitHub
  dialog: fields, consent line  ──frame──▶  /widget?parent=<Studio origin>&lang=ja|en
                                 ◀─ready/token/height─
  Send ─{t:"send", request}─▶                POST /api/request (same origin) ──▶ checks ──▶ POST /repos/egatari/components/issues
                                 ◀─{t:"sent", url}─                                                   (label: request)
```

Messages are listed at the top of `src/widget.js`. The request's shape and the issue text are in `src/request.js`, which Studio's dialog (`app/part-request.js`) also uses to check the fields before sending.

## Abuse controls

`POST /api/request` is refused unless, in this order:

1. `Origin` is the relay's own origin (only the widget page sends; a browser always sends `Origin` on a POST). No CORS headers are sent.
2. `GITHUB_TOKEN` and `TURNSTILE_SECRET` are set and the rate limiter is bound; otherwise `503 unavailable` (fails closed).
3. The sender is under the rate limit: 3 requests per 60 s per `CF-Connecting-IP` (`REQUEST_LIMITER`, the [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), as in egatari/live). Counts are per Cloudflare location and eventually consistent: a brake, not an exact quota.
4. `Content-Type: application/json`, body at most 8 KiB, valid UTF-8 JSON, only the fields `what`, `subject`, `grade` (plus `parent` and `turnstile`), with the lengths above; `what` not empty; `subject` and `grade` one line. Control characters and bidi overrides are removed.
5. `parent` is one of `STUDIO_ORIGINS` (production: `https://studio.egatari.org` only). The widget page itself is refused for any other `parent`, and its CSP `frame-ancestors` lists only those origins.
6. The Turnstile token passes siteverify (verified last, so that a malformed request does not spend it), with action `part-request` and the relay's hostname.

Recommended extra layer: a Cloudflare WAF rate-limiting rule on `POST /api/request` (for example 10 per 10 minutes per IP) and a usage alert on the account.

## Development and tests

```sh
cd relay
npm ci --ignore-scripts      # wrangler only (pinned); the Worker has no runtime dependencies
npm test                     # node test/relay.test.mjs: Node only, no network, no Wrangler needed
cp .dev.vars.example .dev.vars && npm run dev    # wrangler dev on http://localhost:8787
```

The tests call the Worker's `fetch` with a fake env: a fake rate limiter, Cloudflare's documented Turnstile **test secrets** (`1x…AA` always passes, `2x…AA` always fails; answered locally, as in egatari/live), and an injected `fetch` that stands in for siteverify and the GitHub API. From the Studio repository root, `npm test` runs them (`tools/test-relay.mjs`) together with the browser test of the dialog against a local copy of this Worker (`tools/test-app-part-request.mjs`). With an empty `TURNSTILE_SITEKEY` (development) the widget page shows no check and sends Cloudflare's dummy token, which only a test secret accepts.

Dependencies are pinned to exact versions; `undici` is overridden to 7.30.1 for the same advisory as in egatari/live. Install with `--ignore-scripts` (see egatari/live README "Dependencies and supply chain").

## Setup and deploy (for the maintainer)

Nothing below has been done yet. Never write a secret (the Turnstile secret key or the GitHub token) into the repository, an issue, a chat or a commit message. The Turnstile **site key** is public.

1. **Turnstile widget.** Cloudflare dashboard (the account that has the `egatari.org` zone) → **Turnstile** → **Add widget**:
   - Widget name: `Egatari part requests`
   - Hostname management → **Add hostnames**: `request.egatari.org` (the relay's hostname: the widget runs on the relay's page, not on studio.egatari.org). Add `localhost` too only if you want to try the real widget with `wrangler dev`.
   - Widget mode: **Managed**. Pre-clearance: **No**.
   - **Create**. Copy the **Site Key** and the **Secret Key**.
   - Put the site key in `relay/wrangler.production.toml`: `TURNSTILE_SITEKEY = "<site key>"` and commit it (it is public). Keep the secret key for step 5.
2. **Label.** In egatari/components, create the label `request` if it does not exist: **Issues → Labels → New label**, name `request`, description `Part request from Egatari Studio`, any colour. (Or `gh label create request -R egatari/components --description "Part request from Egatari Studio"`.)
3. **GitHub token.** github.com → your avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:
   - Token name: `egatari part-request relay`; Description: `Creates issues in egatari/components from Egatari Studio`
   - **Resource owner: egatari**
   - **Expiration:** a custom date about a year ahead (the longest the organization allows). Put a reminder a week before it, to make a new token and repeat step 5 for `GITHUB_TOKEN`.
   - **Repository access: Only select repositories → egatari/components**
   - **Permissions → Repository permissions → Issues: Read and write.** Nothing else (**Metadata: Read-only** is added by GitHub and is required). No account permissions, no organization permissions.
   - **Generate token** and copy it (it is shown once; do not save it in a file).
   - If the organization requires approval of fine-grained tokens: **egatari organization → Settings → Personal access tokens → Pending requests** → approve it. (If fine-grained tokens are not allowed at all, enable them under **Settings → Personal access tokens → Settings**.)
   - Issues created by the relay show this token's owner as the author; the issue text says it was relayed from Studio.
4. **Deploy.**

   ```sh
   cd relay
   npm ci --ignore-scripts && npm test
   npx wrangler login                     # if this machine is not signed in yet
   CLOUDFLARE_ACCOUNT_ID=<account id> npx wrangler deploy -c wrangler.production.toml
   ```

   `wrangler.production.toml` sets the Custom Domain `request.egatari.org` (Wrangler creates the DNS record and the certificate), `PUBLIC_ORIGIN`, `STUDIO_ORIGINS = "https://studio.egatari.org"`, `GITHUB_REPO = "egatari/components"`, `ISSUE_LABEL = "request"` and the rate limiter. Until step 5 the relay answers `503 unavailable`.
5. **Secrets** (each command asks for the value; paste it and press Enter):

   ```sh
   CLOUDFLARE_ACCOUNT_ID=<account id> npx wrangler secret put TURNSTILE_SECRET -c wrangler.production.toml   # the Turnstile secret key
   CLOUDFLARE_ACCOUNT_ID=<account id> npx wrangler secret put GITHUB_TOKEN -c wrangler.production.toml       # the fine-grained token
   ```

6. **Check the relay.**

   ```sh
   curl -s https://request.egatari.org/api/health
   # {"v":1,"ok":true,"service":"egatari-part-request"}
   curl -sI 'https://request.egatari.org/widget?parent=https%3A%2F%2Fstudio.egatari.org&lang=ja' | grep -i content-security-policy
   # ... frame-ancestors https://studio.egatari.org
   curl -s -X POST https://request.egatari.org/api/request -H 'content-type: application/json' -d '{"what":"x"}'
   # {"v":1,"error":"forbidden",...}   (not from the widget page)
   ```

   Open `https://request.egatari.org/widget?parent=https%3A%2F%2Fstudio.egatari.org&lang=ja` in a browser: the Turnstile check appears and passes (the page sends nothing by itself).
7. **Turn it on in Studio** (a code change, in a pull request or by the dev session):
   - `app/part-request.js`: `export const PART_REQUEST_RELAY = 'https://request.egatari.org';`
   - `app/index.html`, the CSP `<meta>`: replace `frame-src 'none'` with `frame-src https://request.egatari.org`.
   - `node tools/test-relay.mjs` (checks the two agree) and `node tools/test-app-part-request.mjs`; add a `changes/` fragment; release as usual. Studio's site is published only from release tags, so the button starts sending with that release.
8. **Try it once on the real site.** On https://studio.egatari.org/ press **Request a part…**, write `Test from the maintainer, please ignore` in **What you want to show**, pass the check, **Send**. The dialog shows the issue link; open it and check the title (`[request] Test from…`), the body (the text in a fence, the footer) and the label `request`. Then close the issue (or delete it: **Delete issue** at the bottom of the issue's sidebar).

If something goes wrong later: `npx wrangler secret delete GITHUB_TOKEN -c wrangler.production.toml` stops new issues at once (the relay answers 503 and the dialog says it could not send); revoking the token on GitHub does the same.

## License

MIT, like the rest of Egatari Studio. `src/turnstile.js` follows egatari/live's `src/turnstile.js` by the same author.
