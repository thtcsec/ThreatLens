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
    return payload.detail || payload.error || payload.message || "Cannot load chat history";
  } catch {
    try {
      const text = (await response.text()).trim();
      return text || "Cannot load chat history";
    } catch {
      return "Cannot load chat history";
    }
  }
}

export async function GET(request: NextRequest) {
  const pageParam = request.nextUrl.searchParams.get("page") || "1";
  const pageSizeParam = request.nextUrl.searchParams.get("pageSize") || "10";
  const queryParam = request.nextUrl.searchParams.get("q") || "";
  const sortParam = request.nextUrl.searchParams.get("sort") || "newest";
  const query =
    `?page=${encodeURIComponent(pageParam)}` +
    `&pageSize=${encodeURIComponent(pageSizeParam)}` +
    `&q=${encodeURIComponent(queryParam)}` +
    `&sort=${encodeURIComponent(sortParam)}`;

  try {
    const response = await fetch(`${INTERNAL_BACKEND_URL}${API_PREFIX}/chat/history${query}`, {
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
    return NextResponse.json({ error: "Cannot load chat history" }, { status: 502 });
  }
}
