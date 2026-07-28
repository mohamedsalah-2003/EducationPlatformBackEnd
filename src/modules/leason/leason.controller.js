// lesson.controller.js
import { leasonModel } from "../../../connections/models/leason.model.js";
import { asyncHandler } from "../../utils/errorHandeling.js";
import { v2 as cloudinary } from "cloudinary";
import { courseModel } from "../../../connections/models/course.model.js";
import https from 'https';
import { submittedAssignmentModel } from "../../../connections/models/submittedAssignment.model.js";
import { attachLessonSubmissions } from "../../services/lessonSubmissions.js";
import {
  createLessonVideoUploadSignature,
  verifyLessonVideoUpload,
} from "../../services/lessonVideoUpload.js";
import { removeUploadedFile } from "../../utils/uploadCleanup.js";
import { logError } from "../../utils/logger.js";

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
    .select("title description video assignment")
    .lean();
  const lessonIds = courseLessons.map((lesson) => lesson._id);
  const studentSubmissions = await submittedAssignmentModel
    .find({
      userId,
      lessonId: { $in: lessonIds },
    })
    .select("lessonId submittedAt status rating feedback")
    .lean();
  const lessonsWithSubmissions = attachLessonSubmissions(
    courseLessons,
    studentSubmissions
  );

  return res.status(200).json({
    message: "Lessons retrieved successfully",
    courseName: course.title,
    courseId: course._id,
    courseImage: course.imageurl,
    courseDescription: course.description,
    courselessons: lessonsWithSubmissions,
  });
});





// Generate credentials for a browser-to-Cloudinary video upload.
export const getLessonVideoUploadSignature = asyncHandler(async (req, res) => {
  const { lessonId } = req.params;
  const upload = createLessonVideoUploadSignature({ lessonId });

  return res.status(200).json({
    message: "Video upload signature created",
    upload,
  });
});

// Verify the direct upload with Cloudinary before attaching it to a lesson.
export const completeLessonVideoUpload = asyncHandler(async (req, res, next) => {
  const { lessonId } = req.params;
  const { publicId, version, signature } = req.body;
  const video = await verifyLessonVideoUpload({
    lessonId,
    publicId,
    version,
    signature,
  });
  const previousPublicId = req.lesson?.video?.public_id;

  const videoleason = await leasonModel.findByIdAndUpdate(
    lessonId,
    {
      video,
    },
    { new: true, runValidators: true }
  );

  if (!videoleason) {
    await cloudinary.uploader.destroy(video.public_id, {
      resource_type: "video",
    });
    return next(new Error("Lesson not found", { cause: 404 }));
  }

  if (previousPublicId && previousPublicId !== video.public_id) {
    await cloudinary.uploader
      .destroy(previousPublicId, { resource_type: "video" })
      .catch((error) => {
        logError("previous_lesson_video_cleanup_failed", error, {
          lessonId,
        });
      });
  }

  return res.status(200).json({
    message: "Video uploaded successfully",
    lesson: videoleason,
  });
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
  } catch (error) {
    return next(error);
  } finally {
    await removeUploadedFile(req.file);
  }
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
    next(err);
  });
});
