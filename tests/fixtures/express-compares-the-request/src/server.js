const express = require('express');

const app = express();

app.get('/api/notes/:id', async (req, res) => {
  // Routing and validation, not authorisation: nothing here is compared to a row.
  if (req.method !== 'GET') return res.sendStatus(405);
  if (req.query.format === 'csv') return res.type('text/csv').send('');
  if (req.params.id === req.query.id) return res.sendStatus(400);

  res.json(await db.notes.find(req.params.id));
});

module.exports = app;
