"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getChatHistory, sendChatMessage, streamChatMessage } from "@/lib/backend";
import { ChatResponse, ChatStreamMeta } from "@/types";
import { ChatMessage } from "@/types";
import { ChatSecurityMetadata } from "@/types";
import { ChatHistoryItem } from "@/types";

const QUICK_PROMPTS = [
  "Review this login API for OWASP risks",
  "How to mitigate SQL Injection in FastAPI?",
  "Suggest secure headers for web app"
];

type StreamState = "idle" | "connecting" | "streaming" | "completed" | "error";

function formatChatFailure(error: unknown): string {
  const detail = error instanceof Error ? error.message : "Unknown error";
  const lower = detail.toLowerCase();

  if (lower.includes("api key not valid") || lower.includes("missing gemini_api_key")) {
    return [
      "[!] Issue: Gemini API key is invalid or missing.",
      `[?] Details: ${detail}`,
      "[*] Fix: Update GEMINI_API_KEY in .env, restart backend, and try again."
    ].join("\n");
  }

  if (lower.includes("quota exceeded") || lower.includes("rate limit") || lower.includes("429")) {
    return [
      "[!] Issue: Gemini API quota/rate limit exceeded.",
      `[?] Details: ${detail}`,
      "[*] Fix: Check quota in Google AI Studio, enable billing if needed, or switch to another key/project with available quota."
    ].join("\n");
  }

  return [
    "[!] Issue: Chatbot service is unavailable.",
    `[?] Details: ${detail}`,
    "[*] Fix: Check backend /health, /api/chat, and backend logs to identify the root cause."
  ].join("\n");
}

