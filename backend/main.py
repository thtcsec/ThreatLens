import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator
import uvicorn
from dotenv import load_dotenv

from core.chat_history_store import ChatHistoryStore, ChatHistoryStoreError
from core.gemini_service import GeminiConfigError, GeminiGenerationError, GeminiSecurityService
from core.risk_store import RiskStoreQueryError, build_risk_report, record_from_metadata
from core.threat_feeds import ingest_trusted_feeds, read_last_ingest_status
from core.vector_store import RetrievedContext, VectorKnowledgeStore, VectorStoreConfigError, VectorStoreQueryError

load_dotenv(
    # Load env from repo root so it works both when running from `backend/`
    # and when using `docker-compose` with `env_file: - .env`.
    dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env")
)

app = FastAPI(title="ThreatLens API", version="0.1.0")


RiskLevel = Literal["critical", "high", "medium", "low"]


TRUSTED_SOURCE_IDS = {
    "nvd",
    "mitre",
    "cwe",
    "owasp",
    "cisa-kev",
    "exploit-db",
    "manual",
}

TRUSTED_REFERENCE_DOMAINS = (
    "nvd.nist.gov",
    "cve.mitre.org",
    "www.cve.org",
    "cwe.mitre.org",
    "owasp.org",
    "www.cisa.gov",
    "www.exploit-db.com",
)


def _is_trusted_reference(value: str) -> bool:
    text = str(value or "").strip().lower()
    if not text.startswith(("http://", "https://")):
        return False
    return any(domain in text for domain in TRUSTED_REFERENCE_DOMAINS)


class FrameworkCheck(BaseModel):
    id: str
    severity: RiskLevel
    owasp: Optional[str] = None
    cwe: Optional[str] = None
    title: str
    evidence: str
    recommendation: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    id: str
    reply: str
    riskLevel: RiskLevel
    tags: List[str]
    recommendations: List[str]
    frameworkChecks: List[FrameworkCheck] = []
    citations: List[Dict[str, Any]] = []
    confidenceScore: float = 0.0
    needsHumanReview: bool = True
    verificationNotes: List[str] = []
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
    sort: Literal["newest", "oldest"]
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
    timestamp: Optional[str] = None
    cveId: Optional[str] = Field(default=None, pattern=r"^CVE-\d{4}-\d{4,}$")
    cweIds: List[str] = []
    references: List[str] = []
    vendor: Optional[str] = None
    publishedAt: Optional[str] = None

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized in TRUSTED_SOURCE_IDS or _is_trusted_reference(normalized):
            return normalized
        raise ValueError(
            "source must be one of trusted ids "
            "(nvd, mitre, cwe, owasp, cisa-kev, exploit-db, manual) or a trusted reference URL"
        )

    @field_validator("cweIds")
    @classmethod
    def validate_cwe_ids(cls, values: List[str]) -> List[str]:
        normalized: List[str] = []
        for raw in values:
            text = str(raw or "").strip().upper()
            if not text:
                continue
            if not re.fullmatch(r"CWE-\d+", text):
                raise ValueError(f"Invalid CWE id: {raw}. Expected format CWE-79")
            normalized.append(text)
        return normalized

    @field_validator("references")
    @classmethod
    def validate_references(cls, values: List[str]) -> List[str]:
        refs: List[str] = []
        for raw in values:
            ref = str(raw or "").strip()
            if not ref:
                continue
            if not _is_trusted_reference(ref):
                raise ValueError(
                    f"Untrusted reference '{ref}'. Use trusted sources like NVD/MITRE/CWE/OWASP/CISA/Exploit-DB"
                )
            refs.append(ref)
        return refs

    @field_validator("publishedAt")
    @classmethod
    def validate_published_at(cls, value: Optional[str]) -> Optional[str]:
        text = str(value or "").strip()
        if not text:
            return None
        try:
            datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("publishedAt must be ISO-8601 format") from exc
        return text

    @model_validator(mode="after")
    def validate_evidence_source(self) -> "KnowledgeEvent":
        has_cve = bool(self.cveId)
        has_cwe = bool(self.cweIds)
        has_reference = bool(self.references)
        if (has_cve or has_cwe) and not has_reference:
            raise ValueError("references is required when cveId/cweIds is provided")
        return self


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


class TrustedFeedIngestRequest(BaseModel):
    includeNvd: bool = True
    includeCisaKev: bool = True
    days: int = Field(default=7, ge=1, le=60)
    limitPerFeed: int = Field(default=50, ge=1, le=300)
    project: str = "trusted-feed"


class TrustedFeedIngestResponse(BaseModel):
    totalFetched: int
    totalUpserted: int
    bySource: Dict[str, int]
    errors: List[str] = []


