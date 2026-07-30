import { NextRequest, NextResponse } from "next/server";
import { extractReportData } from "@/lib/gemini";
import { checkAndRecordUpload } from "@/lib/rateLimit";
import { getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const sessionId = await getOrCreateSessionId();
  const rateLimit = checkAndRecordUpload(sessionId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Upload limit reached (5 per hour). Please try again later." },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field." }, { status: 400 });
  }

  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PDF, PNG, JPEG, or WEBP file." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 10MB)." }, { status: 400 });
  }

  // The file is only ever held in memory for this request and is never written to disk.
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await extractReportData(buffer, file.type);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Extraction failed:", error);
    const message = error instanceof Error ? error.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
