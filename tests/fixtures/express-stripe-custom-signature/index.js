const express = require('express');
const Stripe = require('stripe');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  stripe.webhooks.constructEvent(req.rawBody || req.body, signature, webhookSecret);
  res.json({ ok: true });
});

app.listen(3005);
