"""Attorney -> client message push: a client_notifications row the Clients
backend dispatcher turns into an Expo push."""

import services.message_notifications as mn


class _Q:
    def __init__(self, store, name):
        self.store, self.name, self.filters, self.payload = store, name, {}, None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters[col] = val
        return self

    def limit(self, *_a, **_k):
        return self

    def insert(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.payload is not None:
            if self.store.get("fail_insert"):
                raise RuntimeError("check constraint violated")
            self.store["inserts"].append((self.name, self.payload))

        class R:
            pass

        r = R()
        rows = self.store.get(self.name, [])
        r.data = [
            row for row in rows if all(row.get(k) == v for k, v in self.filters.items())
        ]
        return r


class _SB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _Q(self.store, name)


def _store(**extra):
    base = {
        "users": [{"id": 8, "full_name": None, "email": "jane@firm.com", "attorney_id": None}],
        "attorneys": [{"id": 4, "full_name": "Jane Smith", "email": "jane@firm.com"}],
        "inserts": [],
    }
    base.update(extra)
    return base


def test_preview_truncates_long_bodies():
    assert mn.message_preview("hi") == "hi"
    long = "x" * 300
    out = mn.message_preview(long)
    assert len(out) <= 200 and out.endswith("…")


def test_notifies_client_with_attorney_name():
    store = _store()
    ok = mn.notify_client_of_message(_SB(store), client_id=1, sender_user_id=8, body="See you Monday")
    assert ok is True
    table, row = store["inserts"][0]
    assert table == "client_notifications"
    assert row == {
        "client_id": 1,
        "genre": "message",
        "short_description": "New message from Jane Smith",
        "long_description": "See you Monday",
        "link_type": "message",
        "link_id": None,
    }


def test_prefers_users_full_name():
    store = _store(users=[{"id": 8, "full_name": "J. Smith Esq", "email": "jane@firm.com", "attorney_id": None}])
    mn.notify_client_of_message(_SB(store), client_id=1, sender_user_id=8, body="hi")
    assert store["inserts"][0][1]["short_description"] == "New message from J. Smith Esq"


def test_falls_back_to_generic_sender():
    store = _store(users=[], attorneys=[])
    mn.notify_client_of_message(_SB(store), client_id=1, sender_user_id=8, body="hi")
    assert store["inserts"][0][1]["short_description"] == "New message from your attorney"


def test_skips_conversation_without_client():
    store = _store()
    assert mn.notify_client_of_message(_SB(store), client_id=None, sender_user_id=8, body="hi") is False
    assert store["inserts"] == []


def test_insert_failure_never_raises():
    store = _store(fail_insert=True)
    assert mn.notify_client_of_message(_SB(store), client_id=1, sender_user_id=8, body="hi") is False
