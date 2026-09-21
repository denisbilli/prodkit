"""Charging happens through the processors declared in pyproject.toml."""

import stripe


def charge(order_id: str, amount_cents: int) -> str:
    intent = stripe.PaymentIntent.create(amount=amount_cents, currency="eur")
    return intent.id
