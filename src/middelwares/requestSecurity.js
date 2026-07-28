import { AppError } from "../utils/errorHandeling.js";

const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);

const normalizeOrigin = (value) => {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
};

export const getAllowedCorsOrigins = ({
  frontendUrl = process.env.FRONTEND_URL,
  configuredOrigins = process.env.CORS_ORIGINS,
  nodeEnv = process.env.NODE_ENV,
} = {}) => {
  const candidates = [
    frontendUrl,
    ...(configuredOrigins?.split(",") ?? []),
    ...(nodeEnv === "production"
      ? []
      : ["http://localhost:4200", "http://localhost:3000"]),
  ];

  return new Set(candidates.map(normalizeOrigin).filter(Boolean));
};

export const createCorsOptions = (options = {}) => {
  const allowedOrigins = getAllowedCorsOrigins(options);

  return {
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: [
      "X-Request-Id",
      "X-Pagination-Page",
      "X-Pagination-Limit",
      "X-Pagination-Total",
      "X-Pagination-Pages",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
    ],
    maxAge: 600,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(
        new AppError(
          "This origin is not allowed to access the API",
          403,
          "ORIGIN_NOT_ALLOWED"
        )
      );
    },
  };
};

export const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );

  if (req.secure || process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return next();
};

export const containsUnsafeObjectKeys = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      key.startsWith("$") ||
      key.includes(".") ||
      unsafeKeys.has(key) ||
      containsUnsafeObjectKeys(nestedValue, seen)
    ) {
      return true;
    }
  }

  return false;
};

export const rejectUnsafeRequestInput = (req, res, next) => {
  if (
    containsUnsafeObjectKeys(req.body) ||
    containsUnsafeObjectKeys(req.query) ||
    containsUnsafeObjectKeys(req.params)
  ) {
    return next(
      new AppError(
        "Request contains unsupported field names",
        400,
        "UNSAFE_REQUEST_INPUT"
      )
    );
  }

  return next();
};
