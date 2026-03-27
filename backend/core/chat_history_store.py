from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


class ChatHistoryStoreError(Exception):
    pass


class ChatHistoryStore:
    def __init__(self) -> None:
        db_path = os.getenv("CHAT_HISTORY_DB_PATH", "./data/chat_history.db")
        self._db_path = Path(db_path)
        if not self._db_path.is_absolute():
            self._db_path = Path(__file__).resolve().parents[1] / self._db_path

        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        try:
            with self._connect() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS chat_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        created_at TEXT NOT NULL,
                        question TEXT NOT NULL,
                        answer TEXT NOT NULL,
                        risk_level TEXT NOT NULL,
                        source TEXT NOT NULL,
                        retrieved_count INTEGER NOT NULL DEFAULT 0
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_chat_history_created_at
                    ON chat_history(created_at DESC)
                    """
                )
        except Exception as exc:
            raise ChatHistoryStoreError(f"Cannot initialize chat history DB: {exc}") from exc

    def save_interaction(
        self,
        *,
        question: str,
        answer: str,
        risk_level: str,
        source: str,
        retrieved_count: int,
        created_at: Optional[str] = None,
    ) -> None:
        question_text = str(question or "").strip()
        answer_text = str(answer or "").strip()
        if not question_text or not answer_text:
            raise ChatHistoryStoreError("question/answer must be non-empty")

        created = created_at or datetime.now(tz=timezone.utc).isoformat()

        try:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO chat_history (
                        created_at,
                        question,
                        answer,
                        risk_level,
                        source,
                        retrieved_count
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        created,
                        question_text,
                        answer_text,
                        str(risk_level or "low").lower(),
                        str(source or "unknown").lower(),
                        max(0, int(retrieved_count)),
                    ),
                )
        except Exception as exc:
            raise ChatHistoryStoreError(f"Cannot save chat history: {exc}") from exc

    def query_history(
        self,
        *,
        page: int = 1,
        page_size: int = 10,
        keyword: str = "",
        sort: str = "newest",
    ) -> Dict[str, Any]:
        safe_page = max(1, int(page))
        safe_page_size = max(1, min(int(page_size), 100))
        safe_keyword = str(keyword or "").strip()
        safe_sort = str(sort or "newest").strip().lower()
        if safe_sort not in {"newest", "oldest"}:
            safe_sort = "newest"
        offset = (safe_page - 1) * safe_page_size

        where_clause = ""
        params: List[Any] = []
        if safe_keyword:
            where_clause = "WHERE LOWER(question) LIKE ? OR LOWER(answer) LIKE ?"
            token = f"%{safe_keyword.lower()}%"
            params.extend([token, token])

        order_clause = "ORDER BY created_at DESC, id DESC"
        if safe_sort == "oldest":
            order_clause = "ORDER BY created_at ASC, id ASC"

        try:
            with self._connect() as conn:
                total_sql = f"SELECT COUNT(*) AS total FROM chat_history {where_clause}"
                total_row = conn.execute(total_sql, tuple(params)).fetchone()
                total = int(total_row["total"] if total_row else 0)

                list_sql = f"""
                    SELECT
                        id,
                        created_at,
                        question,
                        answer,
                        risk_level,
                        source,
                        retrieved_count
                    FROM chat_history
                    {where_clause}
                    {order_clause}
                    LIMIT ? OFFSET ?
                """
                rows = conn.execute(
                    list_sql,
                    tuple([*params, safe_page_size, offset]),
                ).fetchall()

            items = [
                {
                    "id": int(row["id"]),
                    "createdAt": str(row["created_at"]),
                    "question": str(row["question"]),
                    "answer": str(row["answer"]),
                    "riskLevel": str(row["risk_level"]),
                    "source": str(row["source"]),
                    "retrievedCount": int(row["retrieved_count"]),
                }
                for row in rows
            ]

            return {
                "total": total,
                "page": safe_page,
                "pageSize": safe_page_size,
                "keyword": safe_keyword,
                "sort": safe_sort,
                "items": items,
            }
        except Exception as exc:
            raise ChatHistoryStoreError(f"Cannot read chat history: {exc}") from exc
