# Local ActivityPub C2S instance

This Compose stack runs the real [ONI server](https://github.com/mariusor/oni), a single-user ActivityPub implementation, behind Caddy. Both images are pinned by digest. The ONI image is upstream `master-58be49b` (development build), Linux AMD64; Apple Silicon requires container emulation. This is a local C2S integration environment, not a public federation deployment.

## Start and seed

Requires Docker Compose and Python 3; the scripts use only Python's standard library.

```sh
docker compose up -d
python3 scripts/c2s-seed.py
python3 scripts/c2s-smoke.py
```

The seed waits up to 60 seconds for Caddy's certificate and the HTTPS actor endpoint to become ready. On timeout, check `docker compose ps` and logs before retrying. Only readiness reads are retried; OAuth and post creation requests are never automatically retried. The seed exports Caddy's CA to `.local/c2s-root.crt`, obtains a real OAuth bearer token, and writes it privately to `.local/c2s-credentials.json`. It creates three public Notes, including a reply, by POSTing Create activities to ONI's outbox. Rerunning refreshes the token without duplicating the seed while its marker post still exists.

Connect Kimino with actor URL `https://localhost:8443/` and the token from that credentials file. These are development credentials, and `.local/` must stay ignored. The known bootstrap password is `kimino-local-only`; the service is bound only to the host loopback interface. The fixture currently exercises one real actor's own posts and reply. It does not claim to test two-server federation.

## Browser certificate

ONI always assigns HTTPS canonical actor IDs, so an HTTP-only server is insufficient. Caddy generates a local CA. The scripts trust that CA explicitly; they never disable certificate verification or change the machine trust store.

For manual browsing, import `.local/c2s-root.crt` into your browser's trusted certificate authorities, or deliberately accept the certificate exception at `https://localhost:8443/` if your browser supports it. Installing trust is a user action. Automated Playwright tests can use `ignoreHTTPSErrors: true` for this local fixture only. Caddy permits the upstream CORS response and exposes `Location`; preflight and authenticated collection reads are verified by the smoke script.

## Useful commands

```sh
docker compose ps
docker compose logs --tail 50
docker compose stop
```

To deliberately discard this development server's posts, tokens and CA, run `docker compose down --volumes`, remove `.local/c2s-seeded.json`, then start and seed again. Existing browser trust will need updating because the replacement CA is different.

## Protocol details observed against this image

- Actor: `https://localhost:8443/`; inbox `/inbox`; outbox `/outbox`.
- Authentication: `/oauth/token`, form `grant_type=client_credentials`, `client_id` equal to the full actor URL, and `client_secret` equal to the development password. URL client IDs contain colons, so use form encoding rather than naive `curl -u` parsing.
- A successful outbox POST returns HTTP 201 and `Location`. Its JSON body contains status metadata; fetch `Location` to retrieve the stored Create activity.
- Outbox reads return an `OrderedCollectionPage` containing embedded `orderedItems`, including actor bootstrap activities that a Note timeline should ignore.
- Seeded posts appear in the outbox. An empty inbox is legitimate when no other actor has delivered activities.
- `POST Like`/`Announce` to the outbox return HTTP 201 without `Location`; the stored activity then appears on the first outbox page with its Note embedded. `POST Undo` of such an activity currently returns HTTP 400. `python3 scripts/c2s-interactions-probe.py` re-checks these facts by writing real reactions to the local fixture.
- Development ONI builds do not use production-compatible federation signatures. Public S2S federation is outside this fixture's scope.

References: [ONI setup](https://mariusor.srht.site/apps/oni/index.html), [ONI OAuth](https://mariusor.srht.site/apps/oni/third-party-oauth-client.html), [W3C ActivityPub C2S](https://www.w3.org/TR/activitypub/#client-to-server-interactions).
