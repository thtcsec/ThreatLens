import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
import uvicorn
from dotenv import load_dotenv

from core.chat_history_store import ChatHistoryStore, ChatHistoryStoreError
from core.gemini_service import GeminiConfigError, GeminiGenerationError, GeminiSecurityService
from core.risk_store import RiskStoreQueryError, build_risk_report, record_from_metadata
from core.vector_store import RetrievedContext, VectorKnowledgeStore, VectorStoreConfigError, VectorStoreQueryError

load_dotenv(override=True)

app = FastAPI(title="ThreatLens API", version="0.1.0")


RiskLevel = Literal["critical", "high", "medium", "low"]


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    id: str
    reply: str
    riskLevel: RiskLevel
    tags: List[str]
    recommendations: List[str]
    createdAt: str


class ChatHistoryItem(BaseModel):
    id: int
    createdAt: str
    question: str
    answer: str
    riskLevel: RiskLevel
    source: str
    retrievedCount: int


class ChatHistoryResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    keyword: str
    sort: str
    count: int
    items: List[ChatHistoryItem]


class RiskCategory(BaseModel):
    category: str
    score: int
    findings: int
    level: RiskLevel


class RiskTrendPoint(BaseModel):
    day: str
    critical: int
    high: int
    medium: int
    low: int


class RiskDistribution(BaseModel):
    name: str
    value: int


class RiskReportResponse(BaseModel):
    generatedAt: str
    totalFindings: int
    projectsScanned: int
    riskIndex: int
    selectedProject: Optional[str] = None
    availableProjects: List[str] = []
    recentlyIngestedData: bool = False
    freshnessNote: Optional[str] = None
    categories: List[RiskCategory]
    trend: List[RiskTrendPoint]
    distribution: List[RiskDistribution]


class KnowledgeEvent(BaseModel):
    id: Optional[str] = None
    content: str = Field(..., min_length=1)
    category: str = "Uncategorized"
    severity: str = "low"
    project: str = "unknown"
    source: str = "manual"
    timestamp: str = Field(..., min_length=1)

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, value: str) -> str:
        normalized = str(value).strip().replace("Z", "+00:00")
        try:
            datetime.fromisoformat(normalized)
        except ValueError as exc:
            raise ValueError("timestamp must be ISO-8601 format, e.g. 2026-03-27T15:30:00Z") from exc
        return value


class KnowledgeUpsertRequest(BaseModel):
    events: List[KnowledgeEvent]


class KnowledgeUpsertResponse(BaseModel):
    upsertedCount: int


class KnowledgeRetrieveRequest(BaseModel):
    query: str = Field(..., min_length=1)
    topK: int = Field(default=5, ge=1, le=50)
    project: Optional[str] = None


class RetrievedContextResponse(BaseModel):
    id: str
    score: float
    content: str
    metadata: Dict[str, Any]


class KnowledgeRetrieveResponse(BaseModel):
    query: str
    count: int
    contexts: List[RetrievedContextResponse]

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Welcome to ThreatLens AI Security Copilot API",
        "apiVersion": "v1",
        "endpoints": [
            "GET /health",
            "POST /api/v1/knowledge/upsert",
            "POST /api/v1/knowledge/retrieve",
            "GET /api/v1/chat/history",
            "GET /api/v1/risk-report",
            "POST /api/v1/chat",
            "POST /api/v1/chat/stream",
        ],
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


def infer_risk_level(message: str) -> RiskLevel:
    text = message.lower()

    if any(token in text for token in ["sql", "injection", "xss", "rce", "credential leak"]):
        return "critical"
    if any(token in text for token in ["auth", "csrf", "access", "token", "secret"]):
        return "high"
    if any(token in text for token in ["header", "cookie", "log", "rate limit"]):
        return "medium"
    return "low"


def _context_to_lines(contexts: List[RetrievedContext], limit: int = 5) -> List[str]:
    lines: List[str] = []

    for item in contexts[:limit]:
        metadata = item.metadata
        category = str(metadata.get("category") or metadata.get("owasp_category") or "Uncategorized")
        severity = str(metadata.get("severity") or metadata.get("risk_level") or "low")
        project = str(metadata.get("project") or metadata.get("repo") or "unknown")
        summary = item.content.strip()[:420]
        lines.append(
            f"Category={category}; Severity={severity}; Project={project}; Score={item.score:.4f}; Content={summary}"
        )

    return lines


