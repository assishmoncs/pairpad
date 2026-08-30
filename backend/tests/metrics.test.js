const { requestStarted, recordRequest, snapshot, toPrometheus, reset } = require('../src/utils/metrics');

describe('metrics', () => {
  beforeEach(() => reset());

  it('tracks in-flight requests and completed request timing', () => {
    requestStarted();
    expect(snapshot().inFlightRequests).toBe(1);

    recordRequest({ method: 'GET', statusCode: 200, durationMs: 12 });

    expect(snapshot()).toEqual(expect.objectContaining({
      inFlightRequests: 0,
      completedRequests: 1,
      averageRequestDurationMs: 12,
    }));
  });

  it('normalizes method and status class counters', () => {
    requestStarted();
    recordRequest({ method: 'post', statusCode: 404, durationMs: 4 });
    requestStarted();
    recordRequest({ method: 'GET', statusCode: 503, durationMs: 6 });

    const data = snapshot();
    expect(data.counters.http_requests_total).toBe(2);
    expect(data.counters.http_requests_method_POST).toBe(1);
    expect(data.counters.http_requests_status_4xx).toBe(1);
    expect(data.counters.http_requests_status_5xx).toBe(1);
  });

  it('renders Prometheus-compatible metrics', () => {
    requestStarted();
    recordRequest({ method: 'GET', statusCode: 200, durationMs: 8 });

    const output = toPrometheus();
    expect(output).toContain('# TYPE pairpad_http_requests_total counter');
    expect(output).toContain('pairpad_http_requests_total 1');
    expect(output).toContain('pairpad_http_requests_total{method="GET"} 1');
    expect(output).toContain('pairpad_http_request_duration_average_ms 8');
  });
});
