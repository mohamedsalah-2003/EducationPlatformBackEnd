import mongoose from "mongoose";

const courseEnrollmentLockSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    attemptId: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

courseEnrollmentLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const courseEnrollmentLockModel = mongoose.model(
  "CourseEnrollmentLock",
  courseEnrollmentLockSchema
);
