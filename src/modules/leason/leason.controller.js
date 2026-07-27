// lesson.controller.js
import { leasonModel } from "../../../connections/models/leason.model.js";
import { asyncHandler } from "../../utils/errorHandeling.js";
import { v2 as cloudinary } from "cloudinary";
import { courseModel } from "../../../connections/models/course.model.js";
import fs from "fs"; // Needed to remove local file after upload
import https from 'https';

// Add a new lesson to a course
export const addleason = asyncHandler(async (req, res, next) => {
  const { LessonTitle, LessonDescription, courseId } = req.body;

  if (!LessonTitle || !LessonDescription || !courseId) {
    return res
      .status(400)
      .json({ message: "title, description, and courseId are required" });
  }

  const courseCheck = await courseModel.findById(courseId);
  if (!courseCheck) {
    return res.status(400).json({ message: "Invalid course ID" });
  }

  let leason;
  try {
    leason = await leasonModel.create({
      title: LessonTitle,
      description: LessonDescription,
      courseId,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "A lesson with this title already exists in the course",
        code: "LESSON_ALREADY_EXISTS",
      });
    }
    return next(error);
  }

  res.status(201).json({ message: "Lesson added successfully", leason });
});

// Get all lessons for a specific course
export const getLessonsByCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { _id: userId } = req.authuser;

  const course = await courseModel.findById(courseId);

  if (!course) {
    return res.status(404).json({
      message: "Course not found",
    });
  }

  const courseLessons = await leasonModel
    .find({ courseId })
    .select("title description video assignment submissions")
    .populate({
      path: "submissions",
      match: { userId },
    });

  return res.status(200).json({
    message: "Lessons retrieved successfully",
    courseName: course.title,
    courseId: course._id,
    courseImage: course.imageurl,
    courseDescription: course.description,
    courselessons: courseLessons,
  });
});





// Upload video to lesson
export const addvideotoleason = asyncHandler(async (req, res, next) => {
  const { lessonId } = req.params;

  if (!req.file) {
    return next(new Error("No video file uploaded", { cause: 400 }));
  }

  try {
    const { secure_url, public_id, duration, format } =
      await cloudinary.uploader.upload(req.file.path, {
        folder: `leason/video/${lessonId}`,
        use_filename: true,
        unique_filename: false,
        resource_type: "video",
        chunk_size: 6000000,
      });

    const videoleason = await leasonModel.findByIdAndUpdate(
      lessonId,
      {
        video: {
          secure_url,
          public_id,
          duration,
          format,
        },
      },
      { new: true }
    );

    if (!videoleason) {
      await cloudinary.uploader.destroy(public_id);
      return next(new Error("Lesson not found", { cause: 404 }));
    }

    res.status(200).json({
      message: "Video uploaded successfully",
      lesson: videoleason,
    });
  } catch (error) {
    return next(error);
  }
});


export const uploadAssignment = asyncHandler(async (req, res, next) => {
  try {
    const { lessonId } = req.params;
    const { title, description, dueDate } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Upload file to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "assignments", // optional folder in Cloudinary                  
      resource_type: "auto", // auto-detect file type (image, video, raw, etc.)
    });

    // Optionally delete local file after upload
    fs.unlinkSync(req.file.path);

    // Get Cloudinary file URL
    const filePath = result.secure_url;

    const updatedLesson = await leasonModel.findByIdAndUpdate(
      lessonId,
      {
        assignment: {
          filePath,
          title,
          description,
          dueDate: dueDate ? new Date(dueDate) : undefined,
        },
      },
      { new: true }
    );

    if (!updatedLesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    res.status(200).json({
      message: "Assignment uploaded successfully",
      lesson: updatedLesson,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// Submit assignment
export const submitAssignment = asyncHandler(async (req, res, next) => {
  const userId = req.authuser._id;
  const { lessonId } = req.params;

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const lesson = await leasonModel.findById(lessonId);
  if (!lesson) {
    return res.status(404).json({ message: "Lesson not found" });
  }

  if (lesson.assignment?.dueDate && new Date() > lesson.assignment.dueDate) {
    return res
      .status(400)
      .json({ message: "Assignment submission is past due date" });
  }

  const { secure_url, public_id } = await cloudinary.uploader.upload(
    req.file.path,
    {
      folder: `leason/submissions/${lessonId}/${userId}`,
      use_filename: true,
      unique_filename: false,
      resource_type: "auto",
    }
  );

  const updatedLesson = await leasonModel.findByIdAndUpdate(
    lessonId,
    {
      $push: {
        submissions: {
          userId,
          file: { secure_url, public_id },
          submittedAt: new Date(),
        },
      },
    },
    { new: true }
  );

  res.status(200).json({
    message: "Assignment submitted successfully",
    lesson: updatedLesson,
  });
});

// Grade assignment
export const gradeAssignment = asyncHandler(async (req, res, next) => {
  const { lessonId, submissionId } = req.params;
  const { mark, feedback } = req.body;

  if (!mark || mark < 0 || mark > 100) {
    return res.status(400).json({ message: "Valid mark (0-100) is required" });
  }

  const lesson = await leasonModel.findById(lessonId);
  if (!lesson) {
    return res.status(404).json({ message: "Lesson not found" });
  }

  const submission = lesson.submissions.id(submissionId);
  if (!submission) {
    return res.status(404).json({ message: "Submission not found" });
  }

  submission.mark = mark;
  submission.feedback = feedback;
  submission.status = "graded";

  await lesson.save();

  res.status(200).json({
    message: "Assignment graded successfully",
    lesson,
  });
});


export const downloadAssignment = asyncHandler(async (req, res, next) => {
  const { lessonId } = req.params;
  const lesson = await leasonModel
    .findById(lessonId)
    .select("assignment courseId");

  if (!lesson || !lesson.assignment || !lesson.assignment.filePath) {
    return res.status(404).json({ message: "Assignment PDF not found" });
  }

  const fileUrl = lesson.assignment.filePath;

  // نجيب الملف من URL خارجي (زي Cloudinary)
  https.get(fileUrl, (fileRes) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=assignment.pdf');
    fileRes.pipe(res);
  }).on('error', (err) => {
    console.error('File download error:', err);
    res.status(500).json({ message: 'Failed to download assignment file.' });
  });
});
