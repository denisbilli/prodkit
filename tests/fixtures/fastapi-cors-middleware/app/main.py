from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.settings import settings

app = FastAPI(title="Inventory")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_host],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/items")
def items():
    return {"items": []}
