const GLOB = '**/*.ts';

function buildPrompt(question) {
  return `Rispondi solo con il JSON.\n${question}`;
}

// Esempio di chiamata a OpenAI (richiede API key)
/*
const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 200 })
});
*/

module.exports = { buildPrompt, GLOB };
