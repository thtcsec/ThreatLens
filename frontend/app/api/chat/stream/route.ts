import { NextRequest, NextResponse } from "next/server";

const INTERNAL_BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8001";
const API_PREFIX = "/api/v1";

interface BackendErrorPayload {
  detail?: string;
  error?: string;
  message?: string;
}

async function parseBackendError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as BackendErrorPayload;
    return payload.detail || payload.error || payload.message || "Chat stream unavailable";
  } catch {
    try {
      const text = (await response.text()).trim();
      return text || "Chat stream unavailable";
    } catch {
      return "Chat stream unavailable";
    }
  }
}

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
    const response = await fetch(`${INTERNAL_BACKEND_URL}${API_PREFIX}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message }),
      cache: "no-store"
    });

    if (!response.ok) {
      const detail = await parseBackendError(response);
      return NextResponse.json({ error: detail }, { status: response.status });
    }

    if (!response.body) {
      return NextResponse.json({ error: "Stream response body is empty" }, { status: 502 });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Chat stream unavailable";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
