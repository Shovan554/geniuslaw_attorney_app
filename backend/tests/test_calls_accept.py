"""Attorney accepting a client-initiated call (attorney is the callee)."""

import pytest
from fastapi import HTTPException

import services.calls_service as calls_svc


class _Q:
    def __init__(self, store, name):
        self.store, self.name, self.payload = store, name, None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.payload is not None:
            self.store["updates"].append((self.name, self.payload))

        class R:
            pass

        r = R()
        r.data = self.store.get(self.name, [])
        return r


class _SB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _Q(self.store, name)


def _call(status="initiated"):
    return {
        "id": "c1",
        "caller_user_id": 42,
        "callee_user_id": 90,
        "daily_room_name": "call-abc",
        "daily_room_url": "https://x.daily.co/call-abc",
        "status": status,
        "is_video": False,
    }


@pytest.fixture
def patched(monkeypatch):
    def make(call):
        store = {"calls": [call], "updates": []}
        monkeypatch.setattr(calls_svc, "get_supabase", lambda: _SB(store))
        monkeypatch.setattr(calls_svc, "_mint_meeting_token", lambda room, name: "tok")
        names = {42: "Anthony Kane", 90: "Attorney Jane"}
        monkeypatch.setattr(calls_svc, "_display_name_for_user", lambda uid: names[uid])
        return store

    return make


def test_accept_returns_caller_name_and_marks_answered(patched):
    store = patched(_call())
    res = calls_svc.accept_call_for_user("c1", 90)
    assert res.caller_name == "Anthony Kane"
    assert res.daily_meeting_token == "tok"
    assert store["updates"][0][1]["status"] == "answered"


@pytest.mark.parametrize("status", ["cancelled", "missed", "rejected", "completed", "failed"])
def test_accept_refuses_a_call_that_already_ended(patched, status):
    store = patched(_call(status))
    with pytest.raises(HTTPException) as exc:
        calls_svc.accept_call_for_user("c1", 90)
    assert exc.value.status_code == 409
    assert store["updates"] == []


def test_accept_rejects_non_callee(patched):
    patched(_call())
    with pytest.raises(HTTPException) as exc:
        calls_svc.accept_call_for_user("c1", 42)
    assert exc.value.status_code == 403
