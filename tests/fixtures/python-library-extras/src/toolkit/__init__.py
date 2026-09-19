import aiohttp
import httpx


async def fetch_async(url: str) -> str:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.text()


def fetch(url: str) -> str:
    return httpx.get(url).text
