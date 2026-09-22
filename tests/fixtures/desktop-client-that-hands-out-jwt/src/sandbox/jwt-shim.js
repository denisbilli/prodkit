// Handed to the scripts the user writes inside a request, so they can sign and verify
// tokens for the APIs they are calling. Nobody signs in to this application.
const jwt = require('jsonwebtoken')

module.exports = {
  sign: (payload, secret, options) => jwt.sign(payload, secret, options),
  verify: (token, secret) => jwt.verify(token, secret),
  decode: (token) => jwt.decode(token),
}
