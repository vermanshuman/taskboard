from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Default to a local sqlite file so the app runs with zero setup.
    # In Docker / production this is overridden by DATABASE_URL (Postgres).
    database_url: str = "sqlite:///./taskboard.db"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24h

    # CORS: the frontend dev server origin.
    cors_origins: str = "http://localhost:5173"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"

    # Used by the background reminder job.
    reminder_check_interval_seconds: int = 60

    redis_url: str = "redis://localhost:6379/0"

    # Where uploaded card attachments are stored (inside the container).
    upload_dir: str = "./uploads"

    # OpenAI API configuration for the AI Agent features
    openai_api_key: str = ""

    # OpenAI embeddings configuration for AI semantic search
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    semantic_search_top_k: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in settings.cors_origins.split(",") if o.strip()]


settings = Settings()