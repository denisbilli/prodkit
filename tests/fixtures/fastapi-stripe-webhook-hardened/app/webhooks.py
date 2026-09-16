import os

import stripe
from fastapi import APIRouter, Request, Response

router = APIRouter()


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request) -> Response:
    signature = request.headers.get("stripe-signature")
    secret = os.environ["STRIPE_WEBHOOK_SECRET"]

    # The bytes as sent: the signature covers them, not the parsed object.
    payload = await request.body()

    try:
        stripe.Webhook.construct_event(payload, signature, secret)
    except ValueError:
        return Response(status_code=400)

    return Response(status_code=200)
