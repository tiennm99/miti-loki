# miti-loki

A Cloudflare Worker that forwards logs to [My Grafana Cloud](https://miti99.grafana.net)'s Loki.

## Usage

POST a JSON body to `https://miti-loki.miti99.workers.dev/`. GET redirects to this repo. Any other method returns 405; missing/empty body returns 400.

### Single log entry

```bash
curl -X POST 'https://miti-loki.miti99.workers.dev/?app=demo&env=prod' \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hello from miti-loki"}'
```

### Batch (array of entries)

```bash
curl -X POST 'https://miti-loki.miti99.workers.dev/?app=demo' \
  -H 'Content-Type: application/json' \
  -d '[{"message":"first"},{"message":"second"}]'
```

### Body schema

Each entry is `{message, timestamp?, metadata?}`:

- `message` (string, required) — log line.
- `timestamp` (string, optional) — Unix nanoseconds. Defaults to current time.
- `metadata` (object, optional) — flat key-value pairs (no nested objects). Forwarded as Loki structured metadata.

### Stream labels

URL query params become Loki stream labels. Label names must match `[a-zA-Z_:][a-zA-Z0-9_:]*` and cannot both start and end with `_` (reserved). Invalid labels return 400.

Two labels are auto-injected (overwriting any caller-supplied values):

- `proxy=miti-loki`
- `ip=<client-ip>` (from `CF-Connecting-IP` / `X-Forwarded-For`)

### Errors

- `400` — empty body, invalid JSON, missing `message`, nested metadata, or invalid label name.
- `405` — non-POST/GET/OPTIONS method.
- `500` — worker missing `LOKI_HOST` / `LOKI_USERNAME` / `LOKI_PASSWORD` env vars (deploy-time issue, not caller-fixable), or upstream fetch error.
- Otherwise the response status, body, and content-type are passed through from Loki's `/loki/api/v1/push`.

Responses are CORS-permissive (`Access-Control-Allow-Origin: *`, `POST, OPTIONS` allowed).

### Env vars (deploy-time)

- `LOKI_HOST` — Loki host (e.g. `logs-prod-XXX.grafana.net`).
- `LOKI_USERNAME` — Basic Auth user (Grafana Cloud instance ID).
- `LOKI_PASSWORD` — Basic Auth password (Grafana Cloud API token).
- `LOKI_PORT` (optional) — defaults to `443` (HTTPS). Any other value uses HTTP.

### For AI agents / Claude Code routines

Read this section first, do not probe.

- **One POST per intended log batch.** Do not send a `"test"` payload to verify the endpoint — every successful POST writes to Loki, so probes pollute the log stream.
- **Exact request:**
  ```
  POST https://miti-loki.miti99.workers.dev/?<label>=<value>&...
  Content-Type: application/json
  {"message": "<your log>"}
  ```
- **Success:** any 2xx (typically 204 from Loki). **Auth-related errors:** 500 (env vars missing — deploy-time issue).
- **Do not retry on 2xx.** Each POST is a separate ingest; a retry would duplicate log lines.
