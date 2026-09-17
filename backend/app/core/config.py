"""
CodeSentinel — Application Configuration
All settings loaded from environment variables / .env file.
Never hardcode secrets here.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── LLM ──────────────────────────────────────────────────────────────────
    groq_api_key: str = ""
    groq_model_primary: str = "llama-3.3-70b-versatile"
    groq_model_fallback: str = "llama-3.1-8b-instant"
    llm_timeout: float = 20.0

    # ── GitHub ────────────────────────────────────────────────────────────────
    github_token: str = ""
    github_repo: str = ""  # "owner/repo"
    github_timeout: float = 10.0

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./codesentinel.db"

    # ── Cache ─────────────────────────────────────────────────────────────────
    cache_max_size: int = 10

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: str = "INFO"

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def github_configured(self) -> bool:
        return bool(self.github_token and self.github_repo)

    @property
    def groq_configured(self) -> bool:
        return bool(self.groq_api_key)


settings = Settings()
