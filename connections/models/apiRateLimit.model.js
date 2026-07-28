import mongoose from 'mongoose';

const apiRateLimitSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

apiRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const apiRateLimitModel = mongoose.model(
  'ApiRateLimit',
  apiRateLimitSchema
);
