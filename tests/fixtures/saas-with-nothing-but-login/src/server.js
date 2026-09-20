const express = require('express');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post('/login', async (req, res) => {
  const token = jwt.sign({ sub: req.body.email }, process.env.JWT_SECRET);
  res.json({ token });
});

app.post('/checkout', async (req, res) => {
  const session = await stripe.checkout.sessions.create({ mode: 'subscription' });
  res.json({ url: session.url });
});

app.get('/invoices', async (req, res) => {
  res.json(await db.query('SELECT * FROM invoices'));
});

module.exports = app;
