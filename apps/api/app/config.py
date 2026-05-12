from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    api_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    # Database
    database_url: str = "postgresql+asyncpg://secondbrain:secondbrain@localhost:5432/secondbrain"
    database_url_sync: str = "postgresql://secondbrain:secondbrain@localhost:5432/secondbrain"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "secondbrain"

    # Elasticsearch
    elasticsearch_url: str = "http://localhost:9200"

    # Supabase Auth
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # AWS
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-south-1"
    s3_bucket: str = "secondbrain-local"

    # GitHub Models (unified AI endpoint)
    github_token: str = ""
    github_models_endpoint: str = "https://models.github.ai/inference"
    embedding_model: str = "openai/text-embedding-3-large"
    classification_model: str = "openai/gpt-4o"
    summarisation_model: str = "openai/gpt-4o-mini"

    # Feature flags
    use_neo4j_graph: bool = True   # False = fallback to PostgreSQL edges table

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
