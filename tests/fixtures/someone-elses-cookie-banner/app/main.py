from fastapi import FastAPI
from recipe_scrapers import scrape_html

app = FastAPI()


@app.post("/recipes/parse")
async def parse(html: str, url: str):
    return scrape_html(html, org_url=url).to_json()
