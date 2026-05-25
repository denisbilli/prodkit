const express = require('express');

const app = express();

app.get('/admin/dashboard', (_req, res) => {
  res.json({ ok: true, section: 'admin' });
});

app.post('/api/subscription/preview', (_req, res) => {
  res.json({ plan: 'team', status: 'preview' });
});

app.listen(3000);