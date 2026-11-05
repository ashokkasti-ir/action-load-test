# action-load-test

Load test any HTTP API from GitHub Actions with [k6](https://grafana.com/docs/k6/latest/). The default settings send 1,000 requests per second for 10 seconds, about 10,000 calls in total.

## Run it from GitHub

1. Go to **Actions → API Load Test → Run workflow**.
2. Fill in the form:

| Input | Default | Meaning |
|---|---|---|
| `target_url` | (required) | Full URL to call |
| `method` | `GET` | GET, POST, PUT, PATCH, DELETE |
| `rate` | `1000` | Requests started per second |
| `duration` | `10s` | How long to keep that rate (`5s`, `1m`, ...) |
| `body` | empty | Request body. When set, `Content-Type: application/json` is added |
| `headers` | empty | Extra headers as a JSON object, e.g. `{"X-Api-Key":"abc"}` |
| `expected_status` | `200` | Status code counted as success |
| `p95_ms` | `1000` | The run fails if p95 latency is above this |
| `max_error_rate` | `0.01` | The run fails if more than this fraction of requests fail |

3. Open the run. The job summary shows requests sent, achieved rate, error rate and latency percentiles. The raw `summary.json` is attached as an artifact.

For a bearer token, add a repository secret named `LOAD_TEST_AUTH_TOKEN` (Settings → Secrets and variables → Actions). It is sent as `Authorization: Bearer <token>` and never appears in the inputs or logs.

Trigger from the command line:

```sh
gh workflow run load-test.yml \
  -f target_url=https://api.example.com/v1/items \
  -f rate=2000 -f duration=5s
```

## How the load is generated

`tests/load-test.js` uses k6's `constant-arrival-rate` executor. k6 starts `rate` new requests every second whether or not earlier ones have finished, and grows its pool of virtual users (up to `rate`) when the API is slow. That gives you a real "N requests in M seconds" burst, unlike a fixed number of looping users.

If the summary shows **dropped iterations** above 0, k6 could not start requests fast enough, usually because the API is very slow and the VU pool ran out. A standard GitHub-hosted runner (4 vCPU) handles a few thousand requests per second against a responsive API.

## Run it locally

```sh
brew install k6
TARGET_URL=https://api.example.com/v1/health RATE=1000 DURATION=10s k6 run tests/load-test.js
```

Every input above maps to an upper-case env var (`METHOD`, `BODY`, `HEADERS`, `EXPECTED_STATUS`, `P95_MS`, `MAX_ERROR_RATE`, `AUTH_TOKEN`). Optional extras: `PRE_ALLOCATED_VUS`, `MAX_VUS`, `REQUEST_TIMEOUT` (default `10s`), `INSECURE_TLS=true`.

## Be careful

Only load test APIs you own or have permission to test. Thousands of requests per second can trip rate limits, WAF rules or alerting, and against a third-party service can look like a denial-of-service attack.
