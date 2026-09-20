from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

allowed_origins = ["*"]

app = FastAPI(title="Recipes")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/recipes")
def recipes():
    return {"recipes": []}
