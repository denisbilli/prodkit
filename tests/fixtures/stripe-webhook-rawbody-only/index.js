const express = require('express');

const app = express();

app.use(express.raw({ type: 'application/json' }));

app.post('/events', (req, res) => {
  const payload = req.rawBody || req.body;
  res.json({ ok: Boolean(payload) });
});

app.listen(3022);
