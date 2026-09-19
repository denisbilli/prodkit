const express = require('express');
const cors = require('cors');

const app = express();

// app.use(cors());

const ADVICE = [
  'Replace cors() defaults with an explicit allowlist.',
];

app.get('/health', (req, res) => res.json({ advice: ADVICE }));

module.exports = app;