function getStreamStatusLabel(state: StreamState): string {
  if (state === "connecting") {
    return "Connecting";
  }
  if (state === "streaming") {
    return "Streaming";
  }
  if (state === "completed") {
    return "Completed";
  }
  if (state === "error") {
    return "Error";
  }
  return "Idle";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toSecurityMetadata(meta: {
  riskLevel: ChatSecurityMetadata["riskLevel"];
  tags: string[];
  recommendations: string[];
}): ChatSecurityMetadata {
  return {
    riskLevel: meta.riskLevel,
    tags: meta.tags,
    recommendations: meta.recommendations
  };
}

function createMessage(
  role: ChatMessage["role"],
  content: string,
  securityMetadata?: ChatSecurityMetadata
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    securityMetadata
  };
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      "assistant",
      "Hello, I am ThreatLens. Send a code snippet, endpoint, or URL for a security risk assessment."
    )
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>("idle");
  const [streamStatusDetail, setStreamStatusDetail] = useState("");
  const [showSecurityMetadata, setShowSecurityMetadata] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
  const [historyItems, setHistoryItems] = useState<ChatHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize] = useState(5);
  const [historyQueryInput, setHistoryQueryInput] = useState("");
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [historySort, setHistorySort] = useState<"newest" | "oldest">("newest");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;
    void getChatHistory({ page: 1, pageSize: 1 })
      .then((payload) => {
        if (mounted) {
          setHistoryTotal(payload.total);
        }
      })
      .catch(() => {
        if (mounted) {
          setHistoryTotal(0);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "history") {
      return;
    }

    let mounted = true;
    setHistoryLoading(true);
    setHistoryError(null);

    void getChatHistory({
      page: historyPage,
      pageSize: historyPageSize,
      keyword: historyKeyword,
      sort: historySort,
    })
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setHistoryItems(payload.items);
        setHistoryTotal(payload.total);
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }
        setHistoryItems([]);
        setHistoryTotal(0);
        setHistoryError(error instanceof Error ? error.message : "Cannot load chat history");
      })
      .finally(() => {
        if (mounted) {
          setHistoryLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [activeTab, historyKeyword, historyPage, historyPageSize, historySort]);

  const historyTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(historyTotal / historyPageSize));
  }, [historyTotal, historyPageSize]);

  const canSend = useMemo(() => input.trim().length > 0 && !pending, [input, pending]);
  const canStopStream = pending && (streamState === "connecting" || streamState === "streaming");

  function stopStream() {
    if (!abortControllerRef.current) {
      return;
    }

    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    setStreamState("completed");
    setStreamStatusDetail("Stopped by user.");
  }

  async function sendMessage(raw?: string) {
    const content = (raw ?? input).trim();
    if (!content || pending) {
      return;
    }

    const userMessage = createMessage("user", content);
    const assistantMessage = createMessage("assistant", "");
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setPending(true);
    setStreamState("connecting");
    setStreamStatusDetail("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setMessages((prev) => [...prev, assistantMessage]);

      let chunkReceived = false;
      let streamMeta: ChatStreamMeta | null = null;

      await streamChatMessage(content, {
        onMeta(meta) {
          streamMeta = meta;
        },
        onChunk(text) {
          chunkReceived = true;
          setStreamState("streaming");
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessage.id ? { ...item, content: `${item.content}${text}` } : item
            )
          );
        },
        onDone(payload) {
          setStreamState("completed");
          setStreamStatusDetail("Live stream completed.");
          const finalPayload = payload as ChatResponse;
          setMessages((prev) =>
            prev.map((item) => {
              if (item.id !== assistantMessage.id) {
                return item;
              }

              const baseContent = chunkReceived ? item.content : finalPayload.reply;
              const finalMeta = streamMeta || {
                riskLevel: finalPayload.riskLevel,
                tags: finalPayload.tags,
                recommendations: finalPayload.recommendations
              };

              return {
                ...item,
                content: baseContent,
                securityMetadata: toSecurityMetadata(finalMeta)
              };
            })
          );
        }
      }, {
        signal: controller.signal
      });
    } catch (streamError) {
      if (isAbortError(streamError)) {
        return;
      }

      setStreamState("error");
      setStreamStatusDetail("Streaming failed. Trying fallback response.");

      try {
        const payload = await sendChatMessage(content);

        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessage.id
              ? {
                  ...item,
                  content: payload.reply,
                  securityMetadata: toSecurityMetadata(payload)
                }
              : item
          )
        );
        setStreamState("completed");
        setStreamStatusDetail("Completed via fallback response.");
      } catch (fallbackError) {
        const rootError = fallbackError instanceof Error ? fallbackError : streamError;
        setMessages((prev) => prev.filter((item) => item.id !== assistantMessage.id));
        setMessages((prev) => [
          ...prev,
          createMessage(
            "assistant",
            formatChatFailure(rootError)
          )
        ]);
        setStreamState("error");
        setStreamStatusDetail("Chat request failed.");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setPending(false);
    }
  }

  return (
    <aside className="chat-panel card">
      <h2 className="section-title">Security Chatbot</h2>
      <div className="chat-tabs" role="tablist" aria-label="chat tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "chat"}
          className={activeTab === "chat" ? "active" : ""}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          className={activeTab === "history" ? "active" : ""}
          onClick={() => setActiveTab("history")}
        >
          Chat History <span className="history-badge">{historyTotal}</span>
        </button>
      </div>

      {activeTab === "chat" ? (
        <section className="history-panel chat-content-panel">
          <div className="stream-status-row">
            <p className={`stream-status ${streamState}`}>Status: {getStreamStatusLabel(streamState)}</p>
            <div className="stream-controls">
              <label className="metadata-toggle">
                <input
                  type="checkbox"
                  checked={showSecurityMetadata}
                  onChange={(event) => setShowSecurityMetadata(event.target.checked)}
                />
                <span>Show security metadata</span>
              </label>
              {canStopStream ? (
                <button type="button" className="stop-stream-btn" onClick={stopStream}>
                  Stop stream
                </button>
              ) : null}
            </div>
          </div>
          {streamStatusDetail ? <p className="stream-status-detail">{streamStatusDetail}</p> : null}

          <div className="messages" role="log" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                {message.content || (message.role === "assistant" && pending ? "Analyzing threat context..." : "")}
                {message.role === "assistant" && showSecurityMetadata && message.securityMetadata ? (
                  <div className="message-meta">
                    <p>Risk Level: {message.securityMetadata.riskLevel.toUpperCase()}</p>
                    <p>Tags: {message.securityMetadata.tags.join(", ")}</p>
                    <p>Recommendations: {message.securityMetadata.recommendations.join(" | ")}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="quick-prompts">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => void sendMessage(prompt)} disabled={pending}>
                {prompt}
              </button>
            ))}
          </div>

          <form
            className="chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Enter your security question..."
              aria-label="chat input"
            />
            <button type="submit" disabled={!canSend}>
              Send
            </button>
          </form>
        </section>
      ) : (
        <section className="history-panel" aria-live="polite">
          <div className="history-controls">
            <input
              value={historyQueryInput}
              onChange={(event) => setHistoryQueryInput(event.target.value)}
              placeholder="Search keyword in question/answer"
              aria-label="history keyword"
            />
            <button
              type="button"
              onClick={() => {
                setHistoryPage(1);
                setHistoryKeyword(historyQueryInput.trim());
              }}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setHistoryQueryInput("");
                setHistoryPage(1);
                setHistoryKeyword("");
              }}
            >
              Reset
            </button>
            <select
              value={historySort}
              onChange={(event) => {
                setHistoryPage(1);
                setHistorySort(event.target.value as "newest" | "oldest");
              }}
              aria-label="history sort"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          {historyLoading ? <p>Loading chat history...</p> : null}
          {!historyLoading && historyError ? <p>{historyError}</p> : null}
          {!historyLoading && !historyError && historyItems.length === 0 ? (
            <p>No chat history saved yet.</p>
          ) : null}
          {!historyLoading && !historyError && historyItems.length > 0 ? (
            <div className="history-list">
              {historyItems.map((item) => (
                <article key={item.id} className="history-item">
                  <p className="history-meta">
                    {new Date(item.createdAt).toLocaleString()} | source={item.source} | risk={item.riskLevel} | retrieved={item.retrievedCount}
                  </p>
                  <p><strong>Q:</strong> {item.question}</p>
                  <p><strong>A:</strong> {item.answer}</p>
                </article>
              ))}
            </div>
          ) : null}

          {!historyLoading && !historyError ? (
            <div className="history-pagination">
              <button
                type="button"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
              >
                Prev
              </button>
              <span>
                Page {historyPage} / {historyTotalPages} ({historyTotal} items)
              </span>
              <button
                type="button"
                disabled={historyPage >= historyTotalPages}
                onClick={() => setHistoryPage((prev) => Math.min(historyTotalPages, prev + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      )}
    </aside>
  );
}
