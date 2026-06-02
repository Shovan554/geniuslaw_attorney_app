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
