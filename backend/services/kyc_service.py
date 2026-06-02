"""
Attorney Pronto onboarding — KYC (Stripe Identity) + terms acceptance.

Creates a Stripe Identity VerificationSession (document + selfie/liveness) for
the attorney, tracks its result on the `attorneys` row (`kyc_verified`,
`kyc_session_id`), and records acceptance of the Pronto platform-fee terms
(`pronto_terms_accepted`, `pronto_terms_accepted_at`). No charges anywhere.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import stripe

from services.stripe_service import _configure, get_publishable_key
from services.supabase_client import get_supabase

log = logging.getLogger(__name__)


class OnboardingError(ValueError):
    """Raised when a step's prerequisites are not met."""


def compute_onboarding_status(attorney_row: dict) -> dict[str, bool]:
    """Pure: derive the four onboarding flags from an attorney row."""
    return {
        "pronto_enabled": bool(attorney_row.get("pronto_enabled")),
        "kyc_verified": bool(attorney_row.get("kyc_verified")),
        "has_card": bool((attorney_row.get("card_last4") or "").strip()),
        "terms_accepted": bool(attorney_row.get("pronto_terms_accepted")),
    }


def create_kyc_session(attorney_row: dict) -> dict[str, Any]:
    """Create a Stripe Identity VerificationSession + ephemeral key for the app.

    Persists the session id on the attorney row. Returns the bundle the mobile
    Identity sheet needs: { session_id, ephemeral_key_secret, publishable_key }.
    """
    _configure()
    session = stripe.identity.VerificationSession.create(
        type="document",
        options={"document": {"require_matching_selfie": True}},
        provided_details={"email": (attorney_row.get("email") or "") or None},
        metadata={"attorney_id": str(attorney_row["id"])},
    )
    ephemeral = stripe.EphemeralKey.create(
        verification_session=session.id,
        stripe_version="2024-06-20",
    )
    get_supabase().table("attorneys").update(
        {"kyc_session_id": session.id}
    ).eq("id", attorney_row["id"]).execute()
    return {
        "session_id": session.id,
        "ephemeral_key_secret": ephemeral.secret,
        "publishable_key": get_publishable_key(),
    }


def refresh_kyc_status(attorney_row: dict) -> dict[str, Any]:
    """Retrieve the attorney's Identity session; persist kyc_verified when verified.

    Returns { kyc_verified, status } where status is Stripe's session status
    (requires_input | processing | verified | canceled), or "none" when no
    session has been started yet.
    """
    _configure()
    session_id = (attorney_row.get("kyc_session_id") or "").strip()
    if not session_id:
        return {"kyc_verified": bool(attorney_row.get("kyc_verified")), "status": "none"}

    session = stripe.identity.VerificationSession.retrieve(session_id)
    verified = session.status == "verified"
    if verified and not attorney_row.get("kyc_verified"):
        get_supabase().table("attorneys").update(
            {"kyc_verified": True}
        ).eq("id", attorney_row["id"]).execute()
    return {"kyc_verified": verified, "status": session.status}
