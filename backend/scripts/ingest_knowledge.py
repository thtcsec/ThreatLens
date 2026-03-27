from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Load environment variables from repository root .env
load_dotenv(PROJECT_ROOT.parent / ".env", override=True)

from core.vector_store import (  # noqa: E402
    VectorKnowledgeStore,
    VectorStoreConfigError,
    VectorStoreQueryError,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest security knowledge events into configured vector DB."
    )
    parser.add_argument(
        "--file",
        required=True,
        help="Path to JSON file. Supported shapes: [events] or {\"events\": [events]}",
    )
    return parser.parse_args()


def _read_events(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict) and isinstance(data.get("events"), list):
        items = data["events"]
    else:
        raise ValueError("Invalid JSON shape. Use [events] or {\"events\": [events]}.")

    events: List[Dict[str, Any]] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"Event #{idx + 1} must be an object")
        content = str(item.get("content") or "").strip()
        if not content:
            raise ValueError(f"Event #{idx + 1} is missing non-empty 'content'")
        timestamp = str(item.get("timestamp") or "").strip()
        if not timestamp:
            raise ValueError(
                f"Event #{idx + 1} is missing required 'timestamp'. Use ISO-8601, e.g. 2026-03-27T15:30:00Z"
            )
        try:
            datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(
                f"Event #{idx + 1} has invalid timestamp '{timestamp}'. Use ISO-8601 format."
            ) from exc
        events.append(item)

    if not events:
        raise ValueError("No valid events found")

    return events


def main() -> int:
    args = _parse_args()
    input_path = Path(args.file).expanduser().resolve()

    try:
        events = _read_events(input_path)
        store = VectorKnowledgeStore()
        result = store.upsert_risk_events(events)
    except (FileNotFoundError, ValueError) as exc:
        print(f"[ERROR] {exc}")
        return 1
    except VectorStoreConfigError as exc:
        print(f"[CONFIG ERROR] {exc}")
        return 2
    except VectorStoreQueryError as exc:
        print(f"[QUERY ERROR] {exc}")
        return 3

    print(f"[OK] Upserted {result.get('upsertedCount', 0)} event(s) from {input_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
