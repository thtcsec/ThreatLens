from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal
import os

RiskLevel = Literal["critical", "high", "medium", "low"]


@dataclass
class RiskRecord:
    category: str
    level: RiskLevel
    project: str
    occurred_at: datetime


class RiskStoreConfigError(Exception):
    pass


class RiskStoreQueryError(Exception):
    pass


def record_from_metadata(metadata: Dict[str, Any]) -> RiskRecord:
    category = str(
        metadata.get("category")
        or metadata.get("owasp_category")
        or metadata.get("type")
        or "Uncategorized"
    )
    level = _normalize_level(metadata.get("severity") or metadata.get("risk_level"))
    project = str(metadata.get("project") or metadata.get("repo") or metadata.get("service") or "unknown")
    occurred_at = _parse_datetime(
        metadata.get("timestamp")
        or metadata.get("created_at")
        or metadata.get("detected_at")
    )

    return RiskRecord(category=category, level=level, project=project, occurred_at=occurred_at)


def _normalize_level(value: Any) -> RiskLevel:
    raw = str(value or "").strip().lower()

    if raw in {"critical", "crit", "sev0", "p0"}:
        return "critical"
    if raw in {"high", "sev1", "p1"}:
        return "high"
    if raw in {"medium", "med", "sev2", "p2"}:
        return "medium"
    return "low"


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)

    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)

    text = str(value or "").strip()
    if not text:
        return datetime.now(tz=timezone.utc)

    text = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(tz=timezone.utc)


def _extract_matches(raw_result: Any) -> List[Any]:
    if isinstance(raw_result, dict):
        maybe = raw_result.get("matches")
        return maybe if isinstance(maybe, list) else []

    maybe = getattr(raw_result, "matches", None)
    return maybe if isinstance(maybe, list) else []


def _to_dict(obj: Any) -> Dict[str, Any]:
    if isinstance(obj, dict):
        return obj

    to_dict = getattr(obj, "to_dict", None)
    if callable(to_dict):
        value = to_dict()
        if isinstance(value, dict):
            return value

    data = getattr(obj, "__dict__", None)
    if isinstance(data, dict):
        return data

    return {}


def _build_day_buckets(now: datetime) -> List[Dict[str, Any]]:
    buckets: List[Dict[str, Any]] = []
    start = (now - timedelta(days=6)).date()

    for offset in range(7):
        day = start + timedelta(days=offset)
        buckets.append(
            {
                "date": day,
                "day": day.strftime("%a"),
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
            }
        )

    return buckets


class PineconeRiskStore:
    def __init__(self) -> None:
        self._index = self._init_index()
        self._query_dimension = int(os.getenv("VECTOR_QUERY_DIMENSION", "1536"))
        self._query_top_k = int(os.getenv("VECTOR_QUERY_TOP_K", "200"))
        self._namespace = os.getenv("VECTOR_DB_NAMESPACE", "")

    def _init_index(self):
        api_key = os.getenv("VECTOR_DB_API_KEY") or os.getenv("PINECONE_API_KEY")
        index_name = os.getenv("VECTOR_DB_INDEX") or os.getenv("PINECONE_INDEX_NAME")
        host = os.getenv("PINECONE_HOST")

        if not api_key:
            raise RiskStoreConfigError("Missing VECTOR_DB_API_KEY (or PINECONE_API_KEY)")

        if not index_name and not host:
            raise RiskStoreConfigError("Missing VECTOR_DB_INDEX/PINECONE_INDEX_NAME or PINECONE_HOST")

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
                raise RiskStoreConfigError(f"Cannot initialize Pinecone client: {exc}") from exc

    def fetch_records(self) -> List[RiskRecord]:
        try:
            kwargs: Dict[str, Any] = {
                "vector": [0.0] * self._query_dimension,
                "top_k": self._query_top_k,
                "include_metadata": True,
            }
            if self._namespace:
                kwargs["namespace"] = self._namespace

            result = self._index.query(**kwargs)
            matches = _extract_matches(result)

            records: List[RiskRecord] = []
            for match in matches:
                match_dict = _to_dict(match)
                metadata = match_dict.get("metadata") if isinstance(match_dict.get("metadata"), dict) else {}
                records.append(record_from_metadata(metadata))

            return records
        except RiskStoreConfigError:
            raise
        except Exception as exc:
            raise RiskStoreQueryError(f"Failed to query vector store: {exc}") from exc


def build_risk_report(records: List[RiskRecord]) -> Dict[str, Any]:
    if not records:
        raise RiskStoreQueryError("Vector store query succeeded but returned no risk records")

    now = datetime.now(tz=timezone.utc)
    projects = set()
    distribution = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    day_buckets = _build_day_buckets(now)
    day_lookup = {bucket["date"]: bucket for bucket in day_buckets}
    category_stats: Dict[str, Dict[str, int]] = {}

    for record in records:
        projects.add(record.project)
        distribution[record.level] += 1

        day_key = record.occurred_at.astimezone(timezone.utc).date()
        if day_key in day_lookup:
            day_lookup[day_key][record.level] += 1

        if record.category not in category_stats:
            category_stats[record.category] = {
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
                "findings": 0,
            }

        category_stats[record.category][record.level] += 1
        category_stats[record.category]["findings"] += 1

    total_findings = len(records)
    weighted_total = (
        distribution["critical"] * 100
        + distribution["high"] * 75
        + distribution["medium"] * 45
        + distribution["low"] * 20
    )
    risk_index = round(weighted_total / total_findings)

    categories: List[Dict[str, Any]] = []
    for name, stat in category_stats.items():
        findings = stat["findings"]
        weighted = stat["critical"] * 100 + stat["high"] * 75 + stat["medium"] * 45 + stat["low"] * 20
        score = round(weighted / findings)

        if stat["critical"] > 0:
            level: RiskLevel = "critical"
        elif stat["high"] > 0:
            level = "high"
        elif stat["medium"] > 0:
            level = "medium"
        else:
            level = "low"

        categories.append(
            {
                "category": name,
                "score": score,
                "findings": findings,
                "level": level,
            }
        )

    categories.sort(key=lambda item: item["score"], reverse=True)

    trend = [
        {
            "day": bucket["day"],
            "critical": bucket["critical"],
            "high": bucket["high"],
            "medium": bucket["medium"],
            "low": bucket["low"],
        }
        for bucket in day_buckets
    ]

    return {
        "generatedAt": now.isoformat(),
        "totalFindings": total_findings,
        "projectsScanned": len(projects),
        "riskIndex": risk_index,
        "categories": categories,
        "trend": trend,
        "distribution": [
            {"name": "Critical", "value": distribution["critical"]},
            {"name": "High", "value": distribution["high"]},
            {"name": "Medium", "value": distribution["medium"]},
            {"name": "Low", "value": distribution["low"]},
        ],
    }
