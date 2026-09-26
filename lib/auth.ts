import { SignJWT } from "jose";

export const AUTH_COOKIE = "fcm_auth";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getSecret() {
  const email = process.env.NEXT_PUBLIC_EMAIL;
  const password = process.env.NEXT_PUBLIC_PASSWORD;
  if (!email || !password) throw new Error("NEXT_PUBLIC_EMAIL and NEXT_PUBLIC_PASSWORD must be configured.");
  return new TextEncoder().encode(`${email}:${password}`);
}

export async function createAuthToken() {
  return new SignJWT({ session: "fcm" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function setAuthCookie() {
  const { cookies } = await import("next/headers");
  cookies().set({
    name: AUTH_COOKIE,
    value: await createAuthToken(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearAuthCookie() {
  const { cookies } = require("next/headers");
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
