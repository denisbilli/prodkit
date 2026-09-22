const express = require('express')
const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const app = express()

app.post('/venditori/registrazione', async (req, res) => {
  const conto = await stripe.accounts.create({ type: 'express', country: 'IT' })
  await db.venditori.crea({ utenteId: req.user.id, contoStripe: conto.id })
  res.json({ id: conto.id })
})

app.post('/ordini/:id/accredito', async (req, res) => {
  const ordine = await db.ordini.trova(req.params.id)
  const provvigione = Math.round(ordine.totale * 0.12)
  await stripe.transfers.create({
    amount: ordine.totale - provvigione,
    currency: 'eur',
    destination: ordine.contoVenditore,
  })
  res.status(202).end()
})

app.post('/ordini/:id/contestazione', async (req, res) => {
  await db.contestazioni.apri({ ordineId: req.params.id, motivo: req.body.motivo })
  res.status(201).end()
})

app.listen(3000)
