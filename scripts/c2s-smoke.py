#!/usr/bin/env python3
"""Read-only verification against the running, seeded ONI server."""
import json
from pathlib import Path
import ssl
import urllib.request

local = Path(__file__).resolve().parents[1] / ".local"
credentials = json.loads((local / "c2s-credentials.json").read_text())
context = ssl.create_default_context(cafile=str(local / "c2s-root.crt"))
origin = "http://localhost:3000"
headers = {"Accept": "application/activity+json", "Authorization": "Bearer " + credentials["token"], "Origin": origin}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), context=context) as response:
        assert response.headers["Access-Control-Allow-Origin"] == origin
        assert "Location" in response.headers["Access-Control-Expose-Headers"]
        return json.load(response)


actor = get(credentials["actorUrl"])
outbox = get(actor["outbox"])
inbox = get(actor["inbox"])
assert outbox["type"] in ("OrderedCollection", "OrderedCollectionPage")
assert inbox["type"] in ("OrderedCollection", "OrderedCollectionPage")
# The client refuses a walk longer than 100 pages rather than truncating it (ActivityPubClient's
# `maxPages` default in src/activitypub/client.ts; ONI serves 20 outbox rows per page). Every
# tests/c2s.spec.ts run leaves its Creates, Updates and Delete tombstones in this outbox, so the
# fixture grows towards that ceiling and connecting fails with an "unexpected response" once past it.
CLIENT_PAGE_LIMIT, ONI_PAGE_SIZE = 100, 20
total = outbox.get("totalItems")
assert isinstance(total, int), "Outbox declares no totalItems"
assert total <= CLIENT_PAGE_LIMIT * ONI_PAGE_SIZE, (
    f"Outbox holds {total} rows, more than the client's {CLIENT_PAGE_LIMIT}-page walk can read; "
    "reset the fixture: npm run c2s:down -- -v && npm run c2s:up && npm run c2s:seed"
)
print(f"Outbox holds {total} of at most {CLIENT_PAGE_LIMIT * ONI_PAGE_SIZE} readable rows.")
marker = local / "c2s-seeded.json"
assert marker.exists(), "Run c2s-seed.py before this check"
seeded = json.loads(marker.read_text())
# The seeded notes sink below the first page as tests add rows, so they are read by IRI.
assert get(seeded["post"]).get("type") == "Note", "Missing seeded note"
assert get(seeded["reply"]).get("inReplyTo"), "Missing seeded reply"
preflight = urllib.request.Request(actor["outbox"], method="OPTIONS", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
with urllib.request.urlopen(preflight, context=context) as response:
    assert response.headers["Access-Control-Allow-Origin"] == origin
    assert "POST" in response.headers["Access-Control-Allow-Methods"]
print("Real ONI actor, authenticated inbox/outbox, stored notes/reply, and browser CORS checks passed.")
