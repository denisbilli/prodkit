import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function onboardHost(email: string) {
  return stripe.accounts.create({ type: 'express', email });
}
