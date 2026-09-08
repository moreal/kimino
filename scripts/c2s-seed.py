#!/usr/bin/env python3
"""Seed real ONI C2S posts; keep local credentials outside source control."""
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"
ACTOR = "https://localhost:8443/"
PUBLIC = "https://www.w3.org/ns/activitystreams#Public"
LOCAL.mkdir(mode=0o700, exist_ok=True)


def wait_for_actor():
    """Retry only readiness reads, with one shared startup deadline."""
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            cert = subprocess.check_output([
                "docker", "compose", "exec", "-T", "gateway", "cat",
                "/data/caddy/pki/authorities/local/root.crt",
            ], cwd=ROOT, stderr=subprocess.DEVNULL,
                timeout=min(5, max(0.1, deadline - time.monotonic())))
            context = ssl.create_default_context(cadata=cert.decode())
            probe = urllib.request.Request(ACTOR, headers={"Accept": "application/activity+json"})
            with urllib.request.urlopen(probe, context=context,
                    timeout=min(5, max(0.1, deadline - time.monotonic()))) as response:
                actor = json.load(response)
            if isinstance(actor, dict) and actor.get("id") == ACTOR and actor.get("outbox"):
                (LOCAL / "c2s-root.crt").write_bytes(cert)
                return context, actor
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
        time.sleep(min(1, max(0, deadline - time.monotonic())))
    print("ONI was not ready after 60 seconds. Check docker compose ps and logs, then retry.", file=sys.stderr)
    raise SystemExit(1)


context, actor = wait_for_actor()


def request(url, payload=None, token=None, form=False):
    headers = {"Accept": "application/activity+json, application/json"}
    data = None
    if payload is not None:
        data = (urllib.parse.urlencode(payload) if form else json.dumps(payload)).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/activity+json"
    if token:
        headers["Authorization"] = "Bearer " + token
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), context=context, timeout=30) as response:
        body = response.read()
        return json.loads(body) if body else None, response.headers.get("Location")


oauth, _ = request(ACTOR + "oauth/token", {
    "grant_type": "client_credentials", "client_id": ACTOR,
    "client_secret": "kimino-local-only",
}, form=True)
token = oauth["access_token"]
credentials = LOCAL / "c2s-credentials.json"
credentials.write_text(json.dumps({"actorUrl": ACTOR, "token": token}, indent=2) + "\n")
os.chmod(credentials, 0o600)

marker = LOCAL / "c2s-seeded.json"
if marker.exists():
    previous = json.loads(marker.read_text())
    try:
        request(previous["post"], token=token)
    except Exception:
        pass
    else:
        print("ONI already seeded; refreshed credentials in .local/c2s-credentials.json")
        raise SystemExit(0)


def post(content, reply=None):
    note = {"type": "Note", "attributedTo": ACTOR, "content": content, "to": [PUBLIC]}
    if reply:
        note["inReplyTo"] = reply
    activity = {"@context": "https://www.w3.org/ns/activitystreams", "type": "Create", "actor": ACTOR, "to": [PUBLIC], "object": note}
    created, location = request(actor["outbox"], activity, token)
    if not created or "object" not in created:
        created, _ = request(location, token=token)
    return created["object"]["id"]


first = post("<p>A small hello from the other side of the network. This is a real ActivityPub post, stored by ONI.</p>")
reply = post("<p>And a reply, connected by its ActivityStreams inReplyTo property. Conversations can travel with us.</p>", first)
post("<p>Today’s tiny experiment: a quieter timeline, a place to write, and open protocols underneath.</p>")
marker.write_text(json.dumps({"post": first, "reply": reply}, indent=2) + "\n")
print("Seeded three real C2S posts, including a reply.")
print("Actor: " + ACTOR)
print("Token saved privately to .local/c2s-credentials.json")
