const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

async function onboardSeller(userId) {
  const account = await stripe.accounts.create({ type: 'express', country: 'US' })
  return db.sellers.create({ userId, stripeAccountId: account.id })
}

module.exports = { onboardSeller }
