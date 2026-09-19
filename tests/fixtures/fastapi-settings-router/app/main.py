from fastapi import FastAPI
from app.settings import router

app = FastAPI()
app.include_router(router)
