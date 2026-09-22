const express = require('express')
const router = express.Router()

router.get('/miei-dati/scarico', async (req, res) => {
  const dati = await db.utenti.esportaTutto(req.user.id)
  res.json(dati)
})

router.delete('/miei-dati', async (req, res) => {
  await db.utenti.cancellaDefinitivamente(req.user.id)
  res.status(204).end()
})

module.exports = router
