import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .timers import claim_due_reminders


async def scheduler_loop():
    while True:
        for reminder_id, claim_id in await claim_due_reminders(int(asyncio.get_event_loop().time())):
            print(reminder_id, claim_id)
        await asyncio.sleep(10)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(scheduler_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)
