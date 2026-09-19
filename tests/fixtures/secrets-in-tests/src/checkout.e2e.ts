const STRIPE_SECRET_KEY = "sk_test_placeholder";

export async function checkout(): Promise<string> {
  return STRIPE_SECRET_KEY;
}
