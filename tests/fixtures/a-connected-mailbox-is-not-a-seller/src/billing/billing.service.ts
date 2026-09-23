import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function subscribe(workspaceId: string, customer: string, price: string) {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price, quantity: 1 }],
    metadata: { workspaceId },
    success_url: 'https://crm.example.com/billing/success',
    cancel_url: 'https://crm.example.com/billing',
  });
}
