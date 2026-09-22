from sqlalchemy import select

from .models import Account


# Balances are updated under a row lock. We considered FOR UPDATE SKIP LOCKED here and
# rejected it: a transfer must wait for the lock, never skip the row.
async def transfer(db, source_id: str, target_id: str, amount: int) -> None:
    stmt = select(Account).where(Account.id.in_([source_id, target_id])).with_for_update()
    rows = {row.id: row for row in (await db.execute(stmt)).scalars().all()}
    rows[source_id].balance -= amount
    rows[target_id].balance += amount
    await db.commit()
