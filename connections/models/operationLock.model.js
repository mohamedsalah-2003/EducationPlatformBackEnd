import mongoose from "mongoose";

const operationLockSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    attemptId: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
    },
  },
  { timestamps: true }
);

operationLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const operationLockModel = mongoose.model(
  "OperationLock",
  operationLockSchema
);
