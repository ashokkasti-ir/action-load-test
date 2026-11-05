// k6 load test driven entirely by environment variables, so the same script
// works from the GitHub Actions form and from a local terminal.
//
// Uses the constant-arrival-rate executor: k6 starts RATE requests per second
// regardless of how fast the API answers, which is what "N calls in M seconds"
// means. VUs are only the worker pool that k6 uses to hit that rate.

import http from 'k6/http';
import { check } from 'k6';

const env = (name, fallback) =>
  __ENV[name] !== undefined && __ENV[name] !== '' ? __ENV[name] : fallback;

// Default: JSONPlaceholder, a free public mock API with no API key and no
// published rate limit. Override with your own API via TARGET_URL.
const TARGET_URL = env('TARGET_URL', 'https://jsonplaceholder.typicode.com/posts/1');

const METHOD = env('METHOD', 'GET').toUpperCase();
const BODY = env('BODY', null);
const EXPECTED_STATUS = parseInt(env('EXPECTED_STATUS', '200'), 10);

const RATE = parseInt(env('RATE', '1000'), 10); // requests per second
const DURATION = env('DURATION', '10s');
const PRE_ALLOCATED_VUS = parseInt(env('PRE_ALLOCATED_VUS', String(Math.max(50, Math.ceil(RATE / 5)))), 10);
const MAX_VUS = parseInt(env('MAX_VUS', String(Math.max(PRE_ALLOCATED_VUS, RATE))), 10);

const P95_MS = parseInt(env('P95_MS', '1000'), 10);
const MAX_ERROR_RATE = parseFloat(env('MAX_ERROR_RATE', '0.01'));

let headers = { 'User-Agent': 'action-load-test/k6' };
if (BODY) headers['Content-Type'] = 'application/json';
if (env('HEADERS')) {
  try {
    headers = Object.assign(headers, JSON.parse(env('HEADERS')));
  } catch (e) {
    throw new Error(`HEADERS must be a JSON object, got: ${env('HEADERS')}`);
  }
}
// Kept separate from HEADERS so the token can come from a GitHub secret.
if (env('AUTH_TOKEN')) headers['Authorization'] = `Bearer ${env('AUTH_TOKEN')}`;

export const options = {
  scenarios: {
    api_burst: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    http_req_failed: [`rate<${MAX_ERROR_RATE}`],
    http_req_duration: [`p(95)<${P95_MS}`],
    checks: [`rate>${1 - MAX_ERROR_RATE}`],
  },
  // Some APIs sit behind self-signed certs in staging.
  insecureSkipTLSVerify: env('INSECURE_TLS', 'false') === 'true',
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const params = {
  headers,
  timeout: env('REQUEST_TIMEOUT', '10s'),
  responseCallback: http.expectedStatuses(EXPECTED_STATUS),
};

export default function () {
  const res = http.request(METHOD, TARGET_URL, BODY, params);
  check(res, {
    [`status is ${EXPECTED_STATUS}`]: (r) => r.status === EXPECTED_STATUS,
  });
}
