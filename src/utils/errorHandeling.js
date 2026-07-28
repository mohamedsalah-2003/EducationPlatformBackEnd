import { logError } from "./logger.js";

const validStatus = (value) => {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : null;
};

export class AppError extends Error {
  constructor(message, status = 500, code) {
    super(message, { cause: status });
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export const asyncHandler = (api) => (req, res, next) =>
  Promise.resolve()
    .then(() => api(req, res, next))
    .catch(next);

export const getErrorStatus = (error) => {
  if (error?.name === "MulterError") {
    return error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
  }

  if (error?.code === 11000) return 409;
  if (error?.name === "CastError" || error?.name === "ValidationError") {
    return 400;
  }

  return (
    validStatus(error?.status) ??
    validStatus(error?.statusCode) ??
    validStatus(error?.http_code) ??
    validStatus(error?.cause) ??
    500
  );
};

export const notFoundHandler = (req, res, next) =>
  next(new AppError(`Route ${req.method} ${req.originalUrl} was not found`, 404));

export const globalErrorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  const status = getErrorStatus(error);
  const exposeMessage =
    status < 500 ||
    error instanceof AppError ||
    process.env.NODE_ENV !== "production";
  const response = {
    message: exposeMessage ? error.message : "Internal server error",
  };

  if (typeof error?.code === "string") {
    response.code = error.code;
  }

  if (Number.isInteger(error?.retryAfter) && error.retryAfter > 0) {
    response.retryAfter = error.retryAfter;
    res.set("Retry-After", String(error.retryAfter));
  }

  if (process.env.NODE_ENV !== "test" && status >= 500) {
    logError("request_failed", error, {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl?.split("?")[0],
      statusCode: status,
    });
  }

  return res.status(status).json(response);
};
