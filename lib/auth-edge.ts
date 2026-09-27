import { jwtVerify } from "jose";

export const AUTH_COOKIE = "fcm_session";

function getSecret() {
  const email = process.env.NEXT_PUBLIC_EMAIL;
  const password = process.env.NEXT_PUBLIC_PASSWORD;
  if (!email || !password) return null;
  return new TextEncoder().encode(`${email}:${password}`);
}

export async function isValidAuthToken(token?: string | null) {
  if (!token) return false;
  const secret = getSecret();
  if (!secret) return false;

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return payload.session === "fcm";
  } catch {
    return false;
  }
}
