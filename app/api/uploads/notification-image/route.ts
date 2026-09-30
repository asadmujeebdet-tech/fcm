import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/current-user";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Use JPG, PNG, or WEBP images." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });

  const extension = ALLOWED_TYPES.get(file.type)!;
  const path = `${userId}/${randomUUID()}.${extension}`;
  if (!process.env.SUPABASE_URL) {
    return NextResponse.json({ error: "Image upload failed: SUPABASE_URL is not configured on the server." }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Image upload failed: SUPABASE_SERVICE_ROLE_KEY is not configured on the server." }, { status: 500 });
  }

  const supabase = createAdminClient();

  try {
    const { error } = await supabase.storage.from("notification-images").upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    const { data } = supabase.storage.from("notification-images").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json({ error: `Image upload failed: ${message}` }, { status: 500 });
  }
}
