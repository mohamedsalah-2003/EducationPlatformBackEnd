import mongoose from "mongoose";

const revokedTokenSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const revokedTokenModel = mongoose.model(
  "RevokedToken",
  revokedTokenSchema
);
