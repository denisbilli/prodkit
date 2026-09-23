class WebhooksController < ApplicationController
  skip_before_action :verify_authenticity_token

  def stripe
    webhook_body = request.body.read
    sig_header = request.env["HTTP_STRIPE_SIGNATURE"]
    Provider::Stripe.new.process_webhook_later(webhook_body, sig_header)
    head :ok
  rescue Stripe::SignatureVerificationError
    head :bad_request
  end
end
