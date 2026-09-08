#!/usr/bin/env python3
"""Development probe: how does the local ONI fixture handle C2S reactions?

This script WRITES to the running fixture (like the seed script): it posts one
real Like and one real Announce of the newest seeded Note to the actor's outbox,
then attempts to Undo each of them. Nothing is cleaned up afterwards, because
Undo is exactly what the fixture rejects.

Observed against the pinned ONI image (see dev/README.md):

- ``POST Like`` / ``POST Announce`` -> 201 Created **without** a Location header.
  The stored activity then appears on the outbox first page with the Note embedded.
- ``POST Undo {object: <like or announce IRI>}`` -> 400 Bad Request. The Kimino
  client reports this to the user; it does not retry.

Requires ``python3 scripts/c2s-seed.py`` to have created ``.local/``. Prints only
status codes, header presence, and activity types. It never prints credentials,
tokens, or response bodies.
"""

import json
import ssl
import urllib.error
import urllib.request
from pathlib import Path

LOCAL = Path(__file__).resolve().parents[1] / ".local"
PUBLIC = "https://www.w3.org/ns/activitystreams#Public"
CONTEXT = "https://www.w3.org/ns/activitystreams"


def main() -> None:
    credentials = json.loads((LOCAL / "c2s-credentials.json").read_text())
    tls = ssl.create_default_context(cafile=str(LOCAL / "c2s-root.crt"))
    headers = {
        "Accept": "application/activity+json",
        "Authorization": "Bearer " + credentials["token"],
    }

    def call(url, body=None):
        """Return (status, has_location, parsed_json_or_None). Never retries."""
        data = json.dumps(body).encode() if body is not None else None
        extra = {"Content-Type": "application/activity+json"} if body is not None else {}
        request = urllib.request.Request(
            url, data=data, headers={**headers, **extra}, method="POST" if body else "GET"
        )
        try:
            with urllib.request.urlopen(request, context=tls) as response:
                raw = response.read()
                status, location = response.status, response.headers.get("Location")
        except urllib.error.HTTPError as error:
            raw = error.read()
            status, location = error.code, error.headers.get("Location")
        try:
            parsed = json.loads(raw) if raw else None
        except ValueError:
            parsed = None
        return status, bool(location), parsed

    def first_page(outbox):
        status, _, collection = call(outbox)
        if status != 200 or not isinstance(collection, dict):
            raise SystemExit(f"outbox read failed: {status}")
        if "orderedItems" not in collection and collection.get("first"):
            status, _, collection = call(collection["first"])
        return (collection or {}).get("orderedItems", [])

    def activity(kind, target):
        return {"@context": CONTEXT, "type": kind, "actor": actor["id"], "object": target, "to": [PUBLIC]}

    status, _, actor = call(credentials["actorUrl"])
    if status != 200 or not isinstance(actor, dict):
        raise SystemExit(f"actor read failed: {status}")
    items = first_page(actor["outbox"])
    note = next(
        (
            (item.get("object") if isinstance(item.get("object"), str) else (item.get("object") or {}).get("id"))
            for item in items
            if isinstance(item, dict) and item.get("type") == "Create"
        ),
        None,
    )
    print("target note found:", bool(note))
    if not note:
        raise SystemExit("seed the fixture first: python3 scripts/c2s-seed.py")

    for kind in ("Like", "Announce"):
        status, has_location, _ = call(actor["outbox"], activity(kind, note))
        print(f"{kind} -> {status}, Location present: {has_location}")

    items = first_page(actor["outbox"])
    print("outbox first page types:", [i.get("type") if isinstance(i, dict) else "iri" for i in items][:12])
    for item in items:
        if isinstance(item, dict) and item.get("type") in ("Like", "Announce") and item.get("id"):
            status, has_location, _ = call(actor["outbox"], activity("Undo", item["id"]))
            print(f"Undo {item['type']} -> {status}, Location present: {has_location}")
    items = first_page(actor["outbox"])
    print("after undo, first page types:", [i.get("type") if isinstance(i, dict) else "iri" for i in items][:8])


if __name__ == "__main__":
    main()
