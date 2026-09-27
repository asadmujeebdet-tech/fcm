import { NextResponse } from "next/server";
import { createAuthToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    const expectedEmail = process.env.NEXT_PUBLIC_EMAIL ?? "";
    const expectedPassword = process.env.NEXT_PUBLIC_PASSWORD ?? "";

    if (!expectedEmail || !expectedPassword) {
      return NextResponse.json({ error: "Login is not configured." }, { status: 500 });
    }

    if (email !== expectedEmail || password !== expectedPassword) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const token = await createAuthToken();
    const response = NextResponse.json({ success: true });

    response.cookies.set({
      name: "fcm_session",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    // Remove any cookie created by the previous auth implementation.
    response.cookies.set({
      name: "fcm_auth",
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
