class Provider::Stripe
  def process_webhook_later(webhook_body, sig_header)
    thin_event = client.parse_thin_event(webhook_body, sig_header, ENV.fetch("STRIPE_WEBHOOK_SECRET"))
    StripeEventHandlerJob.perform_later(thin_event.id)
  end

  def create_checkout_session(plan:, customer:)
    client.v1.checkout.sessions.create(customer: customer, mode: "subscription", line_items: [{ price: plan, quantity: 1 }])
  end

  private

  def client
    @client ||= ::Stripe::StripeClient.new(ENV.fetch("STRIPE_SECRET_KEY"))
  end
end
