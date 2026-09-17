// The patterns this tool searches for. They are its subject matter, not its usage.
export const SECRET_PATTERNS = [
  /STRIPE_WEBHOOK_SECRET/,
  /STRIPE_SECRET_KEY/,
  /stripeCustomerId/i,
  /\borganization_id\b/,
];