def _infer_risk_from_contexts(message: str, contexts: List[RetrievedContext]) -> RiskLevel:
    severity_order: Dict[str, RiskLevel] = {
        "critical": "critical",
        "high": "high",
        "medium": "medium",
        "low": "low",
    }

    for level in ["critical", "high", "medium", "low"]:
        for item in contexts:
            meta_level = str(item.metadata.get("severity") or item.metadata.get("risk_level") or "").lower()
            if meta_level == level:
                return severity_order[level]

    return infer_risk_level(message)


def _build_tags(contexts: List[RetrievedContext]) -> List[str]:
    tags = {"owasp", "secure-coding"}
    for item in contexts:
        category = str(item.metadata.get("category") or item.metadata.get("owasp_category") or "").strip()
        if category:
            tags.add(category.lower().replace(" ", "-"))

    return sorted(tags)[:6]


def _build_recommendations() -> List[str]:
    return [
        "Validate and sanitize all untrusted input",
        "Apply parameterized queries / ORM safeguards",
        "Add SAST/DAST checks in CI pipeline",
    ]


def _build_empty_risk_report() -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    return {
        "generatedAt": now.isoformat(),
        "totalFindings": 0,
        "projectsScanned": 0,
        "riskIndex": 0,
        "selectedProject": None,
        "availableProjects": [],
        "recentlyIngestedData": False,
        "freshnessNote": None,
        "categories": [],
        "trend": [
            {
                "day": day,
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
            }
            for day in day_labels
        ],
        "distribution": [
            {"name": "Critical", "value": 0},
            {"name": "High", "value": 0},
            {"name": "Medium", "value": 0},
            {"name": "Low", "value": 0},
        ],
    }


def _is_quota_error(detail: str) -> bool:
    text = detail.lower()
    return any(token in text for token in ["429", "quota exceeded", "rate limit", "resource_exhausted"])


def _build_fallback_reply(message: str, contexts: List[RetrievedContext], detail: str) -> str:
    categories: List[str] = []
    for item in contexts:
        category = str(item.metadata.get("category") or item.metadata.get("owasp_category") or "").strip()
        if category and category not in categories:
            categories.append(category)
        if len(categories) >= 3:
            break

    category_line = ", ".join(categories) if categories else "General secure coding"
    return "\n".join(
        [
            "Security quick assessment:",
            f"Input summary: {message[:180]}",
            f"Focus areas: {category_line}",
            "Immediate actions:",
            "1) Validate and sanitize all untrusted input.",
            "2) Use parameterized queries for all database operations.",
            "3) Add authentication, authorization, and rate limiting checks.",
            "4) Add automated security testing (SAST/DAST) in CI.",
            "Apply these controls first, then run a deeper review with your security pipeline.",
        ]
    )


