const express = require('express');

const app = express();

app.get('/api/notes/:id', async (req, res) => {
  const note = await db.query('SELECT * FROM notes WHERE id = $1', [req.params.id]);
  if (note.ownerId !== req.user.id) return res.sendStatus(404);
  res.json(note);
});

module.exports = app;
