import mongoose from "mongoose";
import { operationLockModel } from "../../connections/models/operationLock.model.js";
import { logError } from "../utils/logger.js";

const normalizeKeyPart = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 160);

export const preventConcurrentRequests = ({
  operation,
  key,
  message = "This request is already being processed",
}) => {
  return async (req, res, next) => {
    const resourceKey = normalizeKeyPart(key(req));
    if (!resourceKey) {
      return res.status(400).json({ message: "A request resource is required" });
    }

    const lockId = `${operation}:${resourceKey}`;
    const attemptId = new mongoose.Types.ObjectId().toString();

    try {
      await operationLockModel.create({ _id: lockId, attemptId });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          message,
          code: "REQUEST_IN_PROGRESS",
        });
      }
      return next(error);
    }

    let released = false;
    const releaseLock = () => {
      if (released) return;
      released = true;
      operationLockModel
        .deleteOne({ _id: lockId, attemptId })
        .catch((error) =>
          logError("operation_lock_release_failed", error, {
            operation,
            requestId: req.requestId,
          })
        );
    };

    res.once("finish", releaseLock);
    res.once("close", releaseLock);
    return next();
  };
};
