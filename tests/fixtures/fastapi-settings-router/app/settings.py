"""Application options an administrator can change from the browser."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings")

DEBUG = True
SESSION_COOKIE_SECURE = False


class SettingsUpdate(BaseModel):
    values: dict[str, str]


@router.get("/")
def read_settings() -> dict[str, str]:
    return {"theme": "dark"}
