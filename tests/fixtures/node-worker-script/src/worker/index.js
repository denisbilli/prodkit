const { Pool } = require('pg');

// A hand-rolled worker: it claims rows from Postgres and has no queue library to
// give it away. What says it exists is the script that starts it.
const pool = new Pool();

async function run() {
  for (;;) {
    const claimed = await pool.query(
      'UPDATE jobs SET status = $1 WHERE id = (SELECT id FROM jobs WHERE status = $2 LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *',
      ['running', 'queued']
    );
    if (claimed.rowCount === 0) await new Promise((r) => setTimeout(r, 2000));
  }
}

run();
