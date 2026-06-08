import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture
def stripe_stub(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_stub")
    monkeypatch.setenv("STRIPE_CONNECT_RETURN_URL", "https://example.com/connect/return")
    import services.connect_service as svc

    stripe = types.SimpleNamespace()
    stripe.api_key = None
    stripe.Account = types.SimpleNamespace(
        create=MagicMock(return_value=types.SimpleNamespace(id="acct_NEW", payouts_enabled=False)),
        retrieve=MagicMock(return_value=types.SimpleNamespace(id="acct_NEW", payouts_enabled=False)),
    )
    stripe.AccountLink = types.SimpleNamespace(
        create=MagicMock(return_value=types.SimpleNamespace(url="https://connect.stripe.com/setup/abc")),
    )
    monkeypatch.setattr(svc, "stripe", stripe)
    return stripe


@pytest.fixture
def supabase_stub(monkeypatch):
    import services.connect_service as svc
    sb = MagicMock()
    monkeypatch.setattr(svc, "get_supabase", lambda: sb)
    return sb


def _set_firm(sb, firm):
    """Make _fetch_firm() return `firm` (a dict) or None when firm is None."""
    sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
        types.SimpleNamespace(data=[firm] if firm else [])
    )


def test_firm_payouts_ready_true(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "destination_connect_id": "acct_LIVE"})
    assert svc.firm_payouts_ready(5) is True


def test_firm_payouts_ready_false_when_blank(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "destination_connect_id": "  "})
    assert svc.firm_payouts_ready(5) is False


def test_start_returns_ready_when_destination_set(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "destination_connect_id": "acct_LIVE"})
    out = svc.start_connect_onboarding({"id": 7, "firm_id": 5, "email": "a@b.co"})
    assert out == {"status": "ready"}
    stripe_stub.Account.create.assert_not_called()
    stripe_stub.AccountLink.create.assert_not_called()


def test_start_creates_account_and_returns_link(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": None, "destination_connect_id": None})
    out = svc.start_connect_onboarding({"id": 7, "firm_id": 5, "email": "a@b.co"})
    assert out == {"status": "pending", "url": "https://connect.stripe.com/setup/abc"}
    stripe_stub.Account.create.assert_called_once()
    stripe_stub.AccountLink.create.assert_called_once()
    supabase_stub.table.assert_any_call("law_firms")
    supabase_stub.table.return_value.update.assert_any_call({"connect_account_id": "acct_NEW"})


def test_start_reuses_existing_account(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": "acct_OLD", "destination_connect_id": None})
    out = svc.start_connect_onboarding({"id": 7, "firm_id": 5, "email": "a@b.co"})
    assert out["status"] == "pending"
    stripe_stub.Account.create.assert_not_called()
    stripe_stub.AccountLink.create.assert_called_once()
    _, kwargs = stripe_stub.AccountLink.create.call_args
    assert kwargs["account"] == "acct_OLD"


def test_refresh_none_when_no_account(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": None, "destination_connect_id": None})
    out = svc.refresh_connect_status({"id": 7, "firm_id": 5})
    assert out == {"status": "none"}
    stripe_stub.Account.retrieve.assert_not_called()


def test_refresh_promotes_when_payouts_enabled(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": "acct_OLD", "destination_connect_id": None})
    stripe_stub.Account.retrieve.return_value = types.SimpleNamespace(id="acct_OLD", payouts_enabled=True)
    out = svc.refresh_connect_status({"id": 7, "firm_id": 5})
    assert out == {"status": "ready"}
    supabase_stub.table.assert_any_call("law_firms")
    supabase_stub.table.return_value.update.assert_any_call({"destination_connect_id": "acct_OLD"})


def test_refresh_pending_when_not_enabled(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": "acct_OLD", "destination_connect_id": None})
    stripe_stub.Account.retrieve.return_value = types.SimpleNamespace(id="acct_OLD", payouts_enabled=False)
    out = svc.refresh_connect_status({"id": 7, "firm_id": 5})
    assert out == {"status": "pending"}


def test_refresh_ready_shortcircuits(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": "acct_OLD", "destination_connect_id": "acct_OLD"})
    out = svc.refresh_connect_status({"id": 7, "firm_id": 5})
    assert out == {"status": "ready"}
    stripe_stub.Account.retrieve.assert_not_called()
