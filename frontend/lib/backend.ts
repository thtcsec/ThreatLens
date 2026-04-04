import { ChatHistoryQueryOptions, ChatHistoryResponse, ChatRequest, ChatResponse, ChatStreamMeta, RiskReport } from "@/types";

const FRONTEND_API_PREFIX = "/api";

interface BackendErrorPayload {
  detail?: string;
  error?: string;
  message?: string;
}

async function parseBackendError(response: Response, endpointLabel: string): Promise<never> {
  let detail = "Unknown backend error";

  try {
    const payload = (await response.json()) as BackendErrorPayload;
    detail = payload.detail || payload.error || payload.message || detail;
  } catch {
    try {
      const text = (await response.text()).trim();
      if (text) {
        detail = text;
      }
    } catch {
      // Ignore parse failures and keep fallback detail.
    }
  }

  throw new Error(`${endpointLabel} failed (${response.status}): ${detail}`);
}

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  const payload: ChatRequest = { message };

  const response = await fetch(`${FRONTEND_API_PREFIX}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return parseBackendError(response, "Chat endpoint");
  }

  return (await response.json()) as ChatResponse;
}

export async function getRiskReport(project?: string): Promise<RiskReport> {
  const query = project?.trim() ? `?project=${encodeURIComponent(project.trim())}` : "";
  const response = await fetch(`${FRONTEND_API_PREFIX}/risk-report${query}`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    return parseBackendError(response, "Risk report endpoint");
  }

  return (await response.json()) as RiskReport;
}

export async function getChatHistory(options: ChatHistoryQueryOptions = {}): Promise<ChatHistoryResponse> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 10, 100));
  const keyword = (options.keyword || "").trim();
  const sort = options.sort === "oldest" ? "oldest" : "newest";
  const response = await fetch(
    `${FRONTEND_API_PREFIX}/chat/history?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(keyword)}&sort=${sort}`,
    {
    method: "GET",
    cache: "no-store"
    }
  );

  if (!response.ok) {
    return parseBackendError(response, "Chat history endpoint");
  }

  return (await response.json()) as ChatHistoryResponse;
}

interface StreamHandlers {
  onMeta?: (meta: ChatStreamMeta) => void;
  onChunk: (text: string) => void;
  onDone?: (payload: ChatResponse) => void;
}

interface StreamOptions {
  signal?: AbortSignal;
}

interface ParsedSseEvent {
  event: string;
  data: unknown;
}

function parseSseBlock(block: string): ParsedSseEvent | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  const rawPayload = dataLines.join("\n");

  // Some SSE servers may emit plain text control payloads (not JSON).
  if (!(rawPayload.startsWith("{") || rawPayload.startsWith("["))) {
    return {
      event,
      data: { text: rawPayload }
    };
  }

  try {
    return {
      event,
      data: JSON.parse(rawPayload)
    };
  } catch {
    return {
      event,
      data: { text: rawPayload }
    };
  }
}

export async function streamChatMessage(
  message: string,
  handlers: StreamHandlers,
  options: StreamOptions = {}
): Promise<void> {
  const payload: ChatRequest = { message };
  const response = await fetch(`${FRONTEND_API_PREFIX}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: options.signal
  });

  if (!response.ok) {
    return parseBackendError(response, "Chat stream endpoint");
  }

  if (!response.body) {
    throw new Error("Chat stream response body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const block of events) {
      const parsed = parseSseBlock(block);
      if (!parsed) {
        continue;
      }

      if (parsed.event === "meta") {
        handlers.onMeta?.(parsed.data as ChatStreamMeta);
      } else if (parsed.event === "chunk") {
        const data = parsed.data as { text?: string };
        if (typeof data.text === "string") {
          handlers.onChunk(data.text);
        }
      } else if (parsed.event === "done") {
        handlers.onDone?.(parsed.data as ChatResponse);
      } else if (parsed.event === "error") {
        const data = parsed.data as { detail?: string };
        throw new Error(data.detail || "Unknown chat stream error");
      }
    }

    if (done) {
      break;
    }
  }
}

export async function getKnowledgeHealth(): Promise<import("@/types").TrustedFeedIngestHealthResponse> {
  const response = await fetch(`${FRONTEND_API_PREFIX}/knowledge/ingest/health`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    return parseBackendError(response, "Knowledge health endpoint");
  }

  return (await response.json()) as import("@/types").TrustedFeedIngestHealthResponse;
}

export async function triggerKnowledgeIngest(payload: { includeNvd: boolean; includeCisaKev: boolean; days: number; limitPerFeed: number; project: string }): Promise<import("@/types").TrustedFeedIngestResponse> {
  const response = await fetch(`${FRONTEND_API_PREFIX}/knowledge/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return parseBackendError(response, "Knowledge ingest endpoint");
  }

  return (await response.json()) as import("@/types").TrustedFeedIngestResponse;
}

export async function evaluateSecurityPolicy(payload: { project: string; failOn: import("@/types").RiskLevel[]; maxHigh: number; maxMedium: number; maxLow: number; findings: import("@/types").FrameworkCheck[] }): Promise<import("@/types").PolicyEvaluateResponse> {
  const response = await fetch(`${FRONTEND_API_PREFIX}/security/policy/evaluate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return parseBackendError(response, "Policy evaluate endpoint");
  }

  return (await response.json()) as import("@/types").PolicyEvaluateResponse;
}

export async function createRemediationTicket(payload: { project: string; owner: string; findings: import("@/types").FrameworkCheck[]; context?: string }): Promise<import("@/types").RemediationTicketResponse> {
  const response = await fetch(`${FRONTEND_API_PREFIX}/security/remediation/ticket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return parseBackendError(response, "Remediation ticket endpoint");
  }

  return (await response.json()) as import("@/types").RemediationTicketResponse;
}
