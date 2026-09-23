from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()


def test_root():
    assert TestClient(app).get("/").status_code == 404
