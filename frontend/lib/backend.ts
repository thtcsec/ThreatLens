import { ChatRequest, ChatResponse, ChatStreamMeta, RiskReport } from "@/types";

const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const API_PREFIX = "/api/v1";

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

  const response = await fetch(`${DEFAULT_BACKEND_URL}${API_PREFIX}/chat`, {
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

export async function getRiskReport(): Promise<RiskReport> {
  const response = await fetch(`${DEFAULT_BACKEND_URL}${API_PREFIX}/risk-report`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    return parseBackendError(response, "Risk report endpoint");
  }

  return (await response.json()) as RiskReport;
}

interface StreamHandlers {
  onMeta?: (meta: ChatStreamMeta) => void;
  onChunk: (text: string) => void;
  onDone?: (payload: ChatResponse) => void;
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

export async function streamChatMessage(message: string, handlers: StreamHandlers): Promise<void> {
  const payload: ChatRequest = { message };
  const response = await fetch(`${DEFAULT_BACKEND_URL}${API_PREFIX}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
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
