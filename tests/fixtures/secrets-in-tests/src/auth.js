const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

const X_APP_SECRET_KEY = 'x-app-secret-key';

function sign(payload) {
  return jwt.sign(payload, SECRET);
}

module.exports = { sign, X_APP_SECRET_KEY };
