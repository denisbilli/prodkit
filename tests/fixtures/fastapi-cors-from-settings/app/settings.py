import os
from functools import lru_cache


class Settings:
    cors_origins = os.environ.get("CORS_ORIGINS", "https://recipes.example.com").split(",")


@lru_cache
def get_settings() -> Settings:
    return Settings()
