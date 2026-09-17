const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();
const app = express();

app.post('/summarise', async (req, res) => {
  const message = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: req.body.text }],
  });
  res.json(message);
});

module.exports = app;
