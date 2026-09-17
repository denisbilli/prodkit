const express = require('express');
const { Queue } = require('bullmq');

// A perfectly ordinary application with a worker. Nothing here calls a model.
const invoices = new Queue('invoices');
const app = express();

app.post('/invoices', async (req, res) => {
  await invoices.add('render', { id: req.body.id });
  res.status(202).json({ queued: true });
});

module.exports = app;
