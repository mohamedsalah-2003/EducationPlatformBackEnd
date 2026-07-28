import mongoose from "mongoose";
import { cartModel } from "../../../connections/models/cart.model.js";
import { courseEnrollmentLockModel } from "../../../connections/models/courseEnrollmentLock.model.js";
import { enrolledCoursesModel } from "../../../connections/models/enrolledcoureces.model.js";
import { orderModel } from "../../../connections/models/order.model.js";

const terminalOrderStatuses = new Set([
  "completed",
  "cancelled",
  "payment_failed",
]);

const paymentError = (message, cause = 400, code = "PAYMENT_ERROR") =>
  Object.assign(new Error(message, { cause }), { code });

const getOrderId = (checkoutSession) => checkoutSession?.metadata?.orderId;

const assertCheckoutSessionMatchesOrder = ({ checkoutSession, order }) => {
  if (
    order.stripeSessionId &&
    order.stripeSessionId !== checkoutSession.id
  ) {
    throw paymentError(
      "The Stripe session does not match this order",
      409,
      "PAYMENT_SESSION_MISMATCH"
    );
  }
};

const releaseEnrollmentLocks = async ({ order, session }) => {
  const courseIds = order.courses.map((course) => course.courseId);
  const filter = {
    userId: order.userId,
    courseId: { $in: courseIds },
  };

  if (order.enrollmentAttemptId) {
    filter.attemptId = order.enrollmentAttemptId;
  }

  await courseEnrollmentLockModel.deleteMany(filter).session(session ?? null);
};

const enrollMissingCourses = async ({ order, session }) => {
  const courseIds = order.courses.map((course) => course.courseId);
  const enrollmentRecords = await enrolledCoursesModel
    .find({
      userid: order.userId,
      "courses.courseId": { $in: courseIds },
    })
    .select("courses.courseId")
    .session(session)
    .lean();

  const enrolledIds = new Set(
    enrollmentRecords.flatMap((record) =>
      record.courses.map((course) => course.courseId.toString())
    )
  );

  const missingCourses = order.courses.filter(
    (course) => !enrolledIds.has(course.courseId.toString())
  );

  if (missingCourses.length === 0) return;

  await enrolledCoursesModel.create(
    [
      {
        userid: order.userId,
        courses: missingCourses.map((course) => ({
          courseId: course.courseId,
          selectedSchedule: course.selectedSchedule,
        })),
      },
    ],
    { session }
  );
};

export const classifyStripeEvent = (event) => {
  const paymentStatus = event?.data?.object?.payment_status;

  if (
    event?.type === "checkout.session.async_payment_succeeded" ||
    (event?.type === "checkout.session.completed" && paymentStatus === "paid")
  ) {
    return "complete";
  }

  if (event?.type === "checkout.session.expired") {
    return "cancel";
  }

  if (event?.type === "checkout.session.async_payment_failed") {
    return "fail";
  }

  return "ignore";
};

export const completeCardOrder = async ({ checkoutSession }) => {
  if (checkoutSession?.payment_status !== "paid") {
    throw paymentError(
      "Stripe has not confirmed payment for this order",
      409,
      "PAYMENT_NOT_CONFIRMED"
    );
  }

  const orderId = getOrderId(checkoutSession);
  if (!mongoose.isValidObjectId(orderId)) {
    throw paymentError(
      "Stripe session is missing a valid order reference",
      400,
      "INVALID_ORDER_REFERENCE"
    );
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const order = await orderModel.findById(orderId).session(session);
      if (!order) {
        throw paymentError("Order not found", 404, "ORDER_NOT_FOUND");
      }

      assertCheckoutSessionMatchesOrder({ checkoutSession, order });

      if (order.status === "completed") {
        result = { order, alreadyProcessed: true };
        return;
      }

      await enrollMissingCourses({ order, session });
      await cartModel.deleteOne({
        _id: order.cartId,
        userId: order.userId,
      }).session(session);

      order.status = "completed";
      order.paymentStatus = "paid";
      order.stripeSessionId = checkoutSession.id;
      order.stripePaymentIntentId =
        checkoutSession.payment_intent?.toString?.() ||
        checkoutSession.payment_intent ||
        undefined;
      order.paidAt = new Date();
      await order.save({ session });
      await releaseEnrollmentLocks({ order, session });

      result = { order, alreadyProcessed: false };
    });
  } finally {
    await session.endSession();
  }

  return result;
};

const transitionUnpaidCardOrder = async ({
  checkoutSession,
  status,
  paymentStatus,
}) => {
  const orderId = getOrderId(checkoutSession);
  if (!mongoose.isValidObjectId(orderId)) {
    throw paymentError(
      "Stripe session is missing a valid order reference",
      400,
      "INVALID_ORDER_REFERENCE"
    );
  }

  const order = await orderModel.findById(orderId);
  if (!order) {
    throw paymentError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  assertCheckoutSessionMatchesOrder({ checkoutSession, order });

  if (order.status === "completed") {
    return { order, alreadyProcessed: true };
  }

  if (order.status === status) {
    return { order, alreadyProcessed: true };
  }

  if (terminalOrderStatuses.has(order.status)) {
    return { order, alreadyProcessed: true };
  }

  order.status = status;
  order.paymentStatus = paymentStatus;
  order.stripeSessionId = checkoutSession.id;
  await order.save();
  await releaseEnrollmentLocks({ order });

  return { order, alreadyProcessed: false };
};

export const cancelCardOrder = async ({ checkoutSession }) =>
  transitionUnpaidCardOrder({
    checkoutSession,
    status: "cancelled",
    paymentStatus: "cancelled",
  });

export const failCardOrder = async ({ checkoutSession }) =>
  transitionUnpaidCardOrder({
    checkoutSession,
    status: "payment_failed",
    paymentStatus: "failed",
  });
