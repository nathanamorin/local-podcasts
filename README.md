# Local Podcasts

A fully self hosted podcast manager.  Download & save the full history of a podcast on a local server for fast access & play with the Local Podcasts PWA.  This does not currently save podcasts to your device but only saves podcasts on the local server, so will not provide offline / remote access when not on your home network.

# Installation

## Docker
```bash
docker run -p 8080:8080 -v <path to podcast storage directory>:/data ghcr.io/nathanamorin/local-podcasts:<latest release tag here>
```

## Kubernetes
Modify the included Kuberntes manifests ```deployment/deployment.yaml``` to match your environment.
```bash
kubectl apply -f deployment/deployment.yaml
```

Mobile
![Mobile Screenshot](./docs/img/mobile.png)
Desktop
![Desktop Screenshot](./docs/img/desktop.png)

# Database

local-podcasts uses PostgreSQL. Point the server at a database with
`LOCAL_PODCASTS_DB_DSN` (a standard PostgreSQL connection string, e.g.
`postgres://user:password@host:5432/dbname?sslmode=disable`); the server
auto-migrates the schema on startup. `LOCAL_PODCASTS_DB_MAX_OPEN_CONNS`
(default 20) bounds the connection pool size.

Running the test suite (`go test ./...`) requires a reachable PostgreSQL
instance. By default tests connect to
`postgres://postgres:postgres@localhost:5433/local_podcasts_test?sslmode=disable`;
override with `LOCAL_PODCASTS_TEST_DATABASE_URL`. A local instance can be
started with:
```bash
docker run -d --name local-podcasts-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=local_podcasts_test -p 5433:5432 postgres:16
```
Each test runs in its own Postgres schema and cleans up after itself, so the
same instance can be reused across test runs.

For `docker-compose`-based local dev, a `postgres` service is already wired
up in `docker-compose.yml` with `LOCAL_PODCASTS_DB_DSN` pointed at it.

### Migrating from the legacy SQLite database

Deployments predating this change stored data in a SQLite file. `cmd/migrate-sqlite-to-postgres`
is a one-off tool that copies all rows (preserving primary keys) from that
file into a PostgreSQL database:
```bash
go run ./cmd/migrate-sqlite-to-postgres \
  -sqlite /path/to/podcasts.db \
  -postgres "postgres://user:password@host:5432/dbname?sslmode=disable"
```
Run it with the app scaled to 0 replicas (no writer should be active against
the SQLite file during the copy), and only after the destination database
schema has been created (the tool calls `AutoMigrate` itself, so a fresh
database is fine). It's safe to re-run if interrupted: existing rows are
upserted rather than duplicated.

# API Documentation

An OpenAPI 3.0 spec is generated from Go handler annotations (via [swaggo/swag](https://github.com/swaggo/swag)) at build time and served at `/openapi.json`. A [Redoc](https://github.com/Redocly/redoc) UI for browsing it is available at `/doc` (alias: `/docs`), e.g. `http://localhost:8080/doc`. The Redoc UI bundle is vendored and embedded in the binary (`handlers/assets/redoc.standalone.js`), so the docs page has no external/CDN dependencies and works fully offline.

Prometheus metrics (including Go/process runtime metrics and a custom `local_podcasts_episode_downloads_total` counter, labeled by podcast and success/failure) are exposed at `/metrics`. In the deployed cluster this is scraped by a `ServiceMonitor` (see `deployment/deployment.yaml`).

Run `make generate-docs` to regenerate the spec locally before `go build`/`go test`, since the generated `apidocs/` package is not committed to version control.

`POST /podcasts` accepts either a direct RSS feed URL, or an Apple Podcasts show URL (e.g. `https://podcasts.apple.com/us/podcast/the-daily/id1200361736`), which is automatically resolved to its RSS feed via Apple's free iTunes Lookup API.

# Architecture: background jobs & worker pods

Episode downloading and audio fingerprinting (used for ad detection, see below) run as background jobs rather than inline in request handlers, so this work can be scaled out horizontally onto a separate pool of worker pods instead of the single API server.

- The main server (`cmd/server`) owns the PostgreSQL database and exposes two HTTP listeners:
  - the public API, on `:8080` (`LOCAL_PODCASTS_ADDR`) — the UI, streaming, `/metrics`, `/ads/candidates`, etc.
  - an internal job API, on a **separate port**, `:8081` by default (`LOCAL_PODCASTS_INTERNAL_ADDR`) — `POST /internal/jobs/claim`, `POST /internal/jobs/{id}/complete`, `POST /internal/jobs/{id}/upload`. This is meant to be reachable only from worker pods on the cluster-internal network (not exposed via Ingress), not from the public internet; it has no auth of its own.
- The worker binary (`cmd/worker`, image entrypoint `local-podcasts-worker`) polls the internal API for pending `download`/`fingerprint` jobs, performs them, and reports results back. Workers have **no database access and no shared filesystem/PVC access** — all audio bytes move over plain HTTP:
  - `download` jobs: the worker fetches the episode's audio from its source RSS URL, then streams it to `/internal/jobs/{id}/upload`, which is what actually persists it to disk (only the main server process can write to its own storage volume).
  - `fingerprint` jobs: the worker re-fetches the already-downloaded episode via the public `/podcasts/{podcast_id}/episodes/{episode_id}/stream` endpoint, computes audio fingerprints locally, and reports back just the (small) resulting hashes.
  - A successful `download` job automatically enqueues the corresponding `fingerprint` job.
  - This design means worker pods are fully stateless and can be scheduled on any node and scaled to any replica count without any storage coupling.
- Fingerprints are compared across episodes to find segments of audio shared between multiple episodes (candidate ad reads/injected ads), surfaced at `GET /ads/candidates`.

