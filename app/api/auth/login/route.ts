import { NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/auth";

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

    setAuthCookie();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
