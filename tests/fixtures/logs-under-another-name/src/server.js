const express = require('express');
const { Roarr } = require('roarr');

const app = express();
const shout = Roarr.child({ service: 'orders' });

app.post('/api/orders', async (req, res) => {
  shout.info({ orderId: req.body.id }, 'order received');
  res.status(201).end();
});

app.use((err, req, res, next) => {
  shout.error({ err }, 'request failed');
  res.status(500).end();
});

module.exports = app;
