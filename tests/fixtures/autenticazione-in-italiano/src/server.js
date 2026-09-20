const express = require('express');
const argon2 = require('argon2');
const { getIronSession } = require('iron-session');

const app = express();

app.post('/accedi', async (req, res) => {
  const utente = await db.query('SELECT * FROM utenti WHERE email = $1', [req.body.email]);
  if (!utente || !(await argon2.verify(utente.hash, req.body.password))) return res.sendStatus(401);

  const sessione = await getIronSession(req, res, { password: process.env.SESSION_KEY, cookieName: 'gestionale' });
  sessione.utenteId = utente.id;
  await sessione.save();
  res.sendStatus(204);
});

app.post('/registrati', async (req, res) => {
  const hash = await argon2.hash(req.body.password);
  await db.query('INSERT INTO utenti (email, hash) VALUES ($1, $2)', [req.body.email, hash]);
  res.sendStatus(201);
});

app.post('/esci', async (req, res) => {
  const sessione = await getIronSession(req, res, { password: process.env.SESSION_KEY, cookieName: 'gestionale' });
  sessione.destroy();
  res.sendStatus(204);
});

module.exports = app;
