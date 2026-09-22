const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { authenticator } = require('otplib')
const { z } = require('zod')

const router = express.Router()
const Credenziali = z.object({ posta: z.string().email(), parola: z.string().min(12) })

router.post('/accesso', async (req, res) => {
  const { posta, parola } = Credenziali.parse(req.body)
  const utente = await db.utenti.perPosta(posta)
  if (!utente || !(await bcrypt.compare(parola, utente.impronta))) return res.status(401).end()
  if (!authenticator.check(req.body.codice, utente.segretoTotp)) return res.status(401).end()
  res.cookie('sessione', jwt.sign({ sub: utente.id, azienda: utente.aziendaId }, process.env.JWT_SECRET), {
    httpOnly: true, secure: true, sameSite: 'strict',
  })
  res.json({ ok: true })
})

router.post('/iscrizione', async (req, res) => {
  const { posta, parola } = Credenziali.parse(req.body)
  const impronta = await bcrypt.hash(parola, 12)
  const utente = await db.utenti.crea({ posta, impronta, postaVerificata: false })
  await posta.inviaVerifica(utente)
  res.status(201).end()
})

router.post('/parola-dimenticata', async (req, res) => {
  const gettone = crypto.randomBytes(32).toString('hex')
  await db.gettoniRipristino.crea({ utenteId: req.body.utenteId, gettone, scadenza: Date.now() + 3600000 })
  res.status(202).end()
})

router.get('/conferma-posta/:gettone', async (req, res) => {
  await db.utenti.confermaPosta(req.params.gettone)
  res.redirect('/')
})

module.exports = router
