import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { cartModel } from "../connections/models/cart.model.js";
import { courseEnrollmentLockModel } from "../connections/models/courseEnrollmentLock.model.js";
import { enrolledCoursesModel } from "../connections/models/enrolledcoureces.model.js";
import { orderModel } from "../connections/models/order.model.js";
import orderRouter, {
  orderWebhookRouter,
} from "../src/modules/order/order.routes.js";
import {
  classifyStripeEvent,
  completeCardOrder,
} from "../src/modules/order/orderPayment.service.js";
import { formatCheckoutOrder } from "../src/modules/order/order.controller.js";

const checkoutEvent = ({ type, paymentStatus }) => ({
  type,
  data: {
    object: {
      payment_status: paymentStatus,
    },
  },
});

test("paid checkout completion triggers order completion", () => {
  const action = classifyStripeEvent(
    checkoutEvent({
      type: "checkout.session.completed",
      paymentStatus: "paid",
    })
  );

  assert.equal(action, "complete");
});

test("unpaid checkout completion waits for asynchronous confirmation", () => {
  const action = classifyStripeEvent(
    checkoutEvent({
      type: "checkout.session.completed",
      paymentStatus: "unpaid",
    })
  );

  assert.equal(action, "ignore");
});

test("asynchronous payment success triggers order completion", () => {
  const action = classifyStripeEvent(
    checkoutEvent({
      type: "checkout.session.async_payment_succeeded",
      paymentStatus: "paid",
    })
  );

  assert.equal(action, "complete");
});

test("expired checkout triggers cancellation", () => {
  const action = classifyStripeEvent(
    checkoutEvent({
      type: "checkout.session.expired",
      paymentStatus: "unpaid",
    })
  );

  assert.equal(action, "cancel");
});

test("asynchronous payment failure marks the order failed", () => {
  const action = classifyStripeEvent(
    checkoutEvent({
      type: "checkout.session.async_payment_failed",
      paymentStatus: "unpaid",
    })
  );

  assert.equal(action, "fail");
});

test("unrelated Stripe events are ignored", () => {
  const action = classifyStripeEvent(
    checkoutEvent({
      type: "customer.created",
      paymentStatus: undefined,
    })
  );

  assert.equal(action, "ignore");
});

test("order model supports pending payment lifecycle states", () => {
  const statusPath = orderModel.schema.path("status");
  const paymentStatusPath = orderModel.schema.path("paymentStatus");

  assert.equal(orderModel.schema.path("paymentMethod"), undefined);
  assert.deepEqual(statusPath.enumValues, [
    "pending",
    "awaiting_payment",
    "completed",
    "cancelled",
    "payment_failed",
  ]);
  assert.deepEqual(paymentStatusPath.enumValues, [
    "not_required",
    "pending",
    "paid",
    "cancelled",
    "failed",
  ]);
});

test("checkout API response excludes internal payment method data", () => {
  assert.deepEqual(
    formatCheckoutOrder({
      _id: "order-1",
      status: "awaiting_payment",
      paymentStatus: "pending",
      checkoutExpiresAt: new Date("2026-07-28T12:00:00.000Z"),
      paymentMethod: "legacy-value",
    }),
    {
      _id: "order-1",
      status: "awaiting_payment",
      paymentStatus: "pending",
      checkoutExpiresAt: new Date("2026-07-28T12:00:00.000Z"),
    }
  );
});

test("success, cancel, and raw webhook endpoints are registered", () => {
  const routePaths = orderRouter.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean);
  const webhookPaths = orderWebhookRouter.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean);

  assert.ok(routePaths.includes("/payment/success"));
  assert.ok(routePaths.includes("/payment/cancel"));
  assert.ok(webhookPaths.includes("/"));
});

test("a verified paid session enrolls the student and completes the order", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();
  const cartId = new mongoose.Types.ObjectId();
  const calls = {
    enrollmentCreates: 0,
    cartDeletes: 0,
    lockDeletes: 0,
  };
  const fakeOrder = {
    _id: orderId,
    userId,
    cartId,
    status: "awaiting_payment",
    paymentStatus: "pending",
    stripeSessionId: "cs_test_paid",
    enrollmentAttemptId: "attempt-1",
    courses: [
      {
        courseId,
        selectedSchedule: { day: "Monday", time: "10:00" },
      },
    ],
    async save() {},
  };
  const fakeMongoSession = {
    async withTransaction(callback) {
      await callback();
    },
    async endSession() {},
  };
  const originals = {
    startSession: mongoose.startSession,
    findOrder: orderModel.findById,
    findEnrollments: enrolledCoursesModel.find,
    createEnrollment: enrolledCoursesModel.create,
    deleteCart: cartModel.deleteOne,
    deleteLocks: courseEnrollmentLockModel.deleteMany,
  };

  try {
    mongoose.startSession = async () => fakeMongoSession;
    orderModel.findById = () => ({
      async session() {
        return fakeOrder;
      },
    });
    enrolledCoursesModel.find = () => ({
      select() {
        return this;
      },
      session() {
        return this;
      },
      async lean() {
        return [];
      },
    });
    enrolledCoursesModel.create = async () => {
      calls.enrollmentCreates += 1;
    };
    cartModel.deleteOne = () => ({
      async session() {
        calls.cartDeletes += 1;
      },
    });
    courseEnrollmentLockModel.deleteMany = () => ({
      async session() {
        calls.lockDeletes += 1;
      },
    });

    const result = await completeCardOrder({
      checkoutSession: {
        id: "cs_test_paid",
        payment_status: "paid",
        payment_intent: "pi_test_paid",
        metadata: { orderId: orderId.toString() },
      },
    });

    assert.equal(result.alreadyProcessed, false);
    assert.equal(fakeOrder.status, "completed");
    assert.equal(fakeOrder.paymentStatus, "paid");
    assert.equal(fakeOrder.stripePaymentIntentId, "pi_test_paid");
    assert.equal(calls.enrollmentCreates, 1);
    assert.equal(calls.cartDeletes, 1);
    assert.equal(calls.lockDeletes, 1);
  } finally {
    mongoose.startSession = originals.startSession;
    orderModel.findById = originals.findOrder;
    enrolledCoursesModel.find = originals.findEnrollments;
    enrolledCoursesModel.create = originals.createEnrollment;
    cartModel.deleteOne = originals.deleteCart;
    courseEnrollmentLockModel.deleteMany = originals.deleteLocks;
  }
});

test("an unpaid session cannot create enrollment", async () => {
  await assert.rejects(
    completeCardOrder({
      checkoutSession: {
        id: "cs_test_unpaid",
        payment_status: "unpaid",
        metadata: { orderId: new mongoose.Types.ObjectId().toString() },
      },
    }),
    (error) => {
      assert.equal(error.code, "PAYMENT_NOT_CONFIRMED");
      return true;
    }
  );
});
