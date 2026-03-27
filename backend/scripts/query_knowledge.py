from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Load environment variables from repository root .env
load_dotenv(PROJECT_ROOT.parent / ".env", override=True)

from core.vector_store import (  # noqa: E402
    RetrievedContext,
    VectorKnowledgeStore,
    VectorStoreConfigError,
    VectorStoreQueryError,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Query top-k relevant events from vector DB.")
    parser.add_argument("--query", required=True, help="Natural language query")
    parser.add_argument("--top-k", type=int, default=5, help="Number of results to retrieve")
    parser.add_argument("--project", default=None, help="Optional project filter")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print output as JSON instead of human-readable table",
    )
    return parser.parse_args()


def _to_payload(items: List[RetrievedContext]) -> List[Dict[str, Any]]:
    return [
        {
            "id": item.id,
            "score": item.score,
            "content": item.content,
            "metadata": item.metadata,
        }
        for item in items
    ]


def _print_human_readable(items: List[RetrievedContext]) -> None:
    if not items:
        print("[INFO] No retrieval result found.")
        return

    for idx, item in enumerate(items, start=1):
        category = str(item.metadata.get("category") or "Uncategorized")
        severity = str(item.metadata.get("severity") or "low")
        project = str(item.metadata.get("project") or "unknown")
        summary = item.content.strip().replace("\n", " ")
        if len(summary) > 180:
            summary = f"{summary[:177]}..."

        print(f"{idx}. id={item.id}")
        print(f"   score={item.score:.4f} category={category} severity={severity} project={project}")
        print(f"   content={summary}")


def main() -> int:
    args = _parse_args()
    top_k = max(1, min(args.top_k, 50))

    try:
        store = VectorKnowledgeStore()
        contexts = store.retrieve_context(
            query=args.query,
            top_k=top_k,
            project=args.project,
        )
    except VectorStoreConfigError as exc:
        print(f"[CONFIG ERROR] {exc}")
        return 2
    except VectorStoreQueryError as exc:
        print(f"[QUERY ERROR] {exc}")
        return 3

    if args.json:
        print(
            json.dumps(
                {
                    "query": args.query,
                    "topK": top_k,
                    "count": len(contexts),
                    "contexts": _to_payload(contexts),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"[OK] Retrieved {len(contexts)} item(s) for query: {args.query}")
        _print_human_readable(contexts)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
