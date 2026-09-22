const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

const ORIGINI_AMMESSE = ['https://gestionale.it']

function applicaSicurezza(app) {
  app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true } }))
  app.use(cors({ origin: ORIGINI_AMMESSE, credentials: true }))
  app.use(rateLimit({ windowMs: 60000, max: 60 }))
}

module.exports = { applicaSicurezza }
