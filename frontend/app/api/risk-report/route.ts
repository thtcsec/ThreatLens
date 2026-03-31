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
    return payload.detail || payload.error || payload.message || "Cannot load risk report";
  } catch {
    try {
      const text = (await response.text()).trim();
      return text || "Cannot load risk report";
    } catch {
      return "Cannot load risk report";
    }
  }
}

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project")?.trim() || "";
  const query = project ? `?project=${encodeURIComponent(project)}` : "";

  try {
    const response = await fetch(`${INTERNAL_BACKEND_URL}${API_PREFIX}/risk-report${query}`, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      const detail = await parseBackendError(response);
      return NextResponse.json({ error: detail }, { status: response.status });
    }

    const payload = (await response.json()) as unknown;
    return NextResponse.json(payload, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Cannot load risk report" }, { status: 502 });
  }
}
