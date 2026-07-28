import mongoose from "mongoose";

const loginThrottleSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
    },
    attempts: {
      type: [Date],
      default: [],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    versionKey: false,
  }
);

loginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const loginThrottleModel = mongoose.model(
  "LoginThrottle",
  loginThrottleSchema
);
