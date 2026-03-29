from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import os
from uuid import uuid4

from google import genai
from google.genai import types


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
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            raise VectorStoreConfigError("Missing GEMINI_API_KEY for embedding")

        self._provider = str(os.getenv("VECTOR_DB_PROVIDER", "pinecone")).strip().lower()
        self._store = self._init_store()
        self._namespace = os.getenv("VECTOR_DB_NAMESPACE", "")
        self._embedding_model = self._normalize_embedding_model(
            os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
        )
        self._embedding_dimension = self._parse_optional_int(
            os.getenv("GEMINI_EMBEDDING_DIMENSION", "768")
        )
        self._query_top_k = int(os.getenv("VECTOR_QUERY_TOP_K", "8"))
        self._genai_client = genai.Client(api_key=gemini_key)

    def _normalize_embedding_model(self, model_name: str) -> str:
        raw = str(model_name or "").strip()
        if not raw:
            return "gemini-embedding-001"

        # Accept both "model-id" and "models/model-id"
        normalized = raw.replace("models/", "")
        # Migrate from deprecated embedding models.
        if normalized in {"text-embedding-004", "embedding-001"}:
            return "gemini-embedding-001"
        return normalized

    def _parse_optional_int(self, value: Optional[str]) -> Optional[int]:
        text = str(value or "").strip()
        if not text:
            return None
        try:
            parsed = int(text)
            return parsed if parsed > 0 else None
        except ValueError:
            return None

    def _init_store(self):
        if self._provider in {"pinecone", "pc"}:
            return self._init_pinecone_index()
        if self._provider in {"chroma", "chromadb"}:
            return self._init_chroma_collection()

        raise VectorStoreConfigError(
            "Unsupported VECTOR_DB_PROVIDER. Use 'pinecone' or 'chroma'."
        )

    def _init_pinecone_index(self):
        api_key = os.getenv("VECTOR_DB_API_KEY") or os.getenv("PINECONE_API_KEY")
        index_name = os.getenv("VECTOR_DB_INDEX") or os.getenv("PINECONE_INDEX_NAME")
        host = self._normalize_pinecone_host(os.getenv("PINECONE_HOST"))

        if not api_key:
            raise VectorStoreConfigError("Missing VECTOR_DB_API_KEY (or PINECONE_API_KEY)")
        if self._looks_like_placeholder(api_key):
            raise VectorStoreConfigError(
                "VECTOR_DB_API_KEY is still a placeholder. Replace it with a real Pinecone API key."
            )

        if not index_name and not host:
            raise VectorStoreConfigError("Missing VECTOR_DB_INDEX/PINECONE_INDEX_NAME or PINECONE_HOST")

        try:
            from pinecone import Pinecone
        except Exception as exc:
            raise VectorStoreConfigError(
                "Cannot import Pinecone SDK. Run `pip uninstall -y pinecone-client` then `pip install pinecone`."
            ) from exc

        try:
            client = Pinecone(api_key=api_key)
            if host:
                return client.Index(host=host)
            return client.Index(index_name)
        except Exception as exc:
            raise VectorStoreConfigError(f"Cannot initialize Pinecone client: {exc}") from exc

    def _normalize_pinecone_host(self, host_value: Optional[str]) -> str:
        raw = str(host_value or "").strip()
        if not raw:
            return ""

        lowered = raw.lower()
        placeholder_tokens = ("replace_with_host", "replace", "your_", "example")
        if any(token in lowered for token in placeholder_tokens):
            return ""

        if lowered.startswith("https://"):
            raw = raw[8:]
        elif lowered.startswith("http://"):
            raw = raw[7:]

        # Keep host only if users pasted a full URL accidentally.
        return raw.split("/", 1)[0].strip()

    def _looks_like_placeholder(self, value: str) -> bool:
        text = str(value or "").strip().lower()
        if not text:
            return True
        tokens = ("replace", "your_", "example", "changeme")
        return any(token in text for token in tokens)

    def _init_chroma_collection(self):
        collection_name = str(os.getenv("CHROMA_COLLECTION", "threatlens_knowledge")).strip()
        persist_path = str(os.getenv("CHROMA_DB_PATH", "./.chroma")).strip()

        try:
            import chromadb

            client = chromadb.PersistentClient(path=persist_path)
            return client.get_or_create_collection(name=collection_name)
        except Exception as exc:
            raise VectorStoreConfigError(f"Cannot initialize ChromaDB client: {exc}") from exc

    def _embed_text(self, text: str, task_type: str) -> List[float]:
        task_map = {
            "retrieval_document": "RETRIEVAL_DOCUMENT",
            "retrieval_query": "RETRIEVAL_QUERY",
            "semantic_similarity": "SEMANTIC_SIMILARITY",
        }
        normalized_task_type = task_map.get(str(task_type).strip().lower(), str(task_type).strip().upper())

        config_kwargs: Dict[str, Any] = {
            "task_type": normalized_task_type,
        }
        if self._embedding_dimension:
            config_kwargs["output_dimensionality"] = self._embedding_dimension

        try:
            response = self._genai_client.models.embed_content(
                model=self._embedding_model,
                contents=text,
                config=types.EmbedContentConfig(**config_kwargs),
            )
        except Exception as exc:
            detail = str(exc).lower()
            if "not found" in detail and "embedding" in detail:
                raise VectorStoreQueryError(
                    "Embedding model not found. Set GEMINI_EMBEDDING_MODEL=gemini-embedding-001."
                ) from exc
            raise VectorStoreQueryError(f"Embedding failed: {exc}") from exc

        embedding: Optional[List[float]] = None
        embeddings = getattr(response, "embeddings", None)
        if isinstance(embeddings, list) and embeddings:
            first = embeddings[0]
            values = getattr(first, "values", None)
            if values is None and isinstance(first, dict):
                values = first.get("values")
            if isinstance(values, list) and values:
                embedding = [float(value) for value in values]

        if embedding is None:
            maybe_embedding = getattr(response, "embedding", None)
            if isinstance(maybe_embedding, list) and maybe_embedding:
                embedding = [float(value) for value in maybe_embedding]

        if embedding is None and isinstance(response, dict):
            maybe_embeddings = response.get("embeddings")
            if isinstance(maybe_embeddings, list) and maybe_embeddings:
                first = maybe_embeddings[0]
                if isinstance(first, dict) and isinstance(first.get("values"), list):
                    embedding = [float(value) for value in first["values"]]

        if not embedding:
            raise VectorStoreQueryError("Embedding response is empty or invalid")

        return embedding

    def _validate_timestamp(self, value: Any, event_number: int) -> str:
        text = str(value or "").strip()
        if not text:
            raise VectorStoreQueryError(
                f"Event #{event_number} is missing required 'timestamp'. Use ISO-8601, e.g. 2026-03-27T15:30:00Z"
            )

        normalized = text.replace("Z", "+00:00")
        try:
            datetime.fromisoformat(normalized)
        except ValueError as exc:
            raise VectorStoreQueryError(
                f"Event #{event_number} has invalid timestamp '{text}'. Use ISO-8601 format."
            ) from exc

        return text

    def upsert_risk_events(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not events:
            raise VectorStoreQueryError("No events to upsert")

        vectors: List[Dict[str, Any]] = []
        chroma_ids: List[str] = []
        chroma_embeddings: List[List[float]] = []
        chroma_metadatas: List[Dict[str, Any]] = []
        chroma_documents: List[str] = []

        for idx, event in enumerate(events, start=1):
            content = str(event.get("content") or "").strip()
            if not content:
                continue

            vector_id = str(event.get("id") or f"risk-{uuid4().hex}")
            timestamp = self._validate_timestamp(event.get("timestamp"), event_number=idx)
            embedding = self._embed_text(content, task_type="retrieval_document")
            cwe_ids = event.get("cweIds") or []
            if isinstance(cwe_ids, list):
                normalized_cwe_ids = [str(item).strip().upper() for item in cwe_ids if str(item).strip()]
            else:
                normalized_cwe_ids = []

            references = event.get("references") or []
            primary_reference = ""
            if isinstance(references, list):
                for ref in references:
                    text_ref = str(ref or "").strip()
                    if text_ref:
                        primary_reference = text_ref
                        break

            metadata = {
                "content": content,
                "category": str(event.get("category") or "Uncategorized"),
                "severity": str(event.get("severity") or "low").lower(),
                "project": str(event.get("project") or "unknown"),
                "source": str(event.get("source") or "manual"),
                "timestamp": timestamp,
                "cve_id": str(event.get("cveId") or "").strip(),
                "cwe_ids": ",".join(normalized_cwe_ids),
                "reference": primary_reference,
                "vendor": str(event.get("vendor") or "").strip(),
                "published_at": str(event.get("publishedAt") or "").strip(),
            }
            vectors.append({"id": vector_id, "values": embedding, "metadata": metadata, "content": content})
            chroma_ids.append(vector_id)
            chroma_embeddings.append(embedding)
            chroma_metadatas.append(metadata)
            chroma_documents.append(content)

        if not vectors:
            raise VectorStoreQueryError("All events were empty; nothing was inserted")

        if self._provider in {"chroma", "chromadb"}:
            try:
                self._store.upsert(
                    ids=chroma_ids,
                    embeddings=chroma_embeddings,
                    metadatas=chroma_metadatas,
                    documents=chroma_documents,
                )
                return {"upsertedCount": len(chroma_ids)}
            except Exception as exc:
                raise VectorStoreQueryError(f"Vector upsert failed (chroma): {exc}") from exc

        try:
            kwargs: Dict[str, Any] = {
                "vectors": [
                    {"id": item["id"], "values": item["values"], "metadata": item["metadata"]}
                    for item in vectors
                ]
            }
            if self._namespace:
                kwargs["namespace"] = self._namespace
            self._store.upsert(**kwargs)
            return {"upsertedCount": len(vectors)}
        except Exception as exc:
            raise VectorStoreQueryError(f"Vector upsert failed (pinecone): {exc}") from exc

    def retrieve_context(self, query: str, top_k: Optional[int] = None, project: Optional[str] = None) -> List[RetrievedContext]:
        embedding = self._embed_text(query, task_type="retrieval_query")
        limit = top_k or self._query_top_k

        if self._provider in {"chroma", "chromadb"}:
            query_kwargs: Dict[str, Any] = {
                "query_embeddings": [embedding],
                "n_results": limit,
                "include": ["metadatas", "documents", "distances"],
            }
            if project:
                query_kwargs["where"] = {"project": project}

            try:
                result = self._store.query(**query_kwargs)
            except Exception as exc:
                raise VectorStoreQueryError(f"Vector query failed (chroma): {exc}") from exc

            ids = result.get("ids", [[]])
            distances = result.get("distances", [[]])
            metadatas = result.get("metadatas", [[]])
            documents = result.get("documents", [[]])

            row_ids = ids[0] if ids else []
            row_distances = distances[0] if distances else []
            row_metadatas = metadatas[0] if metadatas else []
            row_documents = documents[0] if documents else []

            contexts: List[RetrievedContext] = []
            for idx, item_id in enumerate(row_ids):
                metadata = row_metadatas[idx] if idx < len(row_metadatas) and isinstance(row_metadatas[idx], dict) else {}
                content = str(row_documents[idx] if idx < len(row_documents) else metadata.get("content") or "")
                distance = float(row_distances[idx] if idx < len(row_distances) else 1.0)
                score = 1.0 / (1.0 + max(distance, 0.0))

                contexts.append(
                    RetrievedContext(
                        id=str(item_id),
                        score=score,
                        content=content,
                        metadata=metadata,
                    )
                )

            return contexts

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
            result = self._store.query(**query_kwargs)
        except Exception as exc:
            raise VectorStoreQueryError(f"Vector query failed (pinecone): {exc}") from exc

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
