const express = require('express');
const Stripe = require('stripe');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_example');

app.post('/events', (req, res) => {
  const payload = '{}';
  const sig = 't=123,v1=abc';
  const localSecret = 'whsec_local';
  stripe.webhooks.constructEvent(payload, sig, localSecret);
  res.json({ ok: true });
});

app.listen(3024);
