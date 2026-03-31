"""
Intentionally vulnerable code samples for scanner/demo purposes only.

DO NOT use these patterns in production.
"""

import os
import sqlite3
import subprocess
from flask import request


def vulnerable_login(db_path: str) -> list[tuple]:
    # SQL Injection: user input is concatenated directly into SQL.
    username = request.args.get("username", "")
    password = request.args.get("password", "")
    query = (
        "SELECT id, username FROM users "
        f"WHERE username = '{username}' AND password = '{password}'"
    )

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(query)
        return cur.fetchall()
    finally:
        conn.close()


def vulnerable_path_read() -> str:
    # Path Traversal: no canonical path validation.
    name = request.args.get("name", "readme.txt")
    with open(f"./uploads/{name}", "r", encoding="utf-8") as fp:
        return fp.read()


def vulnerable_command_exec() -> str:
    # Command Injection: raw shell command built from user input.
    host = request.args.get("host", "localhost")
    result = subprocess.check_output(f"ping -c 1 {host}", shell=True, text=True)
    return result


def vulnerable_hardcoded_secret() -> dict[str, str]:
    # Hardcoded secret (credential leak risk).
    return {
        "JWT_SECRET": "super-secret-dev-key",
        "DB_PASSWORD": "p@ssw0rd123",
    }


def vulnerable_debug_dump() -> dict[str, str]:
    # Sensitive Data Exposure: leaking env credentials in response/log.
    return {
        "aws_access_key_id": os.getenv("AWS_ACCESS_KEY_ID", ""),
        "aws_secret_access_key": os.getenv("AWS_SECRET_ACCESS_KEY", ""),
        "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
    }
