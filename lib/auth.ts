import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const AUTH_COOKIE = "fcm_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getAuthKey() {
  const email = process.env.NEXT_PUBLIC_EMAIL;
  const password = process.env.NEXT_PUBLIC_PASSWORD;

  if (!email || !password) {
    throw new Error("NEXT_PUBLIC_EMAIL and NEXT_PUBLIC_PASSWORD must be configured.");
  }

  return `${email}:${password}`;
}

function sign(value: string) {
  return createHmac("sha256", getAuthKey()).update(value).digest("hex");
}

export function createAuthToken() {
  const payload = `${Date.now()}.${crypto.randomUUID()}`;
  return `${payload}.${sign(payload)}`;
}

export function isValidAuthToken(token?: string | null) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [timestamp, id, signature] = parts;
  if (!timestamp || !id || !signature) return false;

  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > COOKIE_MAX_AGE * 1000) return false;

  const expected = sign(`${timestamp}.${id}`);
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function setAuthCookie() {
  cookies().set({
    name: AUTH_COOKIE,
    value: createAuthToken(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearAuthCookie() {
  cookies().set({
    name: AUTH_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export { AUTH_COOKIE };