import { cookies } from "next/headers";

const AUTH_COOKIE = "fcm_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getAuthKey() {
  const email = process.env.NEXT_PUBLIC_EMAIL;
  const password = process.env.NEXT_PUBLIC_PASSWORD;
  if (!email || !password) throw new Error("NEXT_PUBLIC_EMAIL and NEXT_PUBLIC_PASSWORD must be configured.");
  return `${email}:${password}`;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(getAuthKey()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createAuthToken() {
  const payload = `${Date.now()}.${crypto.randomUUID()}`;
  return `${payload}.${await sign(payload)}`;
}

export async function setAuthCookie() {
  cookies().set({ name: AUTH_COOKIE, value: await createAuthToken(), httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE });
}

export function clearAuthCookie() {
  cookies().set({ name: AUTH_COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export { AUTH_COOKIE };
