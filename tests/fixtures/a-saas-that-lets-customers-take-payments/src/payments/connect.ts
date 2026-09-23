import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Each company connects its own Stripe account so it can take its clients' payments.
export async function connectCompany(email: string) {
  return stripe.accounts.create({ type: 'standard', email });
}

export function appleMerchantId(company: { appleMerchantId: string }) {
  return company.appleMerchantId;
}
