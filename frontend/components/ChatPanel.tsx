"use client";

import { useEffect, useMemo, useState } from "react";
import { getChatHistory, sendChatMessage, streamChatMessage } from "@/lib/backend";
import {
  ChatCitation,
  ChatHistoryItem,
  ChatMessage,
  ChatResponse,
  ChatSecurityMetadata,
  ChatStreamMeta,
  FrameworkCheck,
} from "@/types";

const QUICK_PROMPTS = [
  "Review this login API for OWASP risks",
  "How to mitigate SQL Injection in FastAPI?",
  "Suggest secure headers for web app"
];

function formatChatFailure(error: unknown): string {
  const detail = error instanceof Error ? error.message : "Unknown error";
  const lower = detail.toLowerCase();

  if (lower.includes("api key not valid") || lower.includes("missing gemini_api_key")) {
    return [
      "[!] Problem: Gemini API key is invalid or missing.",
      `[?] Detail: ${detail}`,
      "[*] Fix: Set a valid GEMINI_API_KEY in .env, restart backend, then retry."
    ].join("\n");
  }

  if (lower.includes("quota exceeded") || lower.includes("rate limit") || lower.includes("429")) {
    return [
      "[!] Problem: Gemini API quota or rate limit exceeded.",
      `[?] Detail: ${detail}`,
      "[*] Fix: Check quota/billing in Google AI Studio or switch to another key/project with available quota."
    ].join("\n");
  }

  return [
    "[!] Problem: Chatbot service error.",
    `[?] Detail: ${detail}`,
    "[*] Fix: Verify backend /health, backend URL env vars, and backend logs."
  ].join("\n");
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function formatFrameworkChecks(checks: FrameworkCheck[]): string {
  if (!checks?.length) return "No security framework checks found.";

  return checks
    .map((c) => {
      const evidence = c.evidence ? `Evidence: ${c.evidence}` : "";
      const owasp = c.owasp ? `OWASP: ${c.owasp}${c.cwe ? ` (${c.cwe})` : ""}` : "";
      const head = `[${c.severity.toUpperCase()}] ${c.title}${owasp ? ` - ${owasp}` : ""}`;
      return [head, evidence, `Fix: ${c.recommendation}`].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function formatCitations(citations: ChatCitation[]): string {
  if (!citations?.length) {
    return "No citations found in retrieval context.";
  }

  return citations
    .map((item, idx) => {
      const cve = item.cveId ? ` CVE=${item.cveId}` : "";
      const cwe = item.cweIds?.length ? ` CWE=${item.cweIds.join(",")}` : "";
      const ref = item.reference ? ` Ref=${item.reference}` : "";
      return `${idx + 1}. ${item.source} score=${item.score.toFixed(2)} project=${item.project}${cve}${cwe}${ref}`;
    })
    .join("\n");
}

function buildSecurityMetadata(payload: ChatResponse, streamMeta?: ChatStreamMeta | null): ChatSecurityMetadata {
  return {
    riskLevel: streamMeta?.riskLevel || payload.riskLevel,
    tags: streamMeta?.tags?.length ? streamMeta.tags : payload.tags,
    recommendations: streamMeta?.recommendations?.length ? streamMeta.recommendations : payload.recommendations,
    frameworkChecks: streamMeta?.frameworkChecks?.length ? streamMeta.frameworkChecks : payload.frameworkChecks,
    citations: payload.citations || streamMeta?.citations || [],
    confidenceScore: payload.confidenceScore,
    needsHumanReview: payload.needsHumanReview,
    verificationNotes: payload.verificationNotes || []
  };
}

export default function ChatPanel() {
  const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      "assistant",
      "Hello, I am ThreatLens. Send a code snippet, endpoint, or URL and I will assess security risks."
    )
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [historyItems, setHistoryItems] = useState<ChatHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize] = useState(10);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyKeywordDraft, setHistoryKeywordDraft] = useState("");
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [historySort, setHistorySort] = useState<"newest" | "oldest">("newest");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const canSend = useMemo(() => input.trim().length > 0 && !pending, [input, pending]);
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / historyPageSize));

  useEffect(() => {
    if (activeTab !== "history") {
      return;
    }

    const handler = window.setTimeout(() => {
      const nextKeyword = historyKeywordDraft.trim();
      setHistoryKeyword((prev) => (prev === nextKeyword ? prev : nextKeyword));
      setHistoryPage(1);
    }, 400);

    return () => {
      window.clearTimeout(handler);
    };
  }, [activeTab, historyKeywordDraft]);

  useEffect(() => {
    if (activeTab !== "history") {
      return;
    }

    let mounted = true;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const payload = await getChatHistory({
          page: historyPage,
          pageSize: historyPageSize,
          keyword: historyKeyword,
          sort: historySort
        });

        if (!mounted) {
          return;
        }

        setHistoryItems(payload.items);
        setHistoryTotal(payload.total);
      } catch (error) {
        if (!mounted) {
          return;
        }
        const detail = error instanceof Error ? error.message : "Cannot load chat history";
        setHistoryError(detail);
      } finally {
        if (mounted) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      mounted = false;
    };
  }, [activeTab, historyPage, historyPageSize, historyKeyword, historySort, historyRefreshKey]);

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
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessage.id ? { ...item, content: `${item.content}${text}` } : item
            )
          );
        },
        onDone(payload) {
          const finalPayload = payload as ChatResponse;
          const securityMetadata = buildSecurityMetadata(finalPayload, streamMeta);

          setMessages((prev) =>
            prev.map((item) => {
              if (item.id !== assistantMessage.id) {
                return item;
              }

              const baseContent = chunkReceived ? item.content : finalPayload.reply;
              return {
                ...item,
                content: baseContent,
                securityMetadata
              };
            })
          );
        }
      });
    } catch (streamError) {
      try {
        const payload = await sendChatMessage(content);
        const securityMetadata = buildSecurityMetadata(payload, null);

        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessage.id
              ? {
                  ...item,
                  content: payload.reply,
                  securityMetadata
                }
              : item
          )
        );
      } catch (fallbackError) {
        const rootError = fallbackError instanceof Error ? fallbackError : streamError;
        setMessages((prev) => prev.filter((item) => item.id !== assistantMessage.id));
        setMessages((prev) => [...prev, createMessage("assistant", formatChatFailure(rootError))]);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="chat-panel card">
      <h2 className="section-title">Security Chatbot</h2>

      <div className="chat-tabs">
        <button
          type="button"
          className={activeTab === "chat" ? "active" : ""}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          className={activeTab === "history" ? "active" : ""}
          onClick={() => setActiveTab("history")}
        >
          History
          <span className="history-badge">{historyTotal}</span>
        </button>
      </div>

      {activeTab === "history" ? (
        <section className="history-panel">
          <div className="history-controls">
            <input
              value={historyKeywordDraft}
              onChange={(event) => setHistoryKeywordDraft(event.target.value)}
              placeholder="Search question or answer"
              aria-label="search history"
            />
            <select
              value={historySort}
              onChange={(event) => {
                const next = event.target.value === "oldest" ? "oldest" : "newest";
                setHistorySort(next);
                setHistoryPage(1);
              }}
              aria-label="sort history"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
            <button
              type="button"
              onClick={() => setHistoryRefreshKey((prev) => prev + 1)}
              disabled={historyLoading}
            >
              Refresh
            </button>
          </div>

          {historyError ? <p className="stream-status error">{historyError}</p> : null}
          {historyLoading ? <p className="stream-status">Loading history...</p> : null}

          {!historyLoading && !historyItems.length ? (
            <p className="stream-status">No chat history found.</p>
          ) : (
            <div className="history-list">
              {historyItems.map((item) => (
                <article key={item.id} className="history-item">
                  <p className="history-meta">
                    {new Date(item.createdAt).toLocaleString()} | Risk {item.riskLevel.toUpperCase()} | Source {item.source} |
                    Retrieved {item.retrievedCount}
                  </p>
                  <p>
                    <strong>Q:</strong> {item.question}
                  </p>
                  <p>
                    <strong>A:</strong> {item.answer}
                  </p>
                </article>
              ))}
            </div>
          )}

          <div className="history-pagination">
            <button
              type="button"
              disabled={historyPage <= 1 || historyLoading}
              onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span>
              Page {historyPage} / {historyTotalPages}
            </span>
            <button
              type="button"
              disabled={historyPage >= historyTotalPages || historyLoading}
              onClick={() => setHistoryPage((prev) => Math.min(historyTotalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </section>
      ) : (
        <div className="chat-content-panel">
          <div className="messages" role="log" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                {message.content || (message.role === "assistant" && pending ? "Analyzing threat context..." : "")}
                {message.role === "assistant" && message.securityMetadata ? (
                  <div className="message-meta">
                    <p>Risk Level: {message.securityMetadata.riskLevel.toUpperCase()}</p>
                    <p>Tags: {message.securityMetadata.tags.join(", ") || "N/A"}</p>
                    <p>Confidence Score: {message.securityMetadata.confidenceScore.toFixed(2)}</p>
                    <p>Needs Human Review: {message.securityMetadata.needsHumanReview ? "Yes" : "No"}</p>
                    <p>Recommendations: {message.securityMetadata.recommendations.join(" | ") || "N/A"}</p>
                    <p>Verification Notes: {message.securityMetadata.verificationNotes.join(" | ") || "N/A"}</p>
                    <p>Framework Checks:</p>
                    <p>{formatFrameworkChecks(message.securityMetadata.frameworkChecks)}</p>
                    <p>Citations:</p>
                    <p>{formatCitations(message.securityMetadata.citations)}</p>
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
        </div>
      )}
    </aside>
  );
}
