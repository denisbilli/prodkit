const express = require('express');

const app = express();

function requirePermission(permission) {
  return (req, res, next) => (req.actor.permissions.includes(permission) ? next() : res.sendStatus(403));
}

// Anyone with the permission may read anyone's note: the route is guarded and the
// record is not.
app.get('/api/notes/:id', requirePermission('notes:read'), async (req, res) => {
  res.json(await db.query('SELECT * FROM notes WHERE id = $1', [req.params.id]));
});

module.exports = app;
