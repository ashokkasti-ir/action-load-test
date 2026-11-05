# action-load-test

Load test HTTP APIs from GitHub Actions with [k6](https://grafana.com/docs/k6/latest/), with all traffic going through the [InvisiRisk](https://invisirisk.com/) PSE proxy.

The workflow runs a matrix of 7 request types against [JSONPlaceholder](https://jsonplaceholder.typicode.com/), a free public mock API that needs no key and publishes no rate limit. Each matrix job runs on its own runner with its own InvisiRisk proxy. By default each job sends 150 requests per second for 15 seconds, so one run makes about 15,750 calls in total.

| Matrix job | Method | URL | Expected status |
|---|---|---|---|
| `get-single-post` | GET | `/posts/1` | 200 |
| `list-posts` | GET | `/posts` | 200 |
| `filter-comments` | GET | `/comments?postId=1` | 200 |
| `create-post` | POST | `/posts` (JSON body) | 201 |
| `replace-post` | PUT | `/posts/1` (JSON body) | 200 |
| `patch-post` | PATCH | `/posts/1` (JSON body) | 200 |
| `delete-post` | DELETE | `/posts/1` | 200 |

To add or change a variation, edit `strategy.matrix.include` in [`.github/workflows/load-test.yml`](.github/workflows/load-test.yml). Each entry needs `name`, `method`, `url`, `expected_status` and `body` (empty string for no body).

## Run it from GitHub

1. Go to **Actions → API Load Test → Run workflow**.
2. Adjust the inputs if needed. They apply to every matrix job:

| Input | Default | Meaning |
|---|---|---|
| `rate` | `150` | Requests started per second, per job |
| `duration` | `15s` | How long each job keeps that rate (`5s`, `1m`, ...) |
| `p95_ms` | `1000` | A job fails if its p95 latency is above this |
| `max_error_rate` | `0.01` | A job fails if more than this fraction of its requests fail |

3. Open the run. Each job's summary shows requests sent, achieved rate, error rate, dropped iterations and latency percentiles. Each job also uploads its `summary.json` as an artifact named `k6-summary-<job>`.

From the command line:

```sh
gh workflow run load-test.yml -R ashokkasti-ir/action-load-test -f rate=150 -f duration=15s
```

For a bearer token, add a repository secret named `LOAD_TEST_AUTH_TOKEN`. It is sent as `Authorization: Bearer <token>`. The InvisiRisk step needs the `IR_TOKEN` secret.

## Load through the InvisiRisk proxy

The PSE action sets `HTTP_PROXY`/`HTTPS_PROXY`, and k6 follows them, so InvisiRisk inspects every load-test request. The proxy has a throughput limit, so the default rate is set below it. Measured per job, 7 jobs in parallel, 15 s each:

| Rate per job | Result | Dropped iterations | p95 latency |
|---|---|---|---|
| 40 req/s | all pass | 0 | 57–170 ms |
| 150 req/s (default) | all pass | 0 | 55–195 ms |
| 300 req/s | pass, but saturating | 13–80 per job | 147–336 ms |
| 1,000 req/s (single job, earlier run) | fails | 5,612 | 2.53 s |

At 300 req/s the proxy starts queueing: latency doubles and k6 can't start every request on time. At 1,000 req/s requests take about 2 s each, k6 runs out of workers and drops more than half the requests. For more total load, add matrix jobs rather than raising `rate`, because each job has its own proxy.

## How the load is generated

`tests/load-test.js` uses k6's `constant-arrival-rate` executor. k6 starts `rate` new requests every second whether or not earlier ones have finished, and adds virtual users (up to 3 × `rate`) when responses are slow. That gives a real "N requests in M seconds" burst.

**Dropped iterations** above 0 means k6 could not start requests on schedule because all its workers were waiting on slow responses. Behind the proxy, that is the first sign you're above its capacity.

## Run it locally

```sh
brew install k6
k6 run tests/load-test.js                     # defaults: JSONPlaceholder /posts/1, 1000 req/s, 10s, no proxy
TARGET_URL=https://your-api.example.com/health RATE=500 DURATION=5s k6 run tests/load-test.js
```

The script reads these env vars: `TARGET_URL`, `METHOD`, `BODY`, `HEADERS` (JSON object), `EXPECTED_STATUS`, `RATE`, `DURATION`, `P95_MS`, `MAX_ERROR_RATE`, `AUTH_TOKEN`, `PRE_ALLOCATED_VUS`, `MAX_VUS`, `REQUEST_TIMEOUT` (default `10s`), `INSECURE_TLS=true`.

## Be careful

Only load test APIs you own or have permission to test. JSONPlaceholder is a shared free service, so keep bursts short (seconds, not minutes).
