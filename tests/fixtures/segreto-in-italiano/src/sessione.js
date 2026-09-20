const jwt = require('jsonwebtoken');

const chiave = process.env.CHIAVE_FIRMA || 'cambiami';

function emettiGettone(utente) {
  return jwt.sign({ sub: utente.id }, chiave, { expiresIn: '7d' });
}

function verificaGettone(gettone) {
  return jwt.verify(gettone, chiave);
}

module.exports = { emettiGettone, verificaGettone };
