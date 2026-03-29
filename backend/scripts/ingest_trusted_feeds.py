from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Load environment variables from repository root .env
load_dotenv(PROJECT_ROOT.parent / ".env", override=True)

from core.threat_feeds import ingest_trusted_feeds  # noqa: E402
from core.vector_store import (  # noqa: E402
    VectorKnowledgeStore,
    VectorStoreConfigError,
    VectorStoreQueryError,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest trusted NVD/CISA KEV feeds into configured vector DB."
    )
    parser.add_argument("--days", type=int, default=7, help="NVD time window in days")
    parser.add_argument("--limit-per-feed", type=int, default=50, help="Maximum events fetched per feed")
    parser.add_argument("--project", default="trusted-feed", help="Project label for ingested events")
    parser.add_argument("--no-nvd", action="store_true", help="Skip NVD feed")
    parser.add_argument("--no-cisa-kev", action="store_true", help="Skip CISA KEV feed")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    include_nvd = not args.no_nvd
    include_cisa_kev = not args.no_cisa_kev

    if not include_nvd and not include_cisa_kev:
        print("[ERROR] At least one feed must be enabled")
        return 1

    try:
        store = VectorKnowledgeStore()
        result = ingest_trusted_feeds(
            store,
            include_nvd=include_nvd,
            include_cisa_kev=include_cisa_kev,
            days=max(1, min(args.days, 60)),
            limit_per_feed=max(1, min(args.limit_per_feed, 300)),
            project=str(args.project or "trusted-feed").strip() or "trusted-feed",
        )
    except VectorStoreConfigError as exc:
        print(f"[CONFIG ERROR] {exc}")
        return 2
    except VectorStoreQueryError as exc:
        print(f"[QUERY ERROR] {exc}")
        return 3
    except Exception as exc:
        print(f"[ERROR] Trusted feed ingest failed: {exc}")
        return 4

    print(
        "[OK] Trusted ingest finished: "
        f"fetched={result.get('totalFetched', 0)} upserted={result.get('totalUpserted', 0)} "
        f"bySource={result.get('bySource', {})}"
    )
    if result.get("errors"):
        print(f"[WARN] Feed errors: {result.get('errors')}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
