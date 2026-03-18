import { NextRequest, NextResponse } from "next/server";
import { sendChatMessage } from "@/lib/backend";

export async function POST(request: NextRequest) {
  let message = "";

  try {
    const body = (await request.json()) as { message?: string };
    message = body.message?.trim() || "";
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const payload = await sendChatMessage(message);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Chat service unavailable";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
