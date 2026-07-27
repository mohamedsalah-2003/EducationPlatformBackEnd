import mongoose from "mongoose";
import { cartModel } from "../../../connections/models/cart.model.js";
import { orderModel } from "../../../connections/models/order.model.js";
import { courseModel } from "../../../connections/models/course.model.js";
import { userModel } from "../../../connections/models/user.model.js";
import { enrolledCoursesModel } from "../../../connections/models/enrolledcoureces.model.js";
import { courseEnrollmentLockModel } from "../../../connections/models/courseEnrollmentLock.model.js";
import {
  constructStripeWebhookEvent,
  expireCheckoutSession,
  paymentFunction,
  retrieveCheckoutSession,
} from "../../utils/payment.js";
import { asyncHandler } from "../../utils/errorHandeling.js";
import {
  cancelCardOrder,
  classifyStripeEvent,
  completeCardOrder,
  failCardOrder,
} from "./orderPayment.service.js";

const enrollmentLockId = (userId, courseId) => `${userId}:${courseId}`;
const stripeSessionPlaceholder = "{CHECKOUT_SESSION_ID}";

const getPublicApiUrl = (req) => {
  const configuredUrl = process.env.PUBLIC_API_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error("PUBLIC_API_URL must be configured for card checkout");
  }

  return `${req.protocol}://${req.get("host")}`;
};

