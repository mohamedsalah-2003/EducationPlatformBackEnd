import { cartModel } from "../../../connections/models/cart.model.js";
import { courseModel } from "../../../connections/models/course.model.js";
import { enrolledCoursesModel } from "../../../connections/models/enrolledcoureces.model.js";
import { courseEnrollmentLockModel } from "../../../connections/models/courseEnrollmentLock.model.js";
import { asyncHandler } from "../../utils/errorHandeling.js";
import mongoose from "mongoose";

// ======================= GET Cart ==================
export const getCart = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;

  const cart = await cartModel.findOne({ userId: _id })
    .populate('courses.courseId');

  if (!cart) {
    return res.status(404).json({ message: 'Cart not found' });
  }

  const enrollmentRecords = await enrolledCoursesModel
    .find({ userid: _id })
    .select("courses.courseId")
    .lean();
  const enrolledIds = new Set(
    enrollmentRecords.flatMap((record) =>
      record.courses.map((course) => course.courseId.toString())
    )
  );
  const seenCourseIds = new Set();
  const validCourses = cart.courses.filter((item) => {
    if (!item.courseId) return false;
    const courseId = item.courseId._id.toString();
    if (seenCourseIds.has(courseId) || enrolledIds.has(courseId)) return false;
    seenCourseIds.add(courseId);
    return true;
  });

  if (validCourses.length !== cart.courses.length) {
    cart.courses = validCourses;
    cart.total = validCourses.reduce(
      (sum, item) => sum + Number(item.courseId?.price ?? 0),
      0
    );
    await cart.save();
  }

  res.status(200).json({ message: 'Cart fetched successfully', cart });
});

// ======================= Add to Cart ==================
export const addToCart = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  const userId = _id;
  const { courseId, schedule } = req.body;

  if (!courseId || !schedule || !schedule.day || !schedule.time) {
    return res.status(400).json({ message: "courseId and schedule (day and time) are required" });
  }

  if (!mongoose.isValidObjectId(courseId)) {
    return res.status(400).json({ message: "Invalid course ID" });
  }

  const courseCheck = await courseModel.findById(courseId);
  if (!courseCheck) {
    return next(new Error("Invalid course ID", { cause: 400 }));
  }

  // Verify that the schedule exists in the course
  const scheduleExists = courseCheck.schedules.some(
    s => s.day === schedule.day && s.time === schedule.time
  );

  if (!scheduleExists) {
    return next(new Error("Invalid schedule for this course", { cause: 400 }));
  }

  const enrollmentLockId = `${userId}:${courseId}`;
  const [existingEnrollment, existingEnrollmentLock] = await Promise.all([
    enrolledCoursesModel.exists({
      userid: userId,
      "courses.courseId": courseId,
    }),
    courseEnrollmentLockModel.exists({ _id: enrollmentLockId }),
  ]);

  if (existingEnrollment || existingEnrollmentLock) {
    return res.status(409).json({
      message: "You are already enrolled in this course",
      code: "COURSE_ALREADY_ENROLLED",
    });
  }

  let userCart = await cartModel.findOne({ userId });

  if (userCart) {
    const updatedCart = await cartModel.findOneAndUpdate(
      {
        _id: userCart._id,
        "courses.courseId": { $ne: courseId },
      },
      {
        $push: { courses: { courseId, schedule } },
        $inc: { total: courseCheck.price },
      },
      { new: true, runValidators: true }
    );

    if (!updatedCart) {
      return res.status(409).json({
        message: "Course already in cart",
        code: "COURSE_ALREADY_IN_CART",
      });
    }

    return res.status(200).json({ message: "Course added to cart", cart: updatedCart });
  } else {
    const cartObject = {
      userId,
      courses: [{ courseId, schedule }],
      total: courseCheck.price,
    };

    try {
      const cartDB = await cartModel.create(cartObject);
      return res.status(201).json({ message: "Cart created", cart: cartDB });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          message: "Course already in cart",
          code: "COURSE_ALREADY_IN_CART",
        });
      }
      return next(error);
    }
  }
});

// ======================= Delete Course from Cart ==================
export const deleteCourseFromCart = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  const userId = _id;
  const { courseId } = req.body;

  const courseCheck = await courseModel.findById(courseId);
  if (!courseCheck) {
    return next(new Error("Invalid course ID", { cause: 400 }));
  }

  const userCart = await cartModel.findOne({ userId, "courses.courseId": courseId });
  if (!userCart) {
    return next(new Error("Course not found in cart", { cause: 404 }));
  }

  const courseIndex = userCart.courses.findIndex(
    (item) => item.courseId.toString() === courseId
  );

  if (courseIndex === -1) {
    return next(new Error("Course not found in cart", { cause: 404 }));
  }

  userCart.courses.splice(courseIndex, 1);
  userCart.total -= courseCheck.price;

  await userCart.save();

  res.status(200).json({ message: "Course removed from cart", cart: userCart });
});

// ======================= Clear Cart ==================
export const clearCart = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;

  const cart = await cartModel.findOne({ userId: _id });

  if (!cart) {
    return res.status(404).json({ message: "Cart not found" });
  }

  cart.courses = [];
  cart.total = 0;
  await cart.save();

  return res.status(200).json({ message: "Cart cleared successfully", cart });
});
