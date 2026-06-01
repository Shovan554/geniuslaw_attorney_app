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
    """Replace the `stripe` module imported by stripe_service with a stub."""
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_stub")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_stub")
    import services.stripe_service as svc

    stripe = types.SimpleNamespace()
    stripe.api_key = None

    customer = types.SimpleNamespace(id="cus_NEW")
    stripe.Customer = types.SimpleNamespace(create=MagicMock(return_value=customer))

    ek = types.SimpleNamespace(secret="ek_secret_123")
    stripe.EphemeralKey = types.SimpleNamespace(create=MagicMock(return_value=ek))

    si = types.SimpleNamespace(client_secret="seti_secret_123")
    stripe.SetupIntent = types.SimpleNamespace(create=MagicMock(return_value=si))

    pm = types.SimpleNamespace(
        card=types.SimpleNamespace(brand="visa", last4="4242")
    )
    stripe.PaymentMethod = types.SimpleNamespace(
        list=MagicMock(return_value=types.SimpleNamespace(data=[pm]))
    )

    monkeypatch.setattr(svc, "stripe", stripe)
    return stripe


@pytest.fixture
def supabase_stub(monkeypatch):
    import services.stripe_service as svc

    sb = MagicMock()
    monkeypatch.setattr(svc, "get_supabase", lambda: sb)
    return sb


def test_get_or_create_customer_reuses_existing(stripe_stub, supabase_stub):
    import services.stripe_service as svc

    row = {"id": 7, "customer_id": "cus_EXISTING", "email": "a@b.co", "full_name": "A"}
    assert svc.get_or_create_attorney_customer(row) == "cus_EXISTING"
    stripe_stub.Customer.create.assert_not_called()


def test_get_or_create_customer_creates_and_persists(stripe_stub, supabase_stub):
    import services.stripe_service as svc

    row = {"id": 7, "customer_id": None, "email": "a@b.co", "full_name": "A"}
    cid = svc.get_or_create_attorney_customer(row)

    assert cid == "cus_NEW"
    stripe_stub.Customer.create.assert_called_once()
    supabase_stub.table.assert_called_with("attorneys")


def test_create_setup_bundle_shape(stripe_stub, supabase_stub, monkeypatch):
    import services.stripe_service as svc

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_x")
    row = {"id": 7, "customer_id": "cus_EXISTING", "email": "a@b.co", "full_name": "A"}

    bundle = svc.create_setup_bundle(row)
    assert bundle == {
        "setup_intent_client_secret": "seti_secret_123",
        "ephemeral_key": "ek_secret_123",
        "customer_id": "cus_EXISTING",
        "publishable_key": "pk_test_x",
    }


def test_sync_saved_card_persists_brand_last4(stripe_stub, supabase_stub):
    import services.stripe_service as svc

    row = {"id": 7, "customer_id": "cus_EXISTING"}
    card = svc.sync_saved_card(row)

    assert card == {"brand": "visa", "last4": "4242"}
    supabase_stub.table.assert_called_with("attorneys")


def test_sync_saved_card_no_customer_returns_none(stripe_stub, supabase_stub):
    import services.stripe_service as svc

    assert svc.sync_saved_card({"id": 7, "customer_id": None}) is None
