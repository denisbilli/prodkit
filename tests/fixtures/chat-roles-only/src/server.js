const express = require('express');
const OpenAI = require('openai');

const app = express();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/chat', async (req, res) => {
  const history = req.body.messages.map((m) => ({ role: m.role, content: m.content }));
  const answer = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: 'You help with recipes.' }, ...history],
  });

  res.json({ reply: answer.choices[0].message });
});

module.exports = app;

function labelFor(role) {
  if (role === 'assistant') {
    return 'Assistant';
  }
  return 'You';
}

module.exports.labelFor = labelFor;
