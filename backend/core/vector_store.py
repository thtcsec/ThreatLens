from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import os

import google.generativeai as genai


class VectorStoreConfigError(Exception):
    pass


class VectorStoreQueryError(Exception):
    pass


@dataclass
class RetrievedContext:
    id: str
    score: float
    content: str
    metadata: Dict[str, Any]


class VectorKnowledgeStore:
    def __init__(self) -> None:
        api_key = os.getenv("VECTOR_DB_API_KEY") or os.getenv("PINECONE_API_KEY")
        if not api_key:
            raise VectorStoreConfigError("Missing VECTOR_DB_API_KEY (or PINECONE_API_KEY)")

        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            raise VectorStoreConfigError("Missing GEMINI_API_KEY for embedding")

        self._index = self._init_index(api_key)
        self._namespace = os.getenv("VECTOR_DB_NAMESPACE", "")
        self._embedding_model = os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004")
        self._query_top_k = int(os.getenv("VECTOR_QUERY_TOP_K", "8"))

        genai.configure(api_key=gemini_key)

    def _init_index(self, api_key: str):
        index_name = os.getenv("VECTOR_DB_INDEX") or os.getenv("PINECONE_INDEX_NAME")
        host = os.getenv("PINECONE_HOST")

        if not index_name and not host:
            raise VectorStoreConfigError("Missing VECTOR_DB_INDEX/PINECONE_INDEX_NAME or PINECONE_HOST")

        try:
            from pinecone import Pinecone

            client = Pinecone(api_key=api_key)
            if host:
                return client.Index(host=host)
            return client.Index(index_name)
        except Exception:
            try:
                import pinecone

                environment = os.getenv("PINECONE_ENVIRONMENT")
                pinecone.init(api_key=api_key, environment=environment)
                return pinecone.Index(index_name)
            except Exception as exc:
                raise VectorStoreConfigError(f"Cannot initialize Pinecone client: {exc}") from exc

    def _embed_text(self, text: str, task_type: str) -> List[float]:
        try:
            response = genai.embed_content(
                model=self._embedding_model,
                content=text,
                task_type=task_type,
            )
        except Exception as exc:
            raise VectorStoreQueryError(f"Embedding failed: {exc}") from exc

        embedding = response.get("embedding") if isinstance(response, dict) else None
        if not isinstance(embedding, list) or not embedding:
            raise VectorStoreQueryError("Embedding response is empty or invalid")

        return [float(value) for value in embedding]

    def upsert_risk_events(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not events:
            raise VectorStoreQueryError("No events to upsert")

        vectors: List[Dict[str, Any]] = []
        now_iso = datetime.now(tz=timezone.utc).isoformat()

        for idx, event in enumerate(events):
            content = str(event.get("content") or "").strip()
            if not content:
                continue

            vector_id = str(event.get("id") or f"risk-{int(datetime.now(tz=timezone.utc).timestamp() * 1000)}-{idx}")
            embedding = self._embed_text(content, task_type="retrieval_document")
            metadata = {
                "content": content,
                "category": str(event.get("category") or "Uncategorized"),
                "severity": str(event.get("severity") or "low").lower(),
                "project": str(event.get("project") or "unknown"),
                "source": str(event.get("source") or "manual"),
                "timestamp": str(event.get("timestamp") or now_iso),
            }
            vectors.append({"id": vector_id, "values": embedding, "metadata": metadata})

        if not vectors:
            raise VectorStoreQueryError("All events were empty; nothing was inserted")

        try:
            kwargs: Dict[str, Any] = {"vectors": vectors}
            if self._namespace:
                kwargs["namespace"] = self._namespace
            self._index.upsert(**kwargs)
            return {"upsertedCount": len(vectors)}
        except Exception as exc:
            raise VectorStoreQueryError(f"Vector upsert failed: {exc}") from exc

    def retrieve_context(self, query: str, top_k: Optional[int] = None, project: Optional[str] = None) -> List[RetrievedContext]:
        embedding = self._embed_text(query, task_type="retrieval_query")
        limit = top_k or self._query_top_k

        query_kwargs: Dict[str, Any] = {
            "vector": embedding,
            "top_k": limit,
            "include_metadata": True,
        }
        if self._namespace:
            query_kwargs["namespace"] = self._namespace
        if project:
            query_kwargs["filter"] = {"project": {"$eq": project}}

        try:
            result = self._index.query(**query_kwargs)
        except Exception as exc:
            raise VectorStoreQueryError(f"Vector query failed: {exc}") from exc

        matches = result.get("matches", []) if isinstance(result, dict) else getattr(result, "matches", [])

        contexts: List[RetrievedContext] = []
        for item in matches:
            if isinstance(item, dict):
                metadata = item.get("metadata") or {}
                vector_id = str(item.get("id") or "")
                score = float(item.get("score") or 0.0)
            else:
                metadata = getattr(item, "metadata", {}) or {}
                vector_id = str(getattr(item, "id", ""))
                score = float(getattr(item, "score", 0.0) or 0.0)

            content = str(metadata.get("content") or "")
            contexts.append(
                RetrievedContext(
                    id=vector_id,
                    score=score,
                    content=content,
                    metadata=metadata,
                )
            )

        return contexts
