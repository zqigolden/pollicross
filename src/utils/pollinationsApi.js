/**
 * Pollinations.ai API client — BYOP (Bring Your Own Pollen) auth flow.
 *
 * Instead of burning the app's own quota, users authorize the app to spend
 * their personal Pollinations balance:
 *   1. App sends the user to enter.pollinations.ai/authorize with our public
 *      App Key (pk_) as `client_id`.
 *   2. User signs in with their Pollinations account and approves.
 *   3. Pollinations redirects back with a scoped user key (sk_) in the URL
 *      fragment (#api_key=sk_...). Fragments never reach servers / logs.
 *   4. We store that sk_ key and send it as a Bearer token on generation
 *      requests, so usage is billed to the user, not the app.
 *
 * Docs: https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md
 */

// Publishable App Key — identifies this app on the consent screen and for
// traffic attribution. Safe to embed client-side (it cannot generate on its
// own beyond a tiny per-IP rate limit; real generation needs a user sk_ key).
const APP_KEY = 'pk_wALQm7skU45vslV8';

const AUTHORIZE_URL = 'https://enter.pollinations.ai/authorize';
// Authenticated generation goes through the gen.pollinations.ai gateway, which
// validates the user's sk_ key. The image route is /image/{prompt}.
const GEN_BASE = 'https://gen.pollinations.ai';
// Guests (not logged in) use the legacy image host, which serves anonymous
// requests without a key — free but rate-limited and may include a watermark.
const IMAGE_BASE = 'https://image.pollinations.ai';
const STORAGE_KEY = 'pollicross_sk_key';
const ALLOWED_MODELS = 'flux';

// Set when the consent screen returns an error (e.g. the user denied access),
// captured at startup and read once by the UI.
let pendingAuthError = null;

/** Returns and clears any auth error captured during the redirect. */
export function consumeAuthError() {
  const err = pendingAuthError;
  pendingAuthError = null;
  return err;
}

/** Current page URL without hash — used as the OAuth redirect target. */
function getRedirectUri() {
  return window.location.origin + window.location.pathname;
}

/**
 * Redirect the user to the Pollinations consent screen to log in and authorize.
 * On return they land back on this page with the key in the URL fragment.
 */
export function login() {
  const params = new URLSearchParams({
    redirect_uri: getRedirectUri(),
    client_id: APP_KEY,
    models: ALLOWED_MODELS,
    // budget/expiry left at Pollinations defaults; user can adjust on consent screen.
  });
  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Read the auth result from the URL fragment after redirect. Stores a returned
 * sk_ key, then strips the fragment from the URL so it isn't left in history.
 *
 * @returns {{ key?: string, error?: string } | null}
 */
export function captureKeyFromHash() {
  if (!window.location.hash || window.location.hash.length < 2) return null;

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const error = hashParams.get('error');
  const key = hashParams.get('api_key');

  if (!error && !key) return null;

  // Clean the fragment from the address bar regardless of outcome.
  window.history.replaceState(null, '', getRedirectUri());

  if (error) {
    pendingAuthError = error;
    return { error };
  }

  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // localStorage unavailable (private mode); key stays in memory only.
  }
  return { key };
}

/** The stored user key, or null if not logged in. */
export function getStoredKey() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return Boolean(getStoredKey());
}

export function logout() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Generate a puzzle image — hybrid mode.
 *
 * - Logged in: hits the gen.pollinations.ai gateway (/image/{prompt}) with the
 *   user's sk_ key as an `Authorization: Bearer` header, billed to their balance.
 * - Guest: hits the legacy image.pollinations.ai host anonymously (no key) — free
 *   but rate-limited and possibly watermarked.
 *
 * Either way we fetch it (not a bare <img src>) and return a blob object URL, so
 * the canvas that reads it during binarization is same-origin and never tainted.
 *
 * @param {string} prompt - The full image prompt
 * @returns {Promise<string>} An object URL for the generated image
 * @throws {Error} with code-like message 'SESSION_EXPIRED' or a user-facing message
 */
export async function generateImageBlob(prompt) {
  const key = getStoredKey();
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1000000);

  let url;
  let init;
  if (key) {
    // Logged in: authenticated gateway, watermark removed (nologo).
    const params = new URLSearchParams({ model: 'flux', width: '512', height: '512', seed: String(seed), nologo: 'true' });
    url = `${GEN_BASE}/image/${encodedPrompt}?${params.toString()}`;
    init = { headers: { Authorization: `Bearer ${key}` } };
  } else {
    // Guest: anonymous legacy host, identified by the `referrer` query param
    // (the app's URL). We deliberately do NOT send the pk_ App Key here — it is
    // rate-limited to ~1 image/IP/hour and quickly returns 403. Referrer-based
    // anonymous access has more generous limits.
    //
    // `referrerPolicy: 'no-referrer'` stops the browser from attaching its own
    // Referer header on this fetch; otherwise that header overrides our
    // `?referrer=` param (and a cross-origin fetch's Referer differs from plain
    // address-bar navigation), which is what triggered the 403.
    const params = new URLSearchParams({
      model: 'flux',
      width: '512',
      height: '512',
      seed: String(seed),
      nologo: 'true',
      referrer: window.location.origin + window.location.pathname,
    });
    url = `${IMAGE_BASE}/prompt/${encodedPrompt}?${params.toString()}`;
    init = { referrerPolicy: 'no-referrer' };
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Could not reach Pollinations. Check your connection and try again.');
  }

  if (key && (res.status === 401 || res.status === 403)) {
    logout(); // expired/invalid key — drop it so the next attempt runs as guest
    throw new Error('SESSION_EXPIRED');
  }
  if (!key && (res.status === 403 || res.status === 429)) {
    // Guest ran into the anonymous generation limit — recommend signing in.
    throw new Error('You may have reached the guest generation limit. Connect your Pollinations account to keep generating on your own balance.');
  }
  if (res.status === 402) {
    throw new Error('Your Pollinations balance is empty. Top up your account to keep generating.');
  }
  if (res.status === 429) {
    throw new Error('Pollinations is rate limiting requests. Wait a few seconds and try again.');
  }
  if (!res.ok) {
    throw new Error(`Image generation failed (HTTP ${res.status}). Please retry.`);
  }

  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('Pollinations did not return an image. Please retry.');
  }
  return URL.createObjectURL(blob);
}
