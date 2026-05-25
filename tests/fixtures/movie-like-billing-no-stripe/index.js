const express = require('express');

const app = express();
app.use(express.json());

const billingPlans = ['starter', 'studio', 'pro'];

app.get('/api/billing/plans', (_req, res) => {
  res.json({ plans: billingPlans });
});

app.get('/api/invoices/:invoiceId', (req, res) => {
  res.json({ invoiceId: req.params.invoiceId, status: 'draft' });
});

app.post('/api/subscription/upgrade', (_req, res) => {
  res.json({ ok: true, plan: 'studio' });
});

app.listen(3000);