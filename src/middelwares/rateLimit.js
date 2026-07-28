import { createHash } from 'node:crypto';
import { apiRateLimitModel } from '../../connections/models/apiRateLimit.model.js';
import { AppError } from '../utils/errorHandeling.js';

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const defaultWindowMs =
  positiveInteger(process.env.API_RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000;
const defaultMaxRequests = positiveInteger(
  process.env.API_RATE_LIMIT_MAX_REQUESTS,
  300
);

const clientKey = (req) =>
  createHash('sha256')
    .update(`${req.ip ?? 'unknown'}:${process.env.API_RATE_LIMIT_SECRET ?? process.env.JWT_SECRET}`)
    .digest('hex');

const incrementWindow = async ({
  model,
  id,
  expiresAt,
}) => {
  try {
    return await model.findOneAndUpdate(
      { _id: id },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        lean: true,
      }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return model.findOneAndUpdate(
      { _id: id },
      { $inc: { count: 1 } },
      { new: true, lean: true }
    );
  }
};

export const createApiRateLimiter = ({
  scope = 'api',
  windowMs = defaultWindowMs,
  maxRequests = defaultMaxRequests,
  model = apiRateLimitModel,
} = {}) => {
  return async (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    try {
      const now = Date.now();
      const windowNumber = Math.floor(now / windowMs);
      const expiresAt = new Date((windowNumber + 1) * windowMs);
      const id = `${scope}:${clientKey(req)}:${windowNumber}`;
      const entry = await incrementWindow({ model, id, expiresAt });
      const remaining = Math.max(0, maxRequests - entry.count);

      res.setHeader('RateLimit-Limit', String(maxRequests));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader(
        'RateLimit-Reset',
        String(Math.ceil(expiresAt.getTime() / 1000))
      );

      if (entry.count > maxRequests) {
        const retryAfter = Math.max(
          1,
          Math.ceil((expiresAt.getTime() - now) / 1000)
        );
        const error = new AppError(
          'Too many requests. Please try again later.',
          429,
          'RATE_LIMIT_EXCEEDED'
        );
        error.retryAfter = retryAfter;
        throw error;
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};
