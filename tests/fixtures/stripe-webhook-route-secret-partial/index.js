const express = require('express');

const app = express();

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.post('/webhook/stripe', (_req, res) => {
  res.json({ ok: Boolean(webhookSecret) });
});

app.listen(3025);
