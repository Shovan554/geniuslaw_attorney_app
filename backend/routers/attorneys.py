from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse

from middleware.auth_middleware import require_attorney_role
from models.attorney import (
    AttorneyProfile,
    AttorneyProfileUpdate,
    PracticeArea,
    PracticeAreasResult,
    PracticeAreasUpdate,
)
from models.vault import VaultCard, VaultSetupBundle
from models.onboarding import (
    ConnectRefreshResult,
    ConnectStartResult,
    KycRefreshResult,
    KycSessionBundle,
    OnboardingStatus,
    TermsAcceptResult,
)
from services import connect_service
from services import kyc_service
from services import stripe_service
from services.supabase_client import get_supabase

router = APIRouter(prefix="/attorneys", tags=["attorneys"])

ATTORNEY_SELECT = "id,firm_id,full_name,email,phone,address,bar_number,title,bio,status,practice_areas,customer_id,card_brand,card_last4,pronto_enabled,kyc_verified,kyc_session_id,pronto_terms_accepted"


def _fetch_user_email(user_id: int) -> str | None:
    sb = get_supabase()
    resp = sb.table("users").select("email").eq("id", user_id).limit(1).execute()
    rows = resp.data or []
    return rows[0]["email"] if rows else None


def _fetch_attorney_by_email(email: str) -> dict | None:
    sb = get_supabase()
    resp = (
        sb.table("attorneys")
        .select(ATTORNEY_SELECT)
        .eq("email", email.strip().lower())
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def _fetch_firm_name(firm_id: int) -> str | None:
    sb = get_supabase()
    resp = sb.table("law_firms").select("name").eq("id", firm_id).limit(1).execute()
    rows = resp.data or []
    return rows[0]["name"] if rows else None


def _profile_from_row(row: dict) -> AttorneyProfile:
    firm_name = _fetch_firm_name(row["firm_id"])
    return AttorneyProfile(**row, firm_name=firm_name)


def _current_attorney_row(token: dict) -> dict:
    user_id = int(token["sub"])
    email = _fetch_user_email(user_id)
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    attorney = _fetch_attorney_by_email(email)
    if not attorney:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attorney profile not found.")
    return attorney


@router.get("/me", response_model=AttorneyProfile)
def get_me(token: dict = Depends(require_attorney_role)) -> AttorneyProfile:
    user_id = int(token["sub"])
    email = _fetch_user_email(user_id)
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    attorney = _fetch_attorney_by_email(email)
    if not attorney:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attorney profile not found.")

    return _profile_from_row(attorney)


@router.patch("/me", response_model=AttorneyProfile)
def update_me(
    payload: AttorneyProfileUpdate,
    token: dict = Depends(require_attorney_role),
) -> AttorneyProfile:
    user_id = int(token["sub"])
    current_email = _fetch_user_email(user_id)
    if not current_email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    attorney = _fetch_attorney_by_email(current_email)
    if not attorney:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attorney profile not found.")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return _profile_from_row(attorney)

    new_email = updates.get("email")
    if isinstance(new_email, str):
        new_email = new_email.strip().lower()
        updates["email"] = new_email

    sb = get_supabase()

    if new_email and new_email != current_email:
        conflict = (
            sb.table("users")
            .select("id")
            .eq("email", new_email)
            .neq("id", user_id)
            .limit(1)
            .execute()
        )
        if conflict.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email is already in use.",
            )

    sb.table("attorneys").update(updates).eq("id", attorney["id"]).execute()

    user_updates: dict = {}
    if new_email and new_email != current_email:
        user_updates["email"] = new_email
    if "full_name" in updates and updates["full_name"]:
        user_updates["full_name"] = updates["full_name"]
    if user_updates:
        sb.table("users").update(user_updates).eq("id", user_id).execute()

    refreshed = _fetch_attorney_by_email(new_email or current_email)
    if not refreshed:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load updated profile.")
    return _profile_from_row(refreshed)


@router.post("/me/vault/setup", response_model=VaultSetupBundle)
def vault_setup(token: dict = Depends(require_attorney_role)) -> VaultSetupBundle:
    attorney = _current_attorney_row(token)
    bundle = stripe_service.create_setup_bundle(attorney)
    return VaultSetupBundle(**bundle)


@router.get("/me/vault/card", response_model=VaultCard | None)
def vault_card(token: dict = Depends(require_attorney_role)) -> VaultCard | None:
    attorney = _current_attorney_row(token)
    card = stripe_service.sync_saved_card(attorney)
    return VaultCard(**card) if card else None


@router.get("/me/onboarding", response_model=OnboardingStatus)
def onboarding_status(token: dict = Depends(require_attorney_role)) -> OnboardingStatus:
    attorney = _current_attorney_row(token)
    flags = kyc_service.compute_onboarding_status(attorney)
    flags["connect_ready"] = connect_service.firm_payouts_ready(attorney["firm_id"])
    return OnboardingStatus(**flags)


