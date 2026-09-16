import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// The route is the path of this file. Nothing here writes the URL down, which is the
// whole point of the fixture: an App Router webhook is correctly hardened and says so
// nowhere in its own text.
export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return Response.json({ ok: false }, { status: 503 });
  }

  // The exact bytes Stripe signed. Parsing and re-serialising would change them.
  const payload = await request.text();

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return Response.json({ received: event.type });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
