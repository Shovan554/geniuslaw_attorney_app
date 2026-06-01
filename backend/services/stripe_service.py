"""
Attorney-app Stripe integration — setup-only (vault a card, never charge it).

Creates a Stripe Customer for the attorney and attaches a card via a
SetupIntent presented by the mobile PaymentSheet. We persist `customer_id`
plus the saved card's `brand`/`last4` on the `attorneys` row. There is NO
PaymentIntent and NO charge anywhere in this module.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import stripe

from services.supabase_client import get_supabase

log = logging.getLogger(__name__)


def _require(env: str) -> str:
    value = os.environ.get(env)
    if not value:
        raise RuntimeError(f"Missing required env var: {env}")
    return value


def _configure() -> None:
    stripe.api_key = _require("STRIPE_SECRET_KEY")


def get_publishable_key() -> str:
    return _require("STRIPE_PUBLISHABLE_KEY")


def get_or_create_attorney_customer(attorney_row: dict) -> str:
    """Return the attorney's Stripe customer id, creating + persisting if blank."""
    _configure()
    existing = (attorney_row.get("customer_id") or "").strip()
    if existing:
        return existing

    customer = stripe.Customer.create(
        email=(attorney_row.get("email") or "") or None,
        name=(attorney_row.get("full_name") or "") or None,
        metadata={"attorney_id": str(attorney_row["id"])},
    )

    get_supabase().table("attorneys").update(
        {"customer_id": customer.id}
    ).eq("id", attorney_row["id"]).execute()
    return customer.id


def create_setup_bundle(attorney_row: dict) -> dict[str, Any]:
    """Build the bundle the mobile PaymentSheet needs to attach a card.

    Returns: { setup_intent_client_secret, ephemeral_key, customer_id,
               publishable_key }.
    """
    _configure()
    customer_id = get_or_create_attorney_customer(attorney_row)

    ephemeral = stripe.EphemeralKey.create(
        customer=customer_id,
        stripe_version="2024-06-20",
    )
    setup_intent = stripe.SetupIntent.create(
        customer=customer_id,
        automatic_payment_methods={"enabled": True},
    )
    return {
        "setup_intent_client_secret": setup_intent.client_secret,
        "ephemeral_key": ephemeral.secret,
        "customer_id": customer_id,
        "publishable_key": get_publishable_key(),
    }


def sync_saved_card(attorney_row: dict) -> dict[str, str] | None:
    """Read the customer's most recent card, persist brand/last4, return them.

    Returns { brand, last4 } or None when no card is attached.
    """
    _configure()
    customer_id = (attorney_row.get("customer_id") or "").strip()
    if not customer_id:
        return None

    methods = stripe.PaymentMethod.list(customer=customer_id, type="card")
    data = getattr(methods, "data", None) or []
    if not data:
        get_supabase().table("attorneys").update(
            {"card_brand": None, "card_last4": None}
        ).eq("id", attorney_row["id"]).execute()
        return None

    card = data[0].card
    brand, last4 = card.brand, card.last4
    get_supabase().table("attorneys").update(
        {"card_brand": brand, "card_last4": last4}
    ).eq("id", attorney_row["id"]).execute()
    return {"brand": brand, "last4": last4}
