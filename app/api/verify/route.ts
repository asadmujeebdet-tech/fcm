import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let payload: { serviceAccount?: string };

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.serviceAccount) {
    return NextResponse.json({ error: "serviceAccount is required" }, { status: 400 });
  }

  try {
    const parsed = JSON.parse(payload.serviceAccount);
    const requiredFields = ["type", "project_id", "private_key", "client_email"];
    const missing = requiredFields.filter((f) => !parsed[f]);

    if (missing.length > 0) {
      return NextResponse.json(
        { valid: false, error: `Missing fields in service account JSON: ${missing.join(", ")}` },
        { status: 200 }
      );
    }

    return NextResponse.json({
      valid: true,
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
    });
  } catch {
    return NextResponse.json({ valid: false, error: "Not valid JSON" }, { status: 200 });
  }
}
