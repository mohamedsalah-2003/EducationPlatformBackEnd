import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    courses: [
      {
        courseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
          required: true,
        },
        title: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        selectedSchedule: {
          day: {
            type: String,
            required: true,
            enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
          },
          time: {
            type: String,
            required: true
          }
        }
      }
    ],
    total: {
      type: Number,
      default: 0,
      required: true,
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["cash", "card"],
    },
    status: {
      type: String,
      required: true,
      enum: [
        "pending",
        "awaiting_payment",
        "completed",
        "cancelled",
        "payment_failed",
      ],
      default: "completed",
      index: true,
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ["not_required", "pending", "paid", "cancelled", "failed"],
      default: "not_required",
    },
    cartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "cart",
    },
    enrollmentAttemptId: {
      type: String,
    },
    stripeSessionId: {
      type: String,
    },
    stripePaymentIntentId: {
      type: String,
    },
    checkoutExpiresAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

orderSchema.index(
  { stripeSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { stripeSessionId: { $type: "string" } },
  }
);

export const orderModel = mongoose.model("Order", orderSchema);
