import { randomUUID } from 'node:crypto';
import { logInfo } from '../utils/logger.js';

const metrics = {
  startedAt: Date.now(),
  requests: 0,
  inFlight: 0,
  totalDurationMs: 0,
  statuses: {
    success: 0,
    redirect: 0,
    clientError: 0,
    serverError: 0,
  },
};

const validRequestId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);

const statusBucket = (statusCode) => {
  if (statusCode >= 500) return 'serverError';
  if (statusCode >= 400) return 'clientError';
  if (statusCode >= 300) return 'redirect';
  return 'success';
};

export const observeRequests = (req, res, next) => {
  const incomingRequestId = req.get('x-request-id');
  req.requestId = validRequestId(incomingRequestId)
    ? incomingRequestId
    : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  const startedAt = process.hrtime.bigint();
  metrics.requests += 1;
  metrics.inFlight += 1;

  res.once('finish', () => {
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const bucket = statusBucket(res.statusCode);
    metrics.inFlight = Math.max(0, metrics.inFlight - 1);
    metrics.totalDurationMs += durationMs;
    metrics.statuses[bucket] += 1;

    logInfo('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.authuser?._id?.toString(),
      role: req.authuser?.role,
    });
  });

  return next();
};

export const getMetricsSnapshot = () => ({
  uptimeSeconds: Math.floor((Date.now() - metrics.startedAt) / 1000),
  requests: metrics.requests,
  inFlight: metrics.inFlight,
  averageDurationMs:
    metrics.requests === 0
      ? 0
      : Number((metrics.totalDurationMs / metrics.requests).toFixed(2)),
  statuses: { ...metrics.statuses },
  memory: {
    rssBytes: process.memoryUsage().rss,
    heapUsedBytes: process.memoryUsage().heapUsed,
  },
});
