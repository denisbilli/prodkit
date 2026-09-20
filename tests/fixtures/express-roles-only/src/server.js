const express = require('express');

const app = express();

function requireRole(actor, roles) {
  if (!roles.includes(actor.role)) {
    const error = new Error('forbidden');
    error.status = 403;
    throw error;
  }
}

app.post('/api/invitations', (req, res) => {
  requireRole(req.actor, ['owner', 'admin']);
  res.status(201).json({ invited: req.body.email });
});

app.delete('/api/members/:id', (req, res) => {
  requireRole(req.actor, ['owner']);
  res.status(204).end();
});

module.exports = app;