@router.post("/me/kyc/session", response_model=KycSessionBundle)
def kyc_session(token: dict = Depends(require_attorney_role)) -> KycSessionBundle:
    attorney = _current_attorney_row(token)
    return KycSessionBundle(**kyc_service.create_kyc_session(attorney))


@router.post("/me/kyc/refresh", response_model=KycRefreshResult)
def kyc_refresh(token: dict = Depends(require_attorney_role)) -> KycRefreshResult:
    attorney = _current_attorney_row(token)
    return KycRefreshResult(**kyc_service.refresh_kyc_status(attorney))


@router.post("/me/pronto-terms/accept", response_model=TermsAcceptResult)
def pronto_terms_accept(token: dict = Depends(require_attorney_role)) -> TermsAcceptResult:
    attorney = _current_attorney_row(token)
    try:
        result = kyc_service.accept_pronto_terms(attorney)
    except kyc_service.OnboardingError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return TermsAcceptResult(**result)


@router.post("/me/connect/start", response_model=ConnectStartResult)
def connect_start(token: dict = Depends(require_attorney_role)) -> ConnectStartResult:
    attorney = _current_attorney_row(token)
    return ConnectStartResult(**connect_service.start_connect_onboarding(attorney))


@router.post("/me/connect/refresh", response_model=ConnectRefreshResult)
def connect_refresh(token: dict = Depends(require_attorney_role)) -> ConnectRefreshResult:
    attorney = _current_attorney_row(token)
    return ConnectRefreshResult(**connect_service.refresh_connect_status(attorney))


@router.get("/connect/return", response_class=HTMLResponse, include_in_schema=False)
def connect_return() -> HTMLResponse:
    """Public landing page Stripe redirects to after Connect onboarding.

    Unauthenticated on purpose — the browser arriving from Stripe has no token.
    The mobile app re-checks payout readiness on return (poll-on-return), so this
    page only needs to tell the attorney they can go back to the app."""
    # Deep link back into the native app. Reopening the app re-focuses the
    # onboarding screen, which polls /connect/refresh and promotes the firm to
    # payout-ready. Auto-attempt on load, plus a tap fallback (iOS often blocks
    # an automatic custom-scheme redirect but allows it on a user gesture).
    app_link = "geniuslawattorney://pronto-onboarding"
    return HTMLResponse(
        f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GeniusLaw</title>
</head>
<body style="font-family:-apple-system,system-ui,sans-serif;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;background:#0e0e10;color:#fff;text-align:center">
<div style="padding:24px;max-width:360px">
<h2 style="margin:0 0 8px;font-size:22px">You're all set</h2>
<p style="opacity:.7;margin:0 0 24px;line-height:1.5">Payout setup is complete. Tap below to return to the GeniusLaw app.</p>
<a href="{app_link}" style="display:inline-block;padding:14px 28px;border-radius:12px;background:#fff;color:#0e0e10;text-decoration:none;font-weight:600">Return to the app</a>
</div>
<script>setTimeout(function(){{window.location.href="{app_link}";}},400);</script>
</body>
</html>"""
    )


@router.post("/me/pronto/unenroll", response_model=AttorneyProfile)
def pronto_unenroll(token: dict = Depends(require_attorney_role)) -> AttorneyProfile:
    """Leave Pronto. Clears enrollment + terms acceptance + availability so the
    attorney drops out of the live pool. KYC and the saved card are preserved, so
    re-enrolling only needs re-accepting terms and re-selecting practice areas."""
    attorney = _current_attorney_row(token)
    sb = get_supabase()
    sb.table("attorneys").update(
        {
            "pronto_enabled": False,
            "pronto_available": False,
            "pronto_available_since": None,
            "pronto_terms_accepted": False,
            "pronto_terms_accepted_at": None,
        }
    ).eq("id", attorney["id"]).execute()

    refreshed = _fetch_attorney_by_email(attorney["email"])
    if not refreshed:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load updated profile.",
        )
    return _profile_from_row(refreshed)


@router.get("/practice-areas", response_model=list[PracticeArea])
def list_practice_areas(
    _token: dict = Depends(require_attorney_role),
) -> list[PracticeArea]:
    sb = get_supabase()
    resp = (
        sb.table("practice_areas")
        .select("id,name,pre_retainer_required")
        .order("name")
        .execute()
    )
    return [PracticeArea(**row) for row in (resp.data or [])]


@router.patch("/me/practice-areas", response_model=PracticeAreasResult)
def update_practice_areas(
    payload: PracticeAreasUpdate,
    token: dict = Depends(require_attorney_role),
) -> PracticeAreasResult:
    attorney = _current_attorney_row(token)
    sb = get_supabase()

    catalog = sb.table("practice_areas").select("name").execute()
    valid_names = {row["name"] for row in (catalog.data or [])}

    selected: list[str] = []
    for raw in payload.names:
        name = (raw or "").strip()
        if name in valid_names and name not in selected:
            selected.append(name)

    practice_areas = ",".join(selected)
    sb.table("attorneys").update(
        {"practice_areas": practice_areas}
    ).eq("id", attorney["id"]).execute()
    return PracticeAreasResult(practice_areas=practice_areas)
