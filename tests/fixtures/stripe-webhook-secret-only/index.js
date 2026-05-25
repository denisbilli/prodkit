const express = require('express');

const app = express();

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.get('/health', (_req, res) => {
  res.json({ ok: Boolean(webhookSecret) });
});

app.listen(3023);
