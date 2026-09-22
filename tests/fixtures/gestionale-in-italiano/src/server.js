const express = require('express')
const pino = require('pino')
const Sentry = require('@sentry/node')
const { Queue } = require('bullmq')
const { applicaSicurezza } = require('./middleware/sicurezza')

Sentry.init({ dsn: process.env.SENTRY_DSN })
const registro = pino()
const coda = new Queue('lavori')
const app = express()

applicaSicurezza(app)
app.use('/api', require('./rotte/accesso'))
app.use('/api', require('./rotte/privacy'))

app.get('/stato', (req, res) => res.json({ stato: 'attivo' }))

app.listen(process.env.PORT || 3000, () => registro.info('avviato'))
