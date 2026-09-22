const express = require('express')
const bcrypt = require('bcryptjs')

const app = express()

app.post('/accedi', async (req, res) => {
  const utente = await db.utenti.perEmail(req.body.email)
  if (!utente || !(await bcrypt.compare(req.body.password, utente.hash))) {
    return res.status(401).end()
  }
  res.json({ id: utente.id })
})

app.post('/recupero-password', async (req, res) => {
  const gettone = await creaGettoneRecupero(req.body.email)
  await inviaEmailRecupero(req.body.email, gettone)
  res.status(202).end()
})

app.post('/conferma-email', async (req, res) => {
  await confermaIndirizzo(req.body.gettone)
  res.status(204).end()
})

app.listen(3000)
