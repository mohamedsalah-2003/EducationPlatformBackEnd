import { timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import connectDB from '../../../connections/dbconnection.js';
import { getMissingRuntimeConfiguration } from '../../config/runtimeConfig.js';
import { getMetricsSnapshot } from '../../middelwares/observability.js';

const tokensMatch = (actual, expected) => {
  if (
    typeof actual !== 'string' ||
    typeof expected !== 'string' ||
    actual.length !== expected.length
  ) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
};

export const liveness = (req, res) =>
  res.status(200).json({
    status: 'ok',
    service: 'education-platform-api',
    timestamp: new Date().toISOString(),
  });

export const readiness = async (req, res) => {
  const missingConfiguration = getMissingRuntimeConfiguration();
  let database = 'unavailable';

  try {
    await connectDB();
    await mongoose.connection.db.admin().ping();
    database = 'ok';
  } catch {
    database = 'unavailable';
  }

  const ready = database === 'ok' && missingConfiguration.length === 0;
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks: {
      database,
      configuration:
        missingConfiguration.length === 0 ? 'ok' : 'unavailable',
    },
    timestamp: new Date().toISOString(),
  });
};

export const metrics = (req, res) => {
  const expectedToken = process.env.MONITORING_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({
      message: 'Monitoring is not configured',
      code: 'MONITORING_NOT_CONFIGURED',
    });
  }

  const actualToken = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!tokensMatch(actualToken, expectedToken)) {
    return res.status(401).json({
      message: 'Monitoring authentication is required',
      code: 'MONITORING_AUTHENTICATION_REQUIRED',
    });
  }

  return res.status(200).json({
    service: 'education-platform-api',
    ...getMetricsSnapshot(),
  });
};
