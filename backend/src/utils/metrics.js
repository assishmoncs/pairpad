const counters = new Map();
const startedAt = Date.now();
let inFlight = 0;
let totalDurationMs = 0;
let completedRequests = 0;

const increment = (key, amount = 1) => {
  counters.set(key, (counters.get(key) || 0) + amount);
};

const recordRequest = ({ method, statusCode, durationMs }) => {
  const normalizedMethod = String(method || 'UNKNOWN').toUpperCase();
  const status = Number(statusCode) || 0;
  const duration = Math.max(0, Number(durationMs) || 0);
  const statusClass = status >= 500 ? '5xx' : status >= 400 ? '4xx' : status >= 300 ? '3xx' : status >= 200 ? '2xx' : 'other';

  increment('http_requests_total');
  increment(`http_requests_method_${normalizedMethod}`);
  increment(`http_requests_status_${statusClass}`);
  totalDurationMs += duration;
  completedRequests += 1;
  inFlight = Math.max(0, inFlight - 1);
};

const requestStarted = () => {
  inFlight += 1;
};

const snapshot = () => ({
  uptimeSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
  inFlightRequests: inFlight,
  completedRequests,
  averageRequestDurationMs: completedRequests ? Number((totalDurationMs / completedRequests).toFixed(3)) : 0,
  counters: Object.fromEntries(counters.entries()),
});

const escapeLabelValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

const toPrometheus = () => {
  const current = snapshot();
  const lines = [
    '# HELP pairpad_uptime_seconds Process uptime in seconds.',
    '# TYPE pairpad_uptime_seconds gauge',
    `pairpad_uptime_seconds ${current.uptimeSeconds}`,
    '# HELP pairpad_http_requests_in_flight Current HTTP requests in flight.',
    '# TYPE pairpad_http_requests_in_flight gauge',
    `pairpad_http_requests_in_flight ${inFlight}`,
    '# HELP pairpad_http_requests_completed_total Total completed HTTP requests.',
    '# TYPE pairpad_http_requests_completed_total counter',
    `pairpad_http_requests_completed_total ${completedRequests}`,
    '# HELP pairpad_http_request_duration_average_ms Average completed request duration in milliseconds.',
    '# TYPE pairpad_http_request_duration_average_ms gauge',
    `pairpad_http_request_duration_average_ms ${current.averageRequestDurationMs}`,
    '# HELP pairpad_http_requests_total Total HTTP requests by overall count and dimensions.',
    '# TYPE pairpad_http_requests_total counter',
  ];

  for (const [key, value] of counters.entries()) {
    const metric = key.replace(/[^a-zA-Z0-9_]/g, '_');
    if (metric === 'http_requests_method_UNKNOWN') continue;
    const labelMatch = metric.match(/^http_requests_(method|status)_(.+)$/);
    if (labelMatch) {
      const [, dimension, label] = labelMatch;
      const labelName = dimension === 'method' ? 'method' : 'status_class';
      lines.push(`pairpad_http_requests_total{${labelName}="${escapeLabelValue(label)}"} ${value}`);
    } else if (metric === 'http_requests_total') {
      lines.push(`pairpad_http_requests_total ${value}`);
    }
  }

  return `${lines.join('\n')}\n`;
};

const reset = () => {
  counters.clear();
  inFlight = 0;
  totalDurationMs = 0;
  completedRequests = 0;
};

module.exports = { requestStarted, recordRequest, snapshot, toPrometheus, reset };
