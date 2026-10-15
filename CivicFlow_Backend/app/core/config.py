from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "CivicFlow API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"
    database_url: str = "sqlite:///./civicflow.db"
    secret_key: str = "local-development-secret-change-before-deploying-123456"
    access_token_expire_minutes: int = Field(default=60, ge=5, le=1440)
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost:8501"
    ai_provider: str = "auto"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-flash-latest"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "gemma3:4b"
    ollama_timeout_seconds: int = Field(default=90, ge=5, le=600)
    upload_dir: Path = Path("storage/uploads")
    max_upload_mb: int = Field(default=10, ge=1, le=25)
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        if self.ai_provider not in {"auto", "gemini", "ollama", "rules"}:
            raise ValueError("AI_PROVIDER must be auto, gemini, ollama, or rules")
        if self.app_env.lower() == "production":
            if "local-development-secret" in self.secret_key or "replace-this" in self.secret_key or len(self.secret_key) < 32:
                raise ValueError("Set a strong SECRET_KEY before running in production")
            if self.cors_origins.strip() == "*":
                raise ValueError("Wildcard CORS is not allowed in production")
        if bool(self.bootstrap_admin_email) != bool(self.bootstrap_admin_password):
            raise ValueError("Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, or leave both blank")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
