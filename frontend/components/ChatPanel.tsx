"use client";

import { useMemo, useState } from "react";
import { sendChatMessage, streamChatMessage } from "@/lib/backend";
import { ChatResponse, ChatStreamMeta } from "@/types";
import { ChatMessage } from "@/types";

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
      "[!] Van de: Gemini API key chua hop le hoac dang thieu.",
      `[?] Chi tiet: ${detail}`,
      "[*] Khac phuc: Cap nhat GEMINI_API_KEY hop le trong file .env, khoi dong lai backend, roi thu lai."
    ].join("\n");
  }

  if (lower.includes("quota exceeded") || lower.includes("rate limit") || lower.includes("429")) {
    return [
      "[!] Van de: Da vuot han muc su dung Gemini API (quota/rate limit).",
      `[?] Chi tiet: ${detail}`,
      "[*] Khac phuc: Kiem tra quota trong Google AI Studio, bat billing cho project neu can, hoac doi sang project/API key con han muc."
    ].join("\n");
  }

  return [
    "[!] Van de: Chatbot service dang loi.",
    `[?] Chi tiet: ${detail}`,
    "[*] Khac phuc: Kiem tra backend /health, bien NEXT_PUBLIC_BACKEND_URL, va log backend de xac dinh nguyen nhan."
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

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      "assistant",
      "Xin chao, toi la ThreatLens. Hay gui code snippet, endpoint, hoac URL de minh danh gia rui ro bao mat."
    )
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0 && !pending, [input, pending]);

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

              const metadataBlock = [
                "",
                `Risk Level: ${finalMeta.riskLevel.toUpperCase()}`,
                `Tags: ${finalMeta.tags.join(", ")}`,
                `Recommendations: ${finalMeta.recommendations.join(" | ")}`
              ].join("\n");

              return {
                ...item,
                content: `${baseContent}${metadataBlock}`
              };
            })
          );
        }
      });
    } catch (streamError) {
      try {
        const payload = await sendChatMessage(content);
        const enrichedReply = [
          payload.reply,
          "",
          `Risk Level: ${payload.riskLevel.toUpperCase()}`,
          `Tags: ${payload.tags.join(", ")}`,
          `Recommendations: ${payload.recommendations.join(" | ")}`
        ].join("\n");

        setMessages((prev) =>
          prev.map((item) => (item.id === assistantMessage.id ? { ...item, content: enrichedReply } : item))
        );
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
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="chat-panel card">
      <h2 className="section-title">Security Chatbot</h2>

      <div className="messages" role="log" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            {message.content || (message.role === "assistant" && pending ? "Analyzing threat context..." : "")}
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
          placeholder="Nhap cau hoi bao mat..."
          aria-label="chat input"
        />
        <button type="submit" disabled={!canSend}>
          Send
        </button>
      </form>
    </aside>
  );
}
