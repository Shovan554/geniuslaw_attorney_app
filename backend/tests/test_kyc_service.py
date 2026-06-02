import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Make `backend/` importable as the package root (services.*, etc.)
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture
def stripe_stub(monkeypatch):
    """Replace the `stripe` module imported by kyc_service with a stub."""
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_stub")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_stub")
    import services.kyc_service as svc

    stripe = types.SimpleNamespace()
    stripe.api_key = None

    session = types.SimpleNamespace(id="vs_NEW", status="requires_input")
    stripe.identity = types.SimpleNamespace(
        VerificationSession=types.SimpleNamespace(
            create=MagicMock(return_value=session),
            retrieve=MagicMock(return_value=session),
        )
    )

    ek = types.SimpleNamespace(secret="ek_secret_123")
    stripe.EphemeralKey = types.SimpleNamespace(create=MagicMock(return_value=ek))

    monkeypatch.setattr(svc, "stripe", stripe)
    return stripe


@pytest.fixture
def supabase_stub(monkeypatch):
    import services.kyc_service as svc

    sb = MagicMock()
    monkeypatch.setattr(svc, "get_supabase", lambda: sb)
    return sb


def test_compute_onboarding_status_all_false():
    import services.kyc_service as svc
    row = {}
    assert svc.compute_onboarding_status(row) == {
        "pronto_enabled": False, "kyc_verified": False, "has_card": False, "terms_accepted": False,
    }


def test_compute_onboarding_status_reads_flags_and_card():
    import services.kyc_service as svc
    row = {"pronto_enabled": False, "kyc_verified": True, "card_last4": "4242", "pronto_terms_accepted": True}
    assert svc.compute_onboarding_status(row) == {
        "pronto_enabled": False, "kyc_verified": True, "has_card": True, "terms_accepted": True,
    }


def test_compute_onboarding_status_blank_card_is_no_card():
    import services.kyc_service as svc
    assert svc.compute_onboarding_status({"card_last4": "  "})["has_card"] is False


def test_create_kyc_session_shape_and_persist(stripe_stub, supabase_stub, monkeypatch):
    import services.kyc_service as svc
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_x")
    row = {"id": 7, "email": "a@b.co"}
    bundle = svc.create_kyc_session(row)
    assert bundle == {"session_id": "vs_NEW", "ephemeral_key_secret": "ek_secret_123", "publishable_key": "pk_test_x"}
    stripe_stub.identity.VerificationSession.create.assert_called_once()
    stripe_stub.EphemeralKey.create.assert_called_once()
    supabase_stub.table.assert_called_with("attorneys")
