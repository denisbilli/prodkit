const express = require('express');

const rotte = express.Router();

rotte.get('/note/:id', async (richiesta, risposta) => {
  const nota = await db.query('SELECT * FROM note WHERE id = $1', [richiesta.params.id]);
  if (nota.proprietario !== richiesta.utente.id) return risposta.sendStatus(404);
  risposta.json(nota);
});

rotte.delete('/note/:id', async (richiesta, risposta) => {
  const nota = await db.query('SELECT * FROM note WHERE id = $1', [richiesta.params.id]);
  if (nota.proprietario !== richiesta.utente.id) return risposta.sendStatus(404);
  await db.query('DELETE FROM note WHERE id = $1', [richiesta.params.id]);
  risposta.sendStatus(204);
});

module.exports = rotte;
