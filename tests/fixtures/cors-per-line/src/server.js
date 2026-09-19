const express = require('express');

const app = express();
const ALLOWED_ORIGINS = ['https://app.example.com', 'https://admin.example.com'];

// Access-Control-Allow-Origin: * was here during the prototype, do not put it back.
app.get('/api/reports', (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.json({ ok: true });
});

app.get('/public/status', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true });
});

module.exports = app;