def _sse(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/v1/knowledge/upsert", response_model=KnowledgeUpsertResponse)
async def knowledge_upsert(payload: KnowledgeUpsertRequest):
    try:
        store = VectorKnowledgeStore()
        result = store.upsert_risk_events([event.model_dump() for event in payload.events])
        return KnowledgeUpsertResponse(**result)
    except (VectorStoreConfigError, GeminiConfigError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except VectorStoreQueryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/v1/knowledge/retrieve", response_model=KnowledgeRetrieveResponse)
async def knowledge_retrieve(payload: KnowledgeRetrieveRequest):
    try:
        store = VectorKnowledgeStore()
        contexts = store.retrieve_context(payload.query, top_k=payload.topK, project=payload.project)
        return KnowledgeRetrieveResponse(
            query=payload.query,
            count=len(contexts),
            contexts=[
                RetrievedContextResponse(
                    id=item.id,
                    score=item.score,
                    content=item.content,
                    metadata=item.metadata,
                )
                for item in contexts
            ],
        )
    except VectorStoreConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except VectorStoreQueryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    contexts: List[RetrievedContext] = []
    reply_source = "gemini"

    try:
        store = VectorKnowledgeStore()
        contexts = store.retrieve_context(payload.message, top_k=5)
    except (VectorStoreConfigError, VectorStoreQueryError):
        # Keep chat service available even when retrieval is temporarily unavailable.
        contexts = []

    risk_level = _infer_risk_from_contexts(payload.message, contexts)
    tags = _build_tags(contexts)
    recommendations = _build_recommendations()

    try:
        gemini = GeminiSecurityService()
        reply = gemini.generate_analysis(payload.message, _context_to_lines(contexts))
    except GeminiConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except GeminiGenerationError as exc:
        detail = str(exc)
        if _is_quota_error(detail):
            reply_source = "fallback"
            reply = _build_fallback_reply(payload.message, contexts, detail)
        else:
            raise HTTPException(status_code=502, detail=detail) from exc

    created_at = datetime.now(tz=timezone.utc).isoformat()
    try:
        history_store = ChatHistoryStore()
        history_store.save_interaction(
            question=payload.message,
            answer=reply,
            risk_level=risk_level,
            source=reply_source,
            retrieved_count=len(contexts),
            created_at=created_at,
        )
    except ChatHistoryStoreError:
        # Keep chat endpoint available even if history persistence fails.
        pass

    return ChatResponse(
        id=f"chat-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
        reply=reply,
        riskLevel=risk_level,
        tags=tags,
        recommendations=recommendations,
        createdAt=created_at,
    )


@app.post("/api/v1/chat/stream")
async def chat_stream(payload: ChatRequest):
    try:
        store = VectorKnowledgeStore()
        contexts = store.retrieve_context(payload.message, top_k=5)
    except (VectorStoreConfigError, VectorStoreQueryError):
        contexts = []

    try:
        gemini = GeminiSecurityService()
    except GeminiConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    created_at = datetime.now(tz=timezone.utc).isoformat()
    risk_level = _infer_risk_from_contexts(payload.message, contexts)
    tags = _build_tags(contexts)
    recommendations = _build_recommendations()

    async def event_generator():
        yield _sse(
            "meta",
            {
                "createdAt": created_at,
                "riskLevel": risk_level,
                "tags": tags,
                "recommendations": recommendations,
                "retrievedCount": len(contexts),
            },
        )

        try:
            full_text: List[str] = []
            source = "gemini"
            for text in gemini.stream_analysis(payload.message, _context_to_lines(contexts)):
                full_text.append(text)
                yield _sse("chunk", {"text": text})

            full_reply = "".join(full_text)
            try:
                history_store = ChatHistoryStore()
                history_store.save_interaction(
                    question=payload.message,
                    answer=full_reply,
                    risk_level=risk_level,
                    source=source,
                    retrieved_count=len(contexts),
                    created_at=created_at,
                )
            except ChatHistoryStoreError:
                pass

            yield _sse(
                "done",
                {
                    "id": f"chat-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
                    "createdAt": created_at,
                    "riskLevel": risk_level,
                    "tags": tags,
                    "recommendations": recommendations,
                    "reply": full_reply,
                },
            )
        except GeminiGenerationError as exc:
            detail = str(exc)
            if _is_quota_error(detail):
                fallback_reply = _build_fallback_reply(payload.message, contexts, detail)
                try:
                    history_store = ChatHistoryStore()
                    history_store.save_interaction(
                        question=payload.message,
                        answer=fallback_reply,
                        risk_level=risk_level,
                        source="fallback",
                        retrieved_count=len(contexts),
                        created_at=created_at,
                    )
                except ChatHistoryStoreError:
                    pass
                yield _sse("chunk", {"text": fallback_reply})
                yield _sse(
                    "done",
                    {
                        "id": f"chat-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}",
                        "createdAt": created_at,
                        "riskLevel": risk_level,
                        "tags": tags,
                        "recommendations": recommendations,
                        "reply": fallback_reply,
                    },
                )
            else:
                yield _sse("error", {"detail": detail})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/v1/chat/history", response_model=ChatHistoryResponse)
async def chat_history(page: int = 1, pageSize: int = 10, q: str = "", sort: str = "newest"):
    try:
        history_store = ChatHistoryStore()
        result = history_store.query_history(page=page, page_size=pageSize, keyword=q, sort=sort)
        items = [ChatHistoryItem(**item) for item in result["items"]]
        return ChatHistoryResponse(
            total=int(result["total"]),
            page=int(result["page"]),
            pageSize=int(result["pageSize"]),
            keyword=str(result["keyword"]),
            sort=str(result["sort"]),
            count=len(items),
            items=items,
        )
    except ChatHistoryStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/v1/risk-report", response_model=RiskReportResponse)
async def risk_report(project: Optional[str] = None):
    try:
        store = VectorKnowledgeStore()
        contexts = store.retrieve_context(
            query=os.getenv("RISK_REPORT_QUERY", "recent OWASP vulnerabilities and security incidents"),
            top_k=int(os.getenv("RISK_REPORT_TOP_K", "200")),
            project=project,
        )
        records = [record_from_metadata(item.metadata) for item in contexts]
        return RiskReportResponse(**build_risk_report(records, selected_project=project))
    except VectorStoreConfigError:
        # Keep dashboard usable even when vector infra is not configured.
        return RiskReportResponse(**_build_empty_risk_report())
    except (VectorStoreQueryError, RiskStoreQueryError) as exc:
        if "returned no risk records" in str(exc).lower():
            return RiskReportResponse(**_build_empty_risk_report())
        raise HTTPException(status_code=502, detail=str(exc)) from exc

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
