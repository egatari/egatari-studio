// SPDX-License-Identifier: MIT
// Cloudflare Turnstile server-side verification for part requests (the same code as egatari/live src/turnstile.js, with this action).
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
import { TURNSTILE_ACTION } from "./request.js";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Cloudflare's documented test secret keys (https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
// With these, siteverify's answer is fixed regardless of the token, so we answer the same way locally,
// which keeps `npm test` and `wrangler dev` offline. A production secret always goes to siteverify.
export const TEST_SECRETS = Object.freeze({
  "1x0000000000000000000000000000000AA": { success: true },
  "2x0000000000000000000000000000000AA": { success: false, "error-codes": ["invalid-input-response"] },
  "3x0000000000000000000000000000000AA": { success: false, "error-codes": ["timeout-or-duplicate"] },
});
// Documented test site keys (public). The widget made with them yields this dummy token;
// production secrets reject it at siteverify.
export const TEST_SITEKEYS = Object.freeze(["1x00000000000000000000AA", "2x00000000000000000000AB", "3x00000000000000000000FF"]);
export const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/**
 * Verify a Turnstile token. Returns {ok: true} or {ok: false, status, reason}.
 * `fetchImpl` is injectable for tests; production uses the global fetch.
 */
export async function verifyTurnstile(env, token, ip, { fetchImpl = fetch, expectedHostname = null } = {}) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return { ok: false, status: 503, reason: "unconfigured" };
  const fixed = TEST_SECRETS[secret];
  if (fixed) return fixed.success ? { ok: true } : { ok: false, status: 403, reason: fixed["error-codes"][0] };

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  form.append("idempotency_key", crypto.randomUUID());
  let data;
  try {
    const res = await fetchImpl(SITEVERIFY_URL, { method: "POST", body: form });
    data = await res.json();
  } catch {
    return { ok: false, status: 503, reason: "siteverify-unreachable" };
  }
  if (!data || data.success !== true) {
    return { ok: false, status: 403, reason: (data && data["error-codes"] && data["error-codes"][0]) || "failed" };
  }
  if (data.action && data.action !== TURNSTILE_ACTION) return { ok: false, status: 403, reason: "wrong-action" };
  if (expectedHostname && data.hostname && data.hostname !== expectedHostname) return { ok: false, status: 403, reason: "wrong-hostname" };
  return { ok: true };
}
