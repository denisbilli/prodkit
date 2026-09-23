const hasCommissionPercentage = (commission) => typeof commission?.percentage === 'number';

exports.transactionLineItems = (listing, orderData, providerCommission) => {
  const order = { code: 'line-item/night', unitPrice: listing.attributes.price, quantity: orderData.nights, includeFor: ['customer', 'provider'] };
  const providerCommissionMaybe = hasCommissionPercentage(providerCommission)
    ? [{ code: 'line-item/provider-commission', unitPrice: order.unitPrice, percentage: -providerCommission.percentage, includeFor: ['provider'] }]
    : [];
  return [order, ...providerCommissionMaybe];
};
