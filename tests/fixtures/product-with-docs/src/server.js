const express = require('express');

const app = express();

app.post('/checkout', (req, res) => res.json({ ok: true }));

module.exports = app;