const redirectToFrontend = ({ res, path, params = {} }) => {
  const configuredFrontendUrl = process.env.FRONTEND_URL?.trim();
  const frontendUrl =
    configuredFrontendUrl ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:4200" : "");

  if (!frontendUrl) return false;

  const redirectUrl = new URL(path, `${frontendUrl.replace(/\/+$/, "")}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      redirectUrl.searchParams.set(key, value.toString());
    }
  });

  res.redirect(303, redirectUrl.toString());
  return true;
};

const sendPaymentError = (error, res, next) => {
  if (error?.code && error?.cause >= 400 && error?.cause < 500) {
    return res.status(error.cause).json({
      message: error.message,
      code: error.code,
    });
  }
  return next(error);
};

export const createOrderFromCart = asyncHandler(async (req, res, next) => {
  const userId = req.authuser._id;
  const { cartId, paymentMethod = "cash" } = req.body;

  if (!cartId || !mongoose.isValidObjectId(cartId)) {
    return res.status(400).json({ message: "A valid cart ID is required" });
  }

  if (!["cash", "card"].includes(paymentMethod)) {
    return res.status(400).json({ message: "Unsupported payment method" });
  }

  const cart = await cartModel
    .findOne({ _id: cartId, userId })
    .populate("courses.courseId");

  if (!cart || cart.courses.length === 0) {
    return res.status(400).json({ message: "Cart is empty or not found" });
  }

  if (cart.courses.some((item) => !item.courseId)) {
    return res.status(400).json({ message: "The cart contains an unavailable course" });
  }

  const courseIds = cart.courses.map((item) => item.courseId._id.toString());
  if (new Set(courseIds).size !== courseIds.length) {
    return res.status(409).json({
      message: "The cart contains the same course more than once",
      code: "DUPLICATE_CART_COURSE",
    });
  }

  const duplicateEnrollments = await enrolledCoursesModel
    .find({
      userid: userId,
      "courses.courseId": { $in: courseIds },
    })
    .select("courses.courseId")
    .lean();

  if (duplicateEnrollments.length) {
    const enrolledIds = new Set(
      duplicateEnrollments.flatMap((enrollment) =>
        enrollment.courses.map((course) => course.courseId.toString())
      )
    );
    const duplicateTitles = cart.courses
      .filter((item) => enrolledIds.has(item.courseId._id.toString()))
      .map((item) => item.courseId.title);

    return res.status(409).json({
      message: `Already enrolled: ${duplicateTitles.join(", ")}`,
      code: "COURSE_ALREADY_ENROLLED",
      courseIds: courseIds.filter((courseId) => enrolledIds.has(courseId)),
    });
  }

  const orderCourses = cart.courses.map((item) => ({
    courseId: item.courseId._id,
    title: item.courseId.title,
    price: item.courseId.price,
    selectedSchedule: item.schedule,
  }));
  const total = orderCourses.reduce((sum, course) => sum + course.price, 0);
  const lockIds = courseIds.map((courseId) => enrollmentLockId(userId, courseId));
  const attemptId = new mongoose.Types.ObjectId().toString();

  let newOrder = null;
  let enrollmentCreated = false;
  let checkoutSessionId = null;

  try {
    await courseEnrollmentLockModel.insertMany(
      courseIds.map((courseId) => ({
        _id: enrollmentLockId(userId, courseId),
        userId,
        courseId,
        attemptId,
      })),
      { ordered: true }
    );

    newOrder = await orderModel.create({
      userId,
      courses: orderCourses,
      total,
      paymentMethod,
      cartId,
      enrollmentAttemptId: attemptId,
      status: paymentMethod === "card" ? "awaiting_payment" : "completed",
      paymentStatus: paymentMethod === "card" ? "pending" : "not_required",
    });

    if (paymentMethod === "card") {
      const user = await userModel.findById(userId);
      if (!user) {
        throw new Error("User not found", { cause: 404 });
      }

      const publicApiUrl = getPublicApiUrl(req);
      const orderSession = await paymentFunction({
        customer_email: user.email,
        metadata: {
          orderId: newOrder._id.toString(),
          userId: userId.toString(),
        },
        success_url:
          `${publicApiUrl}/order/payment/success` +
          `?session_id=${stripeSessionPlaceholder}`,
        cancel_url:
          `${publicApiUrl}/order/payment/cancel` +
          `?session_id=${stripeSessionPlaceholder}`,
        line_items: orderCourses.map((course) => ({
          price_data: {
            currency: "egp",
            product_data: { name: course.title },
            unit_amount: Math.round(course.price * 100),
          },
          quantity: 1,
        })),
        idempotencyKey: `checkout:${newOrder._id}`,
      });
      checkoutSessionId = orderSession.id;

      newOrder.stripeSessionId = orderSession.id;
      newOrder.checkoutExpiresAt = orderSession.expires_at
        ? new Date(orderSession.expires_at * 1000)
        : undefined;
      await newOrder.save();

      if (newOrder.checkoutExpiresAt) {
        await courseEnrollmentLockModel.updateMany(
          {
            _id: { $in: lockIds },
            attemptId,
          },
          {
            expiresAt: newOrder.checkoutExpiresAt,
          }
        );
      }

      return res.status(201).json({
        message: "Order created. Complete payment to enroll.",
        order: newOrder,
        checkoutUrl: orderSession.url,
      });
    }

    await enrolledCoursesModel.create({
      userid: userId,
      courses: orderCourses.map((course) => ({
        courseId: course.courseId,
        selectedSchedule: course.selectedSchedule,
      })),
    });
    enrollmentCreated = true;

    await cartModel.findByIdAndDelete(cartId);
    await courseEnrollmentLockModel.deleteMany({
      _id: { $in: lockIds },
      attemptId,
    });

    return res.status(201).json({
      message: "Order created successfully",
      order: newOrder,
    });
  } catch (error) {
    if (!enrollmentCreated) {
      if (checkoutSessionId) {
        await expireCheckoutSession(checkoutSessionId).catch(() => undefined);
      }
      await courseEnrollmentLockModel.deleteMany({
        _id: { $in: lockIds },
        attemptId,
      });
      if (newOrder) await orderModel.findByIdAndDelete(newOrder._id);
    }

    if (error?.code === 11000) {
      return res.status(409).json({
        message: "One or more courses have already been purchased",
        code: "COURSE_ALREADY_ENROLLED",
      });
    }

    return next(error);
  }
});

export const handleStripeWebhook = async (req, res, next) => {
  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ message: "Missing Stripe signature" });
  }

  let event;
  try {
    event = constructStripeWebhookEvent({
      payload: req.body,
      signature,
    });
  } catch (error) {
    if (error?.message === "Missing STRIPE_WEBHOOK_SECRET configuration") {
      return next(error);
    }
    return res.status(400).json({
      message: "Invalid Stripe webhook signature",
    });
  }

  try {
    const action = classifyStripeEvent(event);
    const checkoutSession = event.data.object;

    if (action === "complete") {
      await completeCardOrder({ checkoutSession });
    } else if (action === "cancel") {
      await cancelCardOrder({ checkoutSession });
    } else if (action === "fail") {
      await failCardOrder({ checkoutSession });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return sendPaymentError(error, res, next);
  }
};

export const paymentSuccess = asyncHandler(async (req, res, next) => {
  const { session_id: sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ message: "Stripe session ID is required" });
  }

  try {
    const checkoutSession = await retrieveCheckoutSession(sessionId);

    if (checkoutSession.payment_status !== "paid") {
      if (
        redirectToFrontend({
          res,
          path: "Cart",
          params: { payment: "pending" },
        })
      ) {
        return;
      }

      return res.status(202).json({
        message: "Payment is still pending",
        paymentStatus: checkoutSession.payment_status,
      });
    }

    const { order, alreadyProcessed } = await completeCardOrder({
      checkoutSession,
    });

    if (
      redirectToFrontend({
        res,
        path: "subscribed-courses",
        params: {
          payment: "success",
          orderId: order._id,
        },
      })
    ) {
      return;
    }

    return res.status(200).json({
      message: "Payment confirmed and enrollment completed",
      alreadyProcessed,
      orderId: order._id,
      status: order.status,
    });
  } catch (error) {
    return sendPaymentError(error, res, next);
  }
});

export const paymentCancel = asyncHandler(async (req, res, next) => {
  const { session_id: sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ message: "Stripe session ID is required" });
  }

  try {
    let checkoutSession = await retrieveCheckoutSession(sessionId);

    if (checkoutSession.payment_status === "paid") {
      const { order } = await completeCardOrder({ checkoutSession });
      return res.status(409).json({
        message: "Payment was already completed and cannot be cancelled",
        code: "PAYMENT_ALREADY_COMPLETED",
        orderId: order._id,
      });
    }

    if (checkoutSession.status === "open") {
      checkoutSession = await expireCheckoutSession(sessionId);
    }

    const { order, alreadyProcessed } = await cancelCardOrder({
      checkoutSession,
    });

    if (
      redirectToFrontend({
        res,
        path: "Cart",
        params: {
          payment: "cancelled",
          orderId: order._id,
        },
      })
    ) {
      return;
    }

    return res.status(200).json({
      message: "Payment cancelled. Your cart has been preserved.",
      alreadyProcessed,
      orderId: order._id,
      status: order.status,
    });
  } catch (error) {
    return sendPaymentError(error, res, next);
  }
});

export const getEnrolledCourses = asyncHandler(async (req, res) => {
  const { _id, role } = req.authuser;

  if (role === "Admin" || role === "Instructor") {
    const allCourses = await courseModel.find({});
    const formattedCourses = allCourses.map((course) => ({
      courseId: course._id,
      title: course.title,
      description: course.description,
      price: course.price,
      image: course.imageurl,
      selectedSchedule: course.schedules[0],
      availableSchedules: course.schedules,
    }));

    return res.status(200).json({
      message: `All courses for ${role}`,
      courses: formattedCourses,
    });
  }

  const enrollmentRecords = await enrolledCoursesModel
    .find({ userid: _id })
    .populate({
      path: "courses.courseId",
      select: "title description price imageurl schedules",
    });

  const seenCourseIds = new Set();
  const formattedCourses = enrollmentRecords.flatMap((enrollment) =>
    enrollment.courses.flatMap((course) => {
      if (!course.courseId) return [];

      const courseId = course.courseId._id.toString();
      if (seenCourseIds.has(courseId)) return [];
      seenCourseIds.add(courseId);

      return [{
        courseId: course.courseId._id,
        title: course.courseId.title,
        description: course.courseId.description,
        price: course.courseId.price,
        image: course.courseId.imageurl,
        selectedSchedule: course.selectedSchedule,
        availableSchedules: course.courseId.schedules,
      }];
    })
  );

  return res.status(200).json({
    message: "Enrolled courses retrieved successfully",
    courses: formattedCourses,
  });
});
