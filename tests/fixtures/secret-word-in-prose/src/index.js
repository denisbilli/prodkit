const express = require('express');

const app = express();

// A nullish default and the word "secret" on the same line, with no secret in sight.
// This is the shape that used to produce a critical finding: security tooling, a
// translation file, or any application with a "secret question" feature.
function describe(kind) {
  return `Hardcoded fallback secrets detected (${kind || 'unknown'} key context).`;
}

const QUESTIONS = {
  label: process.env.QUESTION_LABEL || 'Secret question',
};

// The real secret is required, not defaulted.
const signingKey = process.env.SESSION_SECRET;
if (!signingKey) throw new Error('SESSION_SECRET is required');

app.get('/', (_req, res) => res.json({ describe: describe(null), QUESTIONS }));

module.exports = app;
