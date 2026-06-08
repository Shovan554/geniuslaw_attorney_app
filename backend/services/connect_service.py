"""
Attorney Pronto onboarding — Stripe Connect (firm payouts) setup.

Creates a Stripe Express connected account for the attorney's LAW FIRM and hands
back a hosted onboarding (AccountLink) URL. Readiness is detected by
poll-on-return: refresh_connect_status() re-reads the account and, once Stripe
reports payouts_enabled, promotes the working account id to the firm's
destination_connect_id — the id Pronto payment routing reads.

Firm-level: the connected account lives on law_firms, shared by every attorney
in the firm (first-come; no firm-admin concept). connect_account_id is the
resume handle (written at creation, even mid-onboarding); destination_connect_id
is written ONLY when payouts are actually enabled. Reuses the same Stripe
api_key as the card-vault and KYC integrations; those modules are untouched.
"""
from __future__ import annotations

import logging
import os

import stripe

from services.stripe_service import _configure
from services.supabase_client import get_supabase

log = logging.getLogger(__name__)

FIRM_SELECT = "id,name,connect_account_id,destination_connect_id"


def _return_url() -> str:
    url = os.environ.get("STRIPE_CONNECT_RETURN_URL")
    if not url:
        raise RuntimeError("Missing required env var: STRIPE_CONNECT_RETURN_URL")
    return url


def _fetch_firm(firm_id: int) -> dict | None:
    resp = (
        get_supabase()
        .table("law_firms")
        .select(FIRM_SELECT)
        .eq("id", firm_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def firm_payouts_ready(firm_id: int) -> bool:
    """True when the firm already has a payout-ready destination_connect_id."""
    firm = _fetch_firm(firm_id)
    return bool(firm and (firm.get("destination_connect_id") or "").strip())


def start_connect_onboarding(attorney_row: dict) -> dict:
    """Ensure the firm has an Express account; return a hosted onboarding link.

    Returns {"status": "ready"} when the firm is already payout-ready (no link
    needed), else {"status": "pending", "url": <account_link_url>}.
    """
    _configure()
    firm_id = attorney_row["firm_id"]
    firm = _fetch_firm(firm_id)
    if firm and (firm.get("destination_connect_id") or "").strip():
        return {"status": "ready"}

    account_id = (firm.get("connect_account_id") if firm else None) or None
    if not account_id:
        account = stripe.Account.create(
            type="express",
            country="US",
            email=(attorney_row.get("email") or "") or None,
            capabilities={"transfers": {"requested": True}},
            metadata={"firm_id": str(firm_id)},
        )
        account_id = account.id
        get_supabase().table("law_firms").update(
            {"connect_account_id": account_id}
        ).eq("id", firm_id).execute()

    link = stripe.AccountLink.create(
        account=account_id,
        refresh_url=_return_url(),
        return_url=_return_url(),
        type="account_onboarding",
    )
    return {"status": "pending", "url": link.url}


def refresh_connect_status(attorney_row: dict) -> dict:
    """Re-read the firm's account; promote to destination_connect_id when ready.

    Returns {"status": "ready" | "pending" | "none"}.
    """
    _configure()
    firm_id = attorney_row["firm_id"]
    firm = _fetch_firm(firm_id)
    if firm and (firm.get("destination_connect_id") or "").strip():
        return {"status": "ready"}

    account_id = (firm.get("connect_account_id") if firm else None) or None
    if not account_id:
        return {"status": "none"}

    account = stripe.Account.retrieve(account_id)
    if getattr(account, "payouts_enabled", False):
        get_supabase().table("law_firms").update(
            {"destination_connect_id": account_id}
        ).eq("id", firm_id).execute()
        return {"status": "ready"}
    return {"status": "pending"}
