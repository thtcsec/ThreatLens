from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

import requests

from core.vector_store import VectorKnowledgeStore

NVD_API_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
CISA_KEV_API_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
CISA_KEV_MIRROR_URLS = (
    CISA_KEV_API_URL,
    "https://cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
)

CISA_DEFAULT_HEADERS = {
    "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
    "User-Agent": (
        "ThreatLens/1.0 (+https://github.com/; security-demo-ingest) "
        "Mozilla/5.0"
    ),
}

RETRYABLE_STATUS_CODES = {403, 408, 409, 425, 429, 500, 502, 503, 504}


def _status_file_path() -> Path:
    configured = str(os.getenv("TRUSTED_FEED_STATUS_PATH", "./data/trusted_feed_status.json")).strip()
    path = Path(configured)
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[1] / path


def read_last_ingest_status() -> Dict[str, Any]:
    path = _status_file_path()
    if not path.exists():
        return {
            "hasRun": False,
            "lastIngestAt": None,
            "totalFetched": 0,
            "totalUpserted": 0,
            "bySource": {"nvd": 0, "cisa-kev": 0},
            "errors": [],
        }

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {
            "hasRun": False,
            "lastIngestAt": None,
            "totalFetched": 0,
            "totalUpserted": 0,
            "bySource": {"nvd": 0, "cisa-kev": 0},
            "errors": ["Failed to parse trusted feed status file"],
        }

    return {
        "hasRun": bool(payload.get("hasRun", True)),
        "lastIngestAt": payload.get("lastIngestAt"),
        "totalFetched": int(payload.get("totalFetched", 0)),
        "totalUpserted": int(payload.get("totalUpserted", 0)),
        "bySource": payload.get("bySource") or {"nvd": 0, "cisa-kev": 0},
        "errors": payload.get("errors") or [],
    }


def _write_ingest_status(status: Dict[str, Any]) -> None:
    path = _status_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")


def _request_json_with_retry(
    urls: List[str],
    *,
    timeout: int,
    headers: Dict[str, str],
    max_attempts: int = 3,
    backoff_base_seconds: float = 0.8,
) -> Dict[str, Any]:
    session = requests.Session()
    last_error: Exception | None = None

    for url in urls:
        for attempt in range(1, max_attempts + 1):
            try:
                response = session.get(url, timeout=timeout, headers=headers)
                if response.status_code in RETRYABLE_STATUS_CODES and attempt < max_attempts:
                    time.sleep(backoff_base_seconds * attempt)
                    continue

                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise ValueError(f"Unexpected payload shape from {url}")
                return payload
            except Exception as exc:
                last_error = exc
                if attempt < max_attempts:
                    time.sleep(backoff_base_seconds * attempt)
                    continue
                break

    if last_error is not None:
        raise last_error
    raise RuntimeError("Unable to fetch feed payload from all candidate URLs")


def _severity_from_cvss(score: float) -> str:
    if score >= 9.0:
        return "critical"
    if score >= 7.0:
        return "high"
    if score >= 4.0:
        return "medium"
    return "low"


def _extract_cvss_score(cve: Dict[str, Any]) -> float:
    metrics = (((cve or {}).get("metrics") or {}))
    for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        items = metrics.get(key) or []
        if not isinstance(items, list) or not items:
            continue
        first = items[0] if isinstance(items[0], dict) else {}
        cvss_data = first.get("cvssData") if isinstance(first.get("cvssData"), dict) else {}
        score = cvss_data.get("baseScore")
        try:
            return float(score)
        except (TypeError, ValueError):
            continue
    return 0.0


def _extract_cwe_ids(cve: Dict[str, Any]) -> List[str]:
    weaknesses = cve.get("weaknesses") or []
    cwe_ids: List[str] = []
    for weakness in weaknesses:
        descriptions = weakness.get("description") if isinstance(weakness, dict) else []
        if not isinstance(descriptions, list):
            continue
        for desc in descriptions:
            value = str((desc or {}).get("value") or "").strip().upper()
            if value.startswith("CWE-") and value not in cwe_ids:
                cwe_ids.append(value)
    return cwe_ids


def _extract_description(cve: Dict[str, Any]) -> str:
    descriptions = cve.get("descriptions") or []
    for desc in descriptions:
        if not isinstance(desc, dict):
            continue
        lang = str(desc.get("lang") or "").lower()
        value = str(desc.get("value") or "").strip()
        if value and lang == "en":
            return value
    for desc in descriptions:
        value = str((desc or {}).get("value") or "").strip()
        if value:
            return value
    return "No CVE description provided"


