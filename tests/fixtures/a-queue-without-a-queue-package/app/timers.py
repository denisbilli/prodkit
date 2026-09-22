import time
from uuid import uuid4

from sqlalchemy import select

from .db import get_async_db
from .models import Reminder


async def claim_due_reminders(now: int, limit: int = 10) -> list[tuple[str, str]]:
    async with get_async_db() as db:
        stmt = (
            select(Reminder)
            .where(Reminder.due_at <= now)
            .where(Reminder.status == 'pending')
            .order_by(Reminder.due_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        result = await db.execute(stmt)

        claimed = []
        for row in result.scalars().all():
            row.status = 'running'
            row.claim_id = str(uuid4())
            row.updated_at = int(time.time())
            claimed.append((row.id, row.claim_id))
        await db.commit()
        return claimed
