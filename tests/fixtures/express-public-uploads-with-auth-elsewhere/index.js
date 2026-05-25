const express = require('express');

const app = express();

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: 'unauthorized' });
  return next();
}

app.use('/uploads', express.static('uploads'));
app.get('/private', requireAuth, (_req, res) => res.json({ ok: true }));

app.listen(3002);
