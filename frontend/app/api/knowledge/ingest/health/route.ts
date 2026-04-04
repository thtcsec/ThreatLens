import { NextResponse } from "next/server";

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
    return payload.detail || payload.error || payload.message || "Knowledge health service unavailable";
  } catch {
    try {
      const text = (await response.text()).trim();
      return text || "Knowledge health service unavailable";
    } catch {
      return "Knowledge health service unavailable";
    }
  }
}

export async function GET() {
  try {
    const response = await fetch(`${INTERNAL_BACKEND_URL}${API_PREFIX}/knowledge/ingest/health`, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      const detail = await parseBackendError(response);
      return NextResponse.json({ error: detail }, { status: response.status });
    }

    const payload = await response.json();
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Knowledge health service unavailable";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
