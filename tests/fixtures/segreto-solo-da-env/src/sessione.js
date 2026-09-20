const jwt = require('jsonwebtoken');

const chiave = process.env.CHIAVE_FIRMA;
if (!chiave) throw new Error('CHIAVE_FIRMA must be set');

function emettiGettone(utente, scadenza) {
  return jwt.sign({ sub: utente.id }, chiave, { expiresIn: scadenza });
}

module.exports = { emettiGettone };