class TrustedFeedIngestHealthResponse(BaseModel):
    hasRun: bool
    lastIngestAt: Optional[str] = None
    totalFetched: int
    totalUpserted: int
    bySource: Dict[str, int]
    errors: List[str] = []

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
            "POST /api/v1/knowledge/ingest/trusted",
            "GET /api/v1/knowledge/ingest/health",
            "GET /api/v1/risk-report",
            "POST /api/v1/chat",
            "POST /api/v1/chat/stream",
            "GET /api/v1/chat/history",
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
        cve_id = str(metadata.get("cve_id") or "")
        cwe_ids = str(metadata.get("cwe_ids") or "")
        source = str(metadata.get("source") or "")
        summary = item.content.strip()[:420]
        lines.append(
            "Category="
            f"{category}; Severity={severity}; Project={project}; "
            f"CVE={cve_id}; CWE={cwe_ids}; Source={source}; "
            f"Score={item.score:.4f}; Content={summary}"
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


def _build_citations(contexts: List[RetrievedContext], limit: int = 3) -> List[Dict[str, Any]]:
    citations: List[Dict[str, Any]] = []
    for item in contexts[:limit]:
        metadata = item.metadata
        cwe_ids = str(metadata.get("cwe_ids") or "").strip()
        citations.append(
            {
                "id": item.id,
                "score": round(float(item.score or 0.0), 4),
                "source": str(metadata.get("source") or "unknown"),
                "project": str(metadata.get("project") or "unknown"),
                "category": str(metadata.get("category") or metadata.get("owasp_category") or "Uncategorized"),
                "cveId": str(metadata.get("cve_id") or "") or None,
                "cweIds": [part for part in cwe_ids.split(",") if part] if cwe_ids else [],
                "reference": str(metadata.get("reference") or "") or None,
                "publishedAt": str(metadata.get("published_at") or "") or None,
            }
        )
    return citations


def _verification_payload(
    reply: str,
    contexts: List[RetrievedContext],
    framework_checks: List[FrameworkCheck],
) -> Dict[str, Any]:
    citations = _build_citations(contexts)
    top_score = max((float(item.score or 0.0) for item in contexts), default=0.0)
    context_factor = min(len(contexts), 5) / 5.0
    checks_factor = min(len(framework_checks), 4) / 4.0
    citation_factor = 1.0 if citations else 0.0

    confidence = round((top_score * 0.45) + (context_factor * 0.25) + (checks_factor * 0.15) + (citation_factor * 0.15), 2)

    notes: List[str] = []
    needs_human_review = False

    if not citations:
        notes.append("No trusted citation could be attached from retrieval context.")
        needs_human_review = True
    if confidence < 0.55:
        notes.append("Confidence is low. Manual security review is recommended.")
        needs_human_review = True
    if "cannot verify" in reply.lower() or "insufficient" in reply.lower():
        notes.append("Model indicates uncertainty. Treat this analysis as advisory only.")
        needs_human_review = True

    if not notes:
        notes.append("Analysis is grounded in retrieved security context and passed deterministic checks.")

    return {
        "citations": citations,
        "confidenceScore": confidence,
        "needsHumanReview": needs_human_review,
        "verificationNotes": notes,
    }

def _quick_framework_scan(message: str, contexts: List[RetrievedContext]) -> List[FrameworkCheck]:
    """
    Quick rule-based OWASP/CWE-inspired checks.
    (MVP: deterministic, lightweight; doesn't replace Gemini/RAG.)
    """
    msg = (message or "").lower()

    context_categories: set[str] = set()
    for item in contexts:
        cat = str(item.metadata.get("category") or item.metadata.get("owasp_category") or "").strip().lower()
        if cat:
            context_categories.add(cat)

    def find_any(tokens: List[str]) -> Optional[str]:
        for t in tokens:
            if t in msg:
                return t
        return None

    def context_has_any(substrs: List[str]) -> bool:
        return any(any(k in c for k in substrs) for c in context_categories)

    checks: List[FrameworkCheck] = []

    # Injection (SQL/Command)
    injection_tokens = [
        "sql",
        "injection",
        "union select",
        "drop table",
        "or 1=1",
        "cursor.execute",
        "execute(",
        "raw query",
        "command injection",
    ]
    injection_evidence = find_any(injection_tokens)
    if injection_evidence or context_has_any(["sql", "injection", "nosql", "command"]):
        checks.append(
            FrameworkCheck(
                id="owasp-a03-injection",
                severity="critical" if injection_evidence else "high",
                owasp="A03",
                cwe="CWE-89/CWE-90",
                title="Injection (SQL/Command) quick gate",
                evidence=injection_evidence or "context-category indicates injection-like behavior",
                recommendation="Use parameterized queries/ORM and avoid building SQL/commands from strings.",
            )
        )

    # XSS
    xss_tokens = [
        "xss",
        "<script",
        "innerhtml",
        "outerhtml",
        "dangerouslysetinnerhtml",
        "onerror=",
        "document.cookie",
    ]
    xss_evidence = find_any(xss_tokens)
    if xss_evidence or context_has_any(["xss", "cross-site"]):
        checks.append(
            FrameworkCheck(
                id="owasp-a07-xss",
                severity="high" if xss_evidence else "medium",
                owasp="A07",
                cwe="CWE-79",
                title="XSS quick gate",
                evidence=xss_evidence or "context-category indicates XSS-like risk",
                recommendation="Encode output, sanitize HTML/JS, and avoid inserting untrusted content as HTML.",
            )
        )

    # Auth / Broken Access Control
    auth_tokens = [
        "csrf",
        "jwt",
        "oauth",
        "session",
        "role",
        "permission",
        "access control",
        "authorization",
        "rbac",
        "broken auth",
        "bacc",
    ]
    auth_evidence = find_any(auth_tokens)
    if auth_evidence or context_has_any(["auth", "access", "authorization", "broken auth", "bacc"]):
        checks.append(
            FrameworkCheck(
                id="owasp-a01-broken-access-control",
                severity="high" if auth_evidence else "medium",
                owasp="A01",
                cwe="CWE-284",
                title="Broken Access Control / Auth quick gate",
                evidence=auth_evidence or "context-category indicates authz/auth risk",
                recommendation="Enforce server-side authorization per action; validate tokens and add CSRF protection.",
            )
        )

    # Secrets / Sensitive data exposure
    secret_tokens = [
        "api key",
        "apikey",
        "secret",
        "password",
        "token",
        "authorization header",
        "bearer ",
        "aws_key",
        "gcp_key",
    ]
    secret_evidence = find_any(secret_tokens)
    if secret_evidence or context_has_any(["secret", "credential", "token"]):
        checks.append(
            FrameworkCheck(
                id="owasp-a02-sensitive-data",
                severity="critical" if secret_evidence else "high",
                owasp="A02",
                cwe="CWE-522/CWE-359",
                title="Sensitive Data / Secrets quick gate",
                evidence=secret_evidence or "context-category indicates secret/credential exposure risk",
                recommendation="Never log secrets; use env/secret manager and rotate keys regularly.",
            )
        )

    # Baseline secure coding checklist (always include at least 1)
    if not checks:
        checks.append(
            FrameworkCheck(
                id="no-token-patterns",
                severity="low",
                title="No obvious OWASP token patterns detected",
                evidence="not enough obvious indicators in your message",
                recommendation="Still apply the baseline secure-coding gate and verify with deeper security testing.",
            )
        )

    checks.append(
        FrameworkCheck(
            id="baseline-secure-coding",
            severity="low",
            title="Baseline secure-coding gate",
            evidence="always-on",
            recommendation="Validate inputs, encode outputs, use parameterized DB operations, avoid stack traces in errors, least privilege, rate limiting, and security tests in CI.",
        )
    )

    # cap for UI
    return checks[:6]


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


@app.post("/api/v1/knowledge/ingest/trusted", response_model=TrustedFeedIngestResponse)
async def knowledge_ingest_trusted(payload: TrustedFeedIngestRequest):
    if not payload.includeNvd and not payload.includeCisaKev:
        raise HTTPException(status_code=400, detail="At least one feed must be enabled")

    try:
        store = VectorKnowledgeStore()
        result = ingest_trusted_feeds(
            store,
            include_nvd=payload.includeNvd,
            include_cisa_kev=payload.includeCisaKev,
            days=payload.days,
            limit_per_feed=payload.limitPerFeed,
            project=payload.project,
        )
        return TrustedFeedIngestResponse(**result)
    except (VectorStoreConfigError, GeminiConfigError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except VectorStoreQueryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Trusted feed ingest failed: {exc}") from exc


@app.get("/api/v1/knowledge/ingest/health", response_model=TrustedFeedIngestHealthResponse)
async def knowledge_ingest_health():
    status = read_last_ingest_status()
    return TrustedFeedIngestHealthResponse(**status)


@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    contexts: List[RetrievedContext] = []

    try:
        store = VectorKnowledgeStore()
        contexts = store.retrieve_context(payload.message, top_k=5)
    except (VectorStoreConfigError, VectorStoreQueryError):
        # Keep chat service available even when retrieval is temporarily unavailable.
        contexts = []

    risk_level = _infer_risk_from_contexts(payload.message, contexts)
    tags = _build_tags(contexts)
    recommendations = _build_recommendations()
    framework_checks = _quick_framework_scan(payload.message, contexts)
    framework_checks_payload = [c.model_dump() for c in framework_checks]

    try:
        gemini = GeminiSecurityService()
        reply = gemini.generate_analysis(payload.message, _context_to_lines(contexts))
    except GeminiConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except GeminiGenerationError as exc:
        detail = str(exc)
        if _is_quota_error(detail):
            reply = _build_fallback_reply(payload.message, contexts, detail)
        else:
            raise HTTPException(status_code=502, detail=detail) from exc

    verification = _verification_payload(reply, contexts, framework_checks)
    response_id = f"chat-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}"
    created_at = datetime.now(tz=timezone.utc).isoformat()

    try:
        history_store = ChatHistoryStore()
        history_store.save_interaction(
            question=payload.message,
            answer=reply,
            risk_level=risk_level,
            source="gemini" if reply else "fallback",
            retrieved_count=len(contexts),
            created_at=created_at,
        )
    except ChatHistoryStoreError:
        # Do not fail chat endpoint when local history persistence is unavailable.
        pass

    return ChatResponse(
        id=response_id,
        reply=reply,
        riskLevel=risk_level,
        tags=tags,
        recommendations=recommendations,
        frameworkChecks=framework_checks,
        citations=verification["citations"],
        confidenceScore=verification["confidenceScore"],
        needsHumanReview=verification["needsHumanReview"],
        verificationNotes=verification["verificationNotes"],
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
    framework_checks = _quick_framework_scan(payload.message, contexts)
    framework_checks_payload = [c.model_dump() for c in framework_checks]

    async def event_generator():
        yield _sse(
            "meta",
            {
                "createdAt": created_at,
                "riskLevel": risk_level,
                "tags": tags,
                "recommendations": recommendations,
                "frameworkChecks": framework_checks_payload,
                "citations": _build_citations(contexts),
                "retrievedCount": len(contexts),
            },
        )

        try:
            full_text: List[str] = []
            for text in gemini.stream_analysis(payload.message, _context_to_lines(contexts)):
                full_text.append(text)
                yield _sse("chunk", {"text": text})

            final_reply = "".join(full_text)
            verification = _verification_payload(final_reply, contexts, framework_checks)
            response_id = f"chat-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}"

            try:
                history_store = ChatHistoryStore()
                history_store.save_interaction(
                    question=payload.message,
                    answer=final_reply,
                    risk_level=risk_level,
                    source="gemini",
                    retrieved_count=len(contexts),
                    created_at=created_at,
                )
            except ChatHistoryStoreError:
                pass

            yield _sse(
                "done",
                {
                    "id": response_id,
                    "createdAt": created_at,
                    "riskLevel": risk_level,
                    "tags": tags,
                    "recommendations": recommendations,
                    "frameworkChecks": framework_checks_payload,
                    "citations": verification["citations"],
                    "confidenceScore": verification["confidenceScore"],
                    "needsHumanReview": verification["needsHumanReview"],
                    "verificationNotes": verification["verificationNotes"],
                    "reply": final_reply,
                },
            )
        except GeminiGenerationError as exc:
            detail = str(exc)
            if _is_quota_error(detail):
                fallback_reply = _build_fallback_reply(payload.message, contexts, detail)
                verification = _verification_payload(fallback_reply, contexts, framework_checks)
                response_id = f"chat-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}"

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
                        "id": response_id,
                        "createdAt": created_at,
                        "riskLevel": risk_level,
                        "tags": tags,
                        "recommendations": recommendations,
                        "frameworkChecks": framework_checks_payload,
                        "citations": verification["citations"],
                        "confidenceScore": verification["confidenceScore"],
                        "needsHumanReview": verification["needsHumanReview"],
                        "verificationNotes": verification["verificationNotes"],
                        "reply": fallback_reply,
                    },
                )
            else:
                yield _sse("error", {"detail": detail})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/v1/chat/history", response_model=ChatHistoryResponse)
async def chat_history(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1, le=100),
    q: str = Query(default=""),
    sort: Literal["newest", "oldest"] = Query(default="newest"),
):
    try:
        store = ChatHistoryStore()
        result = store.query_history(
            page=page,
            page_size=pageSize,
            keyword=q,
            sort=sort,
        )

        return ChatHistoryResponse(
            total=int(result.get("total", 0)),
            page=int(result.get("page", page)),
            pageSize=int(result.get("pageSize", pageSize)),
            keyword=str(result.get("keyword", q)),
            sort=str(result.get("sort", sort)),
            count=len(result.get("items", [])),
            items=[ChatHistoryItem(**item) for item in result.get("items", [])],
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
