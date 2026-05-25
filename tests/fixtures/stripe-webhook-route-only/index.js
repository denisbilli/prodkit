const express = require('express');

const app = express();

app.post('/webhook/stripe', (req, res) => {
  res.json({ ok: true });
});

app.listen(3021);
