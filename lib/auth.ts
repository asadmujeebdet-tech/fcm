import { jwtVerify, SignJWT } from "jose";

export const AUTH_COOKIE = "fcm_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getSecret() {
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  if (!email || !password) {
    throw new Error("EMAIL and PASSWORD must be configured.");
  }
  return new TextEncoder().encode(`${email}:${password}`);
}

export async function createAuthToken() {
  return new SignJWT({ session: "fcm" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function isValidAuthToken(token?: string | null) {
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    return payload.session === "fcm";
  } catch {
    return false;
  }
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

export async function clearAuthCookie() {
  const { cookies } = await import("next/headers");
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
