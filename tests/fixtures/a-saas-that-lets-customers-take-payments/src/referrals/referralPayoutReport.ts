export function referralPayouts(payments: { amount: number }[], commissionRate: number) {
  return payments.map((p) => ({ payout_amount: p.amount * commissionRate }));
}
