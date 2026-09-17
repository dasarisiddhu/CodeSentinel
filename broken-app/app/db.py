"""
Database setup — SQLite via sqlite3 (raw, no ORM).
Using raw SQL with string formatting to keep it "simple." This is exactly the
kind of pattern that introduces SQL injection vulnerabilities.
"""

import sqlite3
import os

DB_PATH = os.getenv("DATABASE_PATH", "expenses.db")


def get_db():
    """Return a raw sqlite3 connection. Caller is responsible for closing."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT DEFAULT 'general',
            receipt_path TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # Seed a default admin user (plain-text password — another bug, but minor).
    cur.execute("""
        INSERT OR IGNORE INTO users (username, password, role)
        VALUES ('admin', 'admin123', 'admin')
    """)

    conn.commit()
    conn.close()
