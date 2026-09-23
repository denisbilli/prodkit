export const createStripeAccount = (params) => (dispatch, getState, sdk) =>
  sdk.stripeAccount.create(params, { expand: true }).then((response) => {
    const stripeConnectAccount = response.data.data;
    dispatch({ type: 'app/stripeConnectAccount/CREATE_SUCCESS', payload: stripeConnectAccount });
    return stripeConnectAccount;
  });
