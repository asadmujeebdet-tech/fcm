const AUTH_COOKIE = "fcm_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getAuthKey() {
  const email = process.env.NEXT_PUBLIC_EMAIL;
  const password = process.env.NEXT_PUBLIC_PASSWORD;
  if (!email || !password) throw new Error("Auth credentials are not configured.");
  return `${email}:${password}`;
}

async function sign(value: string) {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getAuthKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidAuthToken(token?: string | null) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [timestamp, id, signature] = parts;
  const issuedAt = Number(timestamp);
  if (!timestamp || !id || !signature || !Number.isFinite(issuedAt) || issuedAt > Date.now() || Date.now() - issuedAt > COOKIE_MAX_AGE * 1000) {
    return false;
  }
  const expected = await sign(`${timestamp}.${id}`);
  return signature === expected;
}

export { AUTH_COOKIE };
