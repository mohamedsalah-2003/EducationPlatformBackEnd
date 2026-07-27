import { courseModel } from "../../../connections/models/course.model.js";
import { scheduleModel } from "../../../connections/models/schedule.model.js";
import { asyncHandler } from "../../utils/errorHandeling.js";
import cloudinary from '../../utils/cloudinaryConfigration.js'
import { leasonModel } from "../../../connections/models/leason.model.js";
import { submittedAssignmentModel } from "../../../connections/models/submittedAssignment.model.js";
import { finalTestModel } from "../../../connections/models/finalTest.model.js";
import { submittedFinalTestModel } from "../../../connections/models/submittedFinalTest.model.js";
import { enrolledCoursesModel } from "../../../connections/models/enrolledcoureces.model.js";
import { userModel } from "../../../connections/models/user.model.js";
import mongoose from "mongoose";
import { courseEnrollmentLockModel } from "../../../connections/models/courseEnrollmentLock.model.js";
// =============== add courses =================//

export const addCourse = asyncHandler(async (req, res, next) => {
  const { title, description, price, schedules, instructorId: requestedInstructorId } = req.body;

  if (!title || !description || !price || !schedules || !Array.isArray(schedules) || schedules.length === 0) {
    return res.status(400).json({
      message: "title, description, price and at least one schedule are required"
    });
  }

  const instructorId =
    req.authuser.role === "Instructor"
      ? req.authuser._id
      : requestedInstructorId || null;

  if (instructorId) {
    if (!mongoose.isValidObjectId(instructorId)) {
      return res.status(400).json({ message: "Invalid instructor ID" });
    }

    const instructor = await userModel.exists({
      _id: instructorId,
      role: "Instructor",
    });

    if (!instructor) {
      return res.status(400).json({ message: "Instructor not found" });
    }
  }

  // Create the course with embedded schedules
  let course;
  try {
    course = await courseModel.create({
      title,
      description,
      price,
      schedules,
      instructorId,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "A course with this title already exists",
        code: "COURSE_ALREADY_EXISTS",
      });
    }
    return next(error);
  }

  res.status(201).json({
    message: "Course added successfully",
    course,
    courseId: course._id
  });
});

export const uploadCoursePic = asyncHandler(async (req, res, next) => {
  const { _id } = req.authuser;
  const { courseId } = req.params;

  if (!req.file) {
    return next(new Error("no file uploaded", { cause: 400 }));
  }

  const { secure_url, public_id } = await cloudinary.uploader.upload(req.file.path, {
    folder: `course/cover/${_id}`,
    use_filename: true,
    unique_filename: false,
    resource_type: 'auto'
  });

  const course = await courseModel.findByIdAndUpdate(courseId, {
    imageurl: { secure_url, public_id }
  }, { new: true });

  if (!course) {
    await cloudinary.uploader.destroy(public_id);
    return next(new Error("Course not found", { cause: 404 }));
  }

  res.status(200).json({ message: 'Image uploaded successfully', course });
});

// =============== show courses =================//

export const getCourses = asyncHandler(async (req, res) => {
  const courses = await courseModel
    .find({})
    .populate('instructorId', 'username');
  res.json(courses);
});

export const assignInstructor = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { instructorId } = req.body;

  if (!mongoose.isValidObjectId(courseId)) {
    return res.status(400).json({ message: "Invalid course ID" });
  }

  if (!mongoose.isValidObjectId(instructorId)) {
    return res.status(400).json({ message: "Invalid instructor ID" });
  }

  const instructor = await userModel.exists({
    _id: instructorId,
    role: "Instructor",
  });

  if (!instructor) {
    return res.status(404).json({ message: "Instructor not found" });
  }

  const course = await courseModel
    .findByIdAndUpdate(
      courseId,
      { instructorId },
      { new: true, runValidators: true }
    )
    .populate('instructorId', 'username');

  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  return res.status(200).json({
    message: "Instructor assigned successfully",
    course,
  });
});


export const deleteCourse = asyncHandler(async (req, res, next) => {
  const { courseId } = req.params;

  const course = await courseModel.findById(courseId);
  if (!course) {
    return res.status(404).json({ message: 'Course not found' });
  }

  // Get all lessons associated with the course
  const lessons = await leasonModel.find({ courseId });
  const lessonIds = lessons.map(lesson => lesson._id);

  // Delete all submitted assignments for the course's lessons
  await submittedAssignmentModel.deleteMany({ lessonId: { $in: lessonIds } });

  // Delete the final test and its submissions
  const finalTest = await finalTestModel.findOne({ courseId });
  if (finalTest) {
    await submittedFinalTestModel.deleteMany({ finalTestId: finalTest._id });
    await finalTestModel.findByIdAndDelete(finalTest._id);
  }

  // Delete all lessons
  await leasonModel.deleteMany({ courseId });

  // Delete all schedules associated with the course
  await scheduleModel.deleteMany({ courseId });

  // Remove course from all enrolled courses
  await enrolledCoursesModel.updateMany(
    { 'courses.courseId': courseId },
    { $pull: { courses: { courseId: courseId } } }
  );

  await courseEnrollmentLockModel.deleteMany({ courseId });

  // Delete the course
  await courseModel.findByIdAndDelete(courseId);

  res.status(200).json({ 
    message: 'Course and all associated data (lessons, assignments, final tests, enrollments) deleted successfully' 
  });
});
