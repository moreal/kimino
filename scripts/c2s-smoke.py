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
notes = [item["object"] for item in outbox["orderedItems"] if item.get("type") == "Create" and isinstance(item.get("object"), dict) and item["object"].get("type") == "Note"]
assert len(notes) >= 3, "Run c2s-seed.py before this check"
assert any(note.get("inReplyTo") for note in notes), "Missing seeded reply"
preflight = urllib.request.Request(actor["outbox"], method="OPTIONS", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
with urllib.request.urlopen(preflight, context=context) as response:
    assert response.headers["Access-Control-Allow-Origin"] == origin
    assert "POST" in response.headers["Access-Control-Allow-Methods"]
print("Real ONI actor, authenticated inbox/outbox, stored notes/reply, and browser CORS checks passed.")
