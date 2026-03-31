import { NextRequest, NextResponse } from "next/server";

const INTERNAL_BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL || process.env.BACKEND_URL || "http://localhost:8001";
const API_PREFIX = "/api/v1";

interface BackendErrorPayload {
  detail?: string;
  error?: string;
  message?: string;
}

async function parseBackendError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as BackendErrorPayload;
    return payload.detail || payload.error || payload.message || "Chat service unavailable";
  } catch {
    try {
      const text = (await response.text()).trim();
      return text || "Chat service unavailable";
    } catch {
      return "Chat service unavailable";
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
    const response = await fetch(`${INTERNAL_BACKEND_URL}${API_PREFIX}/chat`, {
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

    const payload = (await response.json()) as unknown;
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Chat service unavailable";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
