import mongoose from "mongoose";
import { courseModel } from "../../connections/models/course.model.js";
import { enrolledCoursesModel } from "../../connections/models/enrolledcoureces.model.js";
import { finalTestModel } from "../../connections/models/finalTest.model.js";
import { leasonModel } from "../../connections/models/leason.model.js";
import { submittedAssignmentModel } from "../../connections/models/submittedAssignment.model.js";
import { submittedFinalTestModel } from "../../connections/models/submittedFinalTest.model.js";

const isAdmin = (role) => role === "Admin";
const isInstructor = (role) => role === "Instructor";

const ownsCourse = ({ userId, course }) =>
  Boolean(
    course.instructorId &&
      course.instructorId.toString() === userId.toString()
  );

const isEnrolledInCourse = async ({ userId, courseId }) => {
  const enrollment = await enrolledCoursesModel.exists({
    userid: userId,
    "courses.courseId": courseId,
  });

  return Boolean(enrollment);
};

const findCourseForAccess = async ({ courseId, res }) => {
  if (!mongoose.isValidObjectId(courseId)) {
    res.status(400).json({ message: "Invalid course ID" });
    return null;
  }

  const course = await courseModel
    .findById(courseId)
    .select("_id instructorId");

  if (!course) {
    res.status(404).json({ message: "Course not found" });
    return null;
  }

  return course;
};

const authorizeCourseManagement = async ({ req, res, next, courseId }) => {
  const course = await findCourseForAccess({ courseId, res });
  if (!course) return;

  const { _id: userId, role } = req.authuser;

  if (isAdmin(role) || (isInstructor(role) && ownsCourse({ userId, course }))) {
    req.course = course;
    return next();
  }

  return res.status(403).json({
    message: "You can only manage courses assigned to you",
  });
};

const authorizeCourseContentAccess = async ({ req, res, next, courseId }) => {
  const course = await findCourseForAccess({ courseId, res });
  if (!course) return;

  const { _id: userId, role } = req.authuser;

  if (isAdmin(role) || (isInstructor(role) && ownsCourse({ userId, course }))) {
    req.course = course;
    return next();
  }

  if (role !== "User") {
    return res.status(403).json({ message: "Course access denied" });
  }

  const hasAccess = await isEnrolledInCourse({ userId, courseId: course._id });

  if (!hasAccess) {
    return res.status(403).json({
      message: "You must enroll in this course to access its content",
    });
  }

  req.course = course;
  return next();
};

const findLesson = async ({ lessonId, res }) => {
  if (!mongoose.isValidObjectId(lessonId)) {
    res.status(400).json({ message: "Invalid lesson ID" });
    return null;
  }

  const lesson = await leasonModel.findById(lessonId).select("courseId assignment");

  if (!lesson) {
    res.status(404).json({ message: "Lesson not found" });
    return null;
  }

  return lesson;
};

export const requireCourseAccess = () => {
  return async (req, res, next) => {
    try {
      return await authorizeCourseContentAccess({
        req,
        res,
        next,
        courseId: req.params.courseId,
      });
    } catch (error) {
      return next(error);
    }
  };
};

export const requireLessonAccess = () => {
  return async (req, res, next) => {
    try {
      const lesson = await findLesson({ lessonId: req.params.lessonId, res });
      if (!lesson) return;

      req.lesson = lesson;
      return await authorizeCourseContentAccess({
        req,
        res,
        next,
        courseId: lesson.courseId,
      });
    } catch (error) {
      return next(error);
    }
  };
};

export const requireCourseManagement = ({ source = "params" } = {}) => {
  return async (req, res, next) => {
    try {
      const courseId =
        source === "body" ? req.body.courseId : req.params.courseId;

      return await authorizeCourseManagement({
        req,
        res,
        next,
        courseId,
      });
    } catch (error) {
      return next(error);
    }
  };
};

export const requireLessonManagement = () => {
  return async (req, res, next) => {
    try {
      const lesson = await findLesson({ lessonId: req.params.lessonId, res });
      if (!lesson) return;

      req.lesson = lesson;
      return await authorizeCourseManagement({
        req,
        res,
        next,
        courseId: lesson.courseId,
      });
    } catch (error) {
      return next(error);
    }
  };
};

export const requireAssignmentSubmissionManagement = () => {
  return async (req, res, next) => {
    try {
      const { submissionId } = req.params;
      if (!mongoose.isValidObjectId(submissionId)) {
        return res.status(400).json({ message: "Invalid submission ID" });
      }

      const submission = await submittedAssignmentModel
        .findById(submissionId)
        .select("lessonId");

      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }

      const lesson = await leasonModel
        .findById(submission.lessonId)
        .select("courseId");

      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }

      req.submission = submission;
      return await authorizeCourseManagement({
        req,
        res,
        next,
        courseId: lesson.courseId,
      });
    } catch (error) {
      return next(error);
    }
  };
};

export const requireFinalTestSubmissionManagement = () => {
  return async (req, res, next) => {
    try {
      const { submissionId } = req.params;
      if (!mongoose.isValidObjectId(submissionId)) {
        return res.status(400).json({ message: "Invalid submission ID" });
      }

      const submission = await submittedFinalTestModel
        .findById(submissionId)
        .select("finalTestId");

      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }

      const finalTest = await finalTestModel
        .findById(submission.finalTestId)
        .select("courseId");

      if (!finalTest) {
        return res.status(404).json({ message: "Final test not found" });
      }

      req.submission = submission;
      return await authorizeCourseManagement({
        req,
        res,
        next,
        courseId: finalTest.courseId,
      });
    } catch (error) {
      return next(error);
    }
  };
};

export const getManagedCourseIds = async (authUser) => {
  if (isAdmin(authUser.role)) return null;
  if (!isInstructor(authUser.role)) return [];

  return courseModel.distinct("_id", { instructorId: authUser._id });
};
