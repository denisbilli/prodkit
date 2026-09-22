from fastapi import APIRouter

api_router = APIRouter()


@api_router.get("/healthcheck", include_in_schema=False)
def healthcheck():
    """Simple healthcheck endpoint."""
    return {"status": "ok"}


@api_router.get("/incidents")
def list_incidents():
    return []
