async function placeOrder(buyerId, listingId, total) {
  const order = await db.orders.create({ buyerId, listingId, total })
  await stripe.transfers.create({ amount: total, currency: 'usd', destination: order.sellerAccountId })
  return order
}

module.exports = { placeOrder }