def fetch_nvd_events(days: int, limit: int, project: str) -> List[Dict[str, Any]]:
    end = datetime.now(tz=timezone.utc)
    start = end - timedelta(days=max(1, days))

    params = {
        "pubStartDate": start.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "pubEndDate": end.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "resultsPerPage": max(1, min(limit, 300)),
    }

    headers: Dict[str, str] = {}
    api_key = ""
    try:
        import os

        api_key = str(os.getenv("NVD_API_KEY") or "").strip()
    except Exception:
        api_key = ""

    if api_key:
        headers["apiKey"] = api_key

    response = requests.get(NVD_API_URL, params=params, headers=headers, timeout=25)
    response.raise_for_status()
    payload = response.json()

    vulnerabilities = payload.get("vulnerabilities") or []
    events: List[Dict[str, Any]] = []

    for item in vulnerabilities[:limit]:
        cve = item.get("cve") if isinstance(item, dict) else None
        if not isinstance(cve, dict):
            continue

        cve_id = str(cve.get("id") or "").strip().upper()
        published = str(cve.get("published") or "").strip()
        if not cve_id or not published:
            continue

        description = _extract_description(cve)
        cvss_score = _extract_cvss_score(cve)
        cwe_ids = _extract_cwe_ids(cve)
        references = [
            str((ref or {}).get("url") or "").strip()
            for ref in (cve.get("references") or [])
            if str((ref or {}).get("url") or "").strip()
        ]

        content = f"{cve_id}: {description}"
        category = cwe_ids[0] if cwe_ids else "CVE"

        events.append(
            {
                "content": content,
                "category": category,
                "severity": _severity_from_cvss(cvss_score),
                "project": project,
                "source": "nvd",
                "timestamp": published,
                "cveId": cve_id,
                "cweIds": cwe_ids,
                "references": references,
                "vendor": None,
                "publishedAt": published,
            }
        )

    return events


def fetch_cisa_kev_events(limit: int, project: str) -> List[Dict[str, Any]]:
    payload = _request_json_with_retry(
        urls=list(CISA_KEV_MIRROR_URLS),
        timeout=25,
        headers=CISA_DEFAULT_HEADERS,
        max_attempts=3,
    )

    vulnerabilities = payload.get("vulnerabilities") or []
    events: List[Dict[str, Any]] = []

    for item in vulnerabilities[:limit]:
        if not isinstance(item, dict):
            continue

        cve_id = str(item.get("cveID") or "").strip().upper()
        date_added = str(item.get("dateAdded") or "").strip()
        if not cve_id or not date_added:
            continue

        vendor = str(item.get("vendorProject") or "").strip()
        product = str(item.get("product") or "").strip()
        vuln_name = str(item.get("vulnerabilityName") or "").strip()
        short_desc = str(item.get("shortDescription") or "").strip()

        content_parts = [
            f"{cve_id}: {vuln_name}" if vuln_name else cve_id,
            short_desc,
            f"Vendor={vendor}; Product={product}" if vendor or product else "",
        ]
        content = " | ".join(part for part in content_parts if part)

        # KEV list implies active exploitation, so severity is at least high.
        events.append(
            {
                "content": content,
                "category": "Known Exploited Vulnerability",
                "severity": "critical",
                "project": project,
                "source": "cisa-kev",
                "timestamp": f"{date_added}T00:00:00Z",
                "cveId": cve_id,
                "cweIds": [],
                "references": [
                    CISA_KEV_MIRROR_URLS[0],
                    f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                ],
                "vendor": vendor or None,
                "publishedAt": f"{date_added}T00:00:00Z",
            }
        )

    return events


def _dedupe_by_cve(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[str] = set()
    deduped: List[Dict[str, Any]] = []
    for event in events:
        cve_id = str(event.get("cveId") or "").strip().upper()
        key = cve_id or str(event.get("content") or "")
        if key in seen:
            continue
        seen.add(key)
        deduped.append(event)
    return deduped


def ingest_trusted_feeds(
    store: VectorKnowledgeStore,
    *,
    include_nvd: bool,
    include_cisa_kev: bool,
    days: int,
    limit_per_feed: int,
    project: str,
) -> Dict[str, Any]:
    events: List[Dict[str, Any]] = []
    source_counter: Dict[str, int] = {"nvd": 0, "cisa-kev": 0}
    errors: List[str] = []

    if include_nvd:
        try:
            nvd_events = fetch_nvd_events(days=days, limit=limit_per_feed, project=project)
            events.extend(nvd_events)
            source_counter["nvd"] = len(nvd_events)
        except Exception as exc:
            errors.append(f"NVD feed failed: {exc}")

    if include_cisa_kev:
        try:
            cisa_events = fetch_cisa_kev_events(limit=limit_per_feed, project=project)
            events.extend(cisa_events)
            source_counter["cisa-kev"] = len(cisa_events)
        except Exception as exc:
            errors.append(f"CISA KEV feed failed: {exc}")

    deduped_events = _dedupe_by_cve(events)

    total_upserted = 0
    if deduped_events:
        result = store.upsert_risk_events(deduped_events)
        total_upserted = int(result.get("upsertedCount", 0))

    status = {
        "hasRun": True,
        "lastIngestAt": datetime.now(tz=timezone.utc).isoformat(),
        "totalFetched": len(deduped_events),
        "totalUpserted": total_upserted,
        "bySource": source_counter,
        "errors": errors,
    }
    _write_ingest_status(status)
    return status
